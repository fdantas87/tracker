import "server-only"

import { revealSecret } from "@/lib/crypto/vault"
import { createServiceClient } from "@/lib/supabase/service"
import { META_GRAPH_API_BASE, META_REQUEST_TIMEOUT_MS } from "./constants"

/**
 * Envio de eventos pela Conversions API do Meta.
 *
 * Documentação:
 * https://developers.facebook.com/docs/marketing-api/conversions-api
 * https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 *
 * Regras que a doc é explícita e que erram silenciosamente se forem quebradas:
 * - dados pessoais vão HASHEADOS (sha256): em, ph, fn, ln, ct, st, country,
 *   external_id. Os hashes chegam prontos aqui (gravados no identify) ou são
 *   calculados na hora a partir do geo.
 * - fbp, fbc, client_ip_address e client_user_agent vão em TEXTO PURO. Hashear
 *   esses quatro não dá erro nenhum: só derruba a correspondência a zero.
 * - event_id tem que ser o MESMO usado no fbq do navegador, senão o Meta conta
 *   o evento duas vezes em vez de deduplicar.
 */

export type MetaUserData = {
  emailHash?: string | null
  phoneHash?: string | null
  firstNameHash?: string | null
  lastNameHash?: string | null
  cityHash?: string | null
  stateHash?: string | null
  countryHash?: string | null
  externalIdHash?: string | null
  /** Texto puro, nunca hasheado. */
  fbp?: string | null
  fbc?: string | null
  clientIpAddress?: string | null
  clientUserAgent?: string | null
}

export type MetaCustomData = {
  value?: number | null
  currency?: string | null
  contentIds?: string[] | null
  contentName?: string | null
  contentType?: string | null
  orderId?: string | null
}

export type MetaEventInput = {
  eventName: string
  eventId: string
  /** Unix em segundos. */
  eventTime: number
  eventSourceUrl?: string | null
  /**
   * "website" para o que nasce no navegador; a compra do webhook também usa
   * "website" porque a conversão aconteceu num checkout web.
   */
  actionSource?: string
  userData: MetaUserData
  customData?: MetaCustomData | null
  testEventCode?: string | null
}

export type MetaDispatchResult = {
  pixelId: string
  label: string
  ok: boolean
  status: number | null
  response: unknown
}

export type MetaDispatch = {
  /** Payload enviado (SEM o access_token — ele nunca vai pro log). */
  payload: Record<string, unknown> | null
  results: MetaDispatchResult[]
}

export type MetaBatchDispatch = {
  /** O objeto de CADA evento, pra gravar em events_log.payload_meta linha a linha. */
  perEvent: { eventId: string; payload: Record<string, unknown> }[]
  /** Uma entrada por pixel: a resposta vale pro lote inteiro. */
  results: MetaDispatchResult[]
}

/** Só inclui a chave se houver valor: campo vazio piora a correspondência. */
function compact<T extends Record<string, unknown>>(source: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0)
    )
  ) as Partial<T>
}

/**
 * Monta UM evento (o objeto que entra no array `data`).
 *
 * Separado de `buildMetaPayload` porque o envio em lote da fase 7.5 precisa de
 * N eventos dentro de uma requisição só — e cada evento precisa ser gravado
 * individualmente em `events_log.payload_meta`, não o lote inteiro.
 */
export function buildMetaEvent(input: MetaEventInput): Record<string, unknown> {
  const userData = compact({
    em: input.userData.emailHash,
    ph: input.userData.phoneHash,
    fn: input.userData.firstNameHash,
    ln: input.userData.lastNameHash,
    ct: input.userData.cityHash,
    st: input.userData.stateHash,
    country: input.userData.countryHash,
    external_id: input.userData.externalIdHash,
    // Daqui pra baixo, texto puro por exigência do Meta.
    fbp: input.userData.fbp,
    fbc: input.userData.fbc,
    client_ip_address: input.userData.clientIpAddress,
    client_user_agent: input.userData.clientUserAgent,
  })

  const customData = input.customData
    ? compact({
        value: input.customData.value,
        currency: input.customData.currency,
        content_ids: input.customData.contentIds,
        content_name: input.customData.contentName,
        content_type: input.customData.contentType,
        order_id: input.customData.orderId,
      })
    : null

  return compact({
    event_name: input.eventName,
    event_time: input.eventTime,
    event_id: input.eventId,
    event_source_url: input.eventSourceUrl,
    action_source: input.actionSource ?? "website",
    user_data: userData,
    custom_data: customData && Object.keys(customData).length > 0 ? customData : null,
  })
}

