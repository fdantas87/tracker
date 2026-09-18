import "server-only"

import { revealSecret } from "@/lib/crypto/vault"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * Envio pelo Measurement Protocol do GA4.
 *
 * Doc: https://developers.google.com/analytics/devguides/collection/protocol/ga4
 *
 * QUANDO USAR — e isto é o ponto mais importante deste arquivo:
 * o Measurement Protocol serve SÓ para o evento que nasce FORA do navegador,
 * que neste sistema é a compra chegando pelo webhook. Os eventos do site
 * (page_view etc.) já são enviados pela gtag, no navegador. Mandar os mesmos
 * eventos de novo por aqui contaria tudo em dobro no GA4 e estragaria os
 * relatórios — o MP aqui AUMENTA a coleta com o evento offline, não repete a
 * que já existe. Por isso `/api/event` não chama este módulo; só o webhook
 * de compra (fase 7) chama.
 *
 * ATRIBUIÇÃO DE SESSÃO: reusar o `client_id` (cookie _ga) e o `session_id`
 * capturados na visita faz a compra cair na sessão certa. Limitação conhecida
 * do GA4: a sessão expira com ~30 min de inatividade, então uma compra que
 * chega muito depois da visita pode não casar com a sessão original. Isso é
 * do ecossistema, não do código.
 *
 * GEOLOCALIZAÇÃO — `ip_override` NÃO É OPCIONAL AQUI. O GA4 deriva a geografia
 * do IP de QUEM FEZ A CHAMADA. Num envio server-side esse IP é o da função na
 * Vercel, não o do comprador: sem `ip_override` toda venda confirmada pelo
 * webhook cai na região do datacenter, e o relatório de geografia passa a
 * mentir justamente na métrica que mais importa (receita por região).
 *
 * Por que `ip_override` e não `user_location`: com o IP, o Google usa a própria
 * base de geo — a MESMA que usa nos eventos que chegam pela gtag —, então os
 * dois caminhos concordam. Com `user_location` a geografia passaria a vir da
 * base da Vercel e os relatórios misturariam duas fontes. Os dois campos não
 * convivem: a doc é explícita que `user_location`, quando presente, tem
 * precedência e o `ip_override` é ignorado. Por isso só um é enviado.
 */

export type Ga4Item = {
  itemId?: string | null
  itemName?: string | null
  price?: number | null
  quantity?: number | null
}

export type Ga4EventInput = {
  /** Cookie _ga do visitante. Sem ele o GA4 recusa o evento. */
  clientId: string
  eventName: string
  /** Sessão capturada na visita, pra compra cair na sessão certa. */
  sessionId?: string | null
  /**
   * IP do VISITANTE, capturado na visita. Ver a nota de geolocalização no topo
   * do módulo: sem ele a compra é geolocalizada no datacenter da Vercel.
   */
  ipOverride?: string | null
  value?: number | null
  currency?: string | null
  transactionId?: string | null
  items?: Ga4Item[] | null
  /** Quando ligado, o evento aparece no DebugView do GA4. */
  debug?: boolean
}

export type Ga4DispatchResult = {
  measurementId: string
  label: string
  ok: boolean
  status: number | null
  response: unknown
}

export type Ga4Dispatch = {
  /** Payload enviado (sem o api_secret, que nunca vai pro log). */
  payload: Record<string, unknown> | null
  results: Ga4DispatchResult[]
}

const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect"
const GA4_TIMEOUT_MS = 10_000

export function buildGa4Payload(input: Ga4EventInput): Record<string, unknown> {
  const params: Record<string, unknown> = {
    // Sem engagement_time_msec o GA4 aceita o evento mas não o conta como
    // engajamento, e ele some de boa parte dos relatórios.
    engagement_time_msec: 1,
  }

  if (input.sessionId) params.session_id = input.sessionId
  if (input.value !== null && input.value !== undefined) params.value = input.value
  if (input.currency) params.currency = input.currency
  if (input.transactionId) params.transaction_id = input.transactionId
  if (input.debug) params.debug_mode = 1

  if (input.items && input.items.length > 0) {
    params.items = input.items.map((item) => ({
      item_id: item.itemId ?? undefined,
      item_name: item.itemName ?? undefined,
      price: item.price ?? undefined,
      quantity: item.quantity ?? 1,
    }))
  }

  // `ip_override` vai no TOPO do corpo, ao lado de client_id — não dentro de
  // `params`. Dentro de params ele seria tratado como um parâmetro qualquer do
  // evento e a geolocalização continuaria errada, sem erro nenhum aparecer.
  return {
    client_id: input.clientId,
    ...(input.ipOverride ? { ip_override: input.ipOverride } : {}),
    events: [{ name: input.eventName, params }],
  }
}

/**
 * Manda para TODAS as propriedades GA4 ativas.
 *
 * Atenção ao interpretar o resultado: o endpoint de coleta do GA4 devolve 204
 * mesmo com credencial errada — `ok: true` aqui significa "o Google aceitou a
 * requisição", não "a credencial está correta". A única confirmação real é ver
 * o evento no DebugView (ver o teste de conexão na fase 4).
 */
export async function sendToAllGa4(
  input: Ga4EventInput
): Promise<Ga4Dispatch> {
  const supabase = createServiceClient()

  const { data: accounts, error } = await supabase
    .from("ga4_accounts")
    .select("*")
    .eq("is_active", true)

  if (error || !accounts || accounts.length === 0) {
    return { payload: null, results: [] }
  }

  if (!input.clientId) {
    return {
      payload: null,
      results: accounts.map((account) => ({
        measurementId: String(account.measurement_id),
        label: String(account.label),
        ok: false,
        status: null,
        response: {
          error:
            "sem client_id (_ga) do visitante — o GA4 exige e o evento não pôde ser enviado",
        },
      })),
    }
  }

  const payload = buildGa4Payload(input)

  const settled = await Promise.allSettled(
    accounts.map((account) => sendToGa4Account(account, payload))
  )

  const results = settled.map((outcome, index): Ga4DispatchResult => {
    const account = accounts[index]
    if (outcome.status === "fulfilled") return outcome.value

    return {
      measurementId: String(account.measurement_id),
      label: String(account.label),
      ok: false,
      status: null,
      response: { error: String(outcome.reason).slice(0, 300) },
    }
  })

  return { payload, results }
}

async function sendToGa4Account(
  account: Record<string, unknown>,
  payload: Record<string, unknown>
): Promise<Ga4DispatchResult> {
  const measurementId = String(account.measurement_id)
  const label = String(account.label)

  try {
    const apiSecret = await revealSecret(String(account.api_secret_vault_id))

    const url = new URL(GA4_ENDPOINT)
    url.searchParams.set("measurement_id", measurementId)
    url.searchParams.set("api_secret", apiSecret)

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(GA4_TIMEOUT_MS),
      cache: "no-store",
    })

    return {
      measurementId,
      label,
      // 204 é o sucesso esperado. Ver a ressalva no comentário de sendToAllGa4.
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      response: { note: "GA4 devolve 204 sem corpo, mesmo com credencial errada" },
    }
  } catch (error) {
    return {
      measurementId,
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