export function buildMetaPayload(input: MetaEventInput): Record<string, unknown> {
  return compact({
    data: [buildMetaEvent(input)],
    test_event_code: input.testEventCode,
  })
}

/**
 * Manda o evento para TODOS os pixels ativos e devolve a resposta de cada um.
 *
 * Um pixel que falha não afeta os outros (Promise.allSettled) e nunca lança
 * pra fora: indisponibilidade do Meta não pode derrubar a captura do site.
 */
export async function sendToAllPixels(
  input: MetaEventInput
): Promise<MetaDispatch> {
  const supabase = createServiceClient()

  const { data: pixels, error } = await supabase
    .from("meta_pixels")
    .select("*")
    .eq("is_active", true)

  if (error || !pixels || pixels.length === 0) {
    return { payload: null, results: [] }
  }

  const payload = buildMetaPayload(input)

  const settled = await Promise.allSettled(
    pixels.map((pixel) => sendToPixel(pixel, payload))
  )

  const results = settled.map((outcome, index): MetaDispatchResult => {
    const pixel = pixels[index]
    if (outcome.status === "fulfilled") return outcome.value

    return {
      pixelId: String(pixel.pixel_id),
      label: String(pixel.label),
      ok: false,
      status: null,
      response: { error: String(outcome.reason).slice(0, 300) },
    }
  })

  return { payload, results }
}

/**
 * Envia um LOTE de eventos (já fatiado pelo chamador, no máximo
 * META_MAX_EVENTS_PER_REQUEST) para todos os pixels ativos.
 *
 * Usado pela fila da fase 7.5. Uma requisição por pixel carrega todos os
 * eventos do lote; o Meta responde por REQUISIÇÃO, então o resultado vale pro
 * lote inteiro — é por isso que `perEvent` devolve o objeto de cada evento
 * separadamente, pra cada linha de `events_log` guardar o seu próprio payload
 * em vez de uma cópia do lote todo.
 */
export async function sendBatchToAllPixels(
  inputs: MetaEventInput[],
  testEventCode: string | null
): Promise<MetaBatchDispatch> {
  if (inputs.length === 0) return { perEvent: [], results: [] }

  const supabase = createServiceClient()

  const { data: pixels, error } = await supabase
    .from("meta_pixels")
    .select("*")
    .eq("is_active", true)

  if (error || !pixels || pixels.length === 0) {
    return { perEvent: [], results: [] }
  }

  const perEvent = inputs.map((input) => ({
    eventId: input.eventId,
    payload: buildMetaEvent(input),
  }))

  const payload = compact({
    data: perEvent.map((entry) => entry.payload),
    test_event_code: testEventCode,
  })

  const settled = await Promise.allSettled(
    pixels.map((pixel) => sendToPixel(pixel, payload))
  )

  const results = settled.map((outcome, index): MetaDispatchResult => {
    const pixel = pixels[index]
    if (outcome.status === "fulfilled") return outcome.value

    return {
      pixelId: String(pixel.pixel_id),
      label: String(pixel.label),
      ok: false,
      status: null,
      response: { error: String(outcome.reason).slice(0, 300) },
    }
  })

  return { perEvent, results }
}

async function sendToPixel(
  pixel: Record<string, unknown>,
  payload: Record<string, unknown>
): Promise<MetaDispatchResult> {
  const pixelId = String(pixel.pixel_id)
  const label = String(pixel.label)

  try {
    const accessToken = await revealSecret(String(pixel.capi_token_vault_id))

    const response = await fetch(`${META_GRAPH_API_BASE}/${pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // O token entra só aqui, no corpo do envio. Ele nunca volta pro objeto
      // `payload` que é gravado em events_log.
      body: JSON.stringify({ ...payload, access_token: accessToken }),
      signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
      cache: "no-store",
    })

    const body = await response.json().catch(() => null)

    return {
      pixelId,
      label,
      ok: response.ok && !(body && body.error),
      status: response.status,
      response: body,
    }
  } catch (error) {
    return {
      pixelId,
      label,
      ok: false,
      status: null,
      response: {
        error:
          error instanceof Error && error.name === "TimeoutError"
            ? "timeout"
            : "falha de rede",
      },
    }
  }
}
