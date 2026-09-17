import "server-only"

import {
  hashCity,
  hashCountry,
  hashExternalId,
  hashState,
} from "@/lib/crypto/hash"
import { sendToAllPixels, type MetaCustomData } from "@/lib/meta/capi"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * Orquestra o envio de um evento de navegador para a Conversions API.
 *
 * Roda depois que a resposta já foi devolvida ao site (via `after()` do Next),
 * então a latência do Meta não atrasa o carregamento da página. Nada aqui pode
 * lançar: uma falha de envio é registrada no log do evento, nunca propagada.
 *
 * GA4 NÃO entra aqui de propósito: os eventos do navegador já vão pela gtag, e
 * repetir pelo Measurement Protocol contaria tudo em dobro no GA4. O MP é
 * reservado pra compra do webhook (fase 7). Ver lib/ga4/mp.ts.
 */

export type DispatchEventParams = {
  trckUserId: string
  eventId: string
  eventName: string
  eventSourceUrl?: string | null
  customData?: MetaCustomData | null
}

export async function dispatchBrowserEvent(
  params: DispatchEventParams
): Promise<void> {
  try {
    const supabase = createServiceClient()

    // Enriquecimento: o que o navegador manda é pouco; a qualidade da
    // correspondência no Meta vem dos dados acumulados no visitante.
    const { data: visitor } = await supabase
      .from("visitors")
      .select("*")
      .eq("trck_user_id", params.trckUserId)
      .maybeSingle()

    const { data: settings } = await supabase
      .from("settings")
      .select("test_event_code")
      .eq("id", true)
      .maybeSingle()

    const dispatch = await sendToAllPixels({
      eventName: params.eventName,
      eventId: params.eventId,
      eventTime: Math.floor(Date.now() / 1000),
      eventSourceUrl: params.eventSourceUrl,
      actionSource: "website",
      testEventCode: settings?.test_event_code ?? null,
      customData: params.customData ?? null,
      userData: {
        // Hashes já calculados na captura (/api/identify).
        emailHash: visitor?.email_hash ?? null,
        phoneHash: visitor?.phone_hash ?? null,
        firstNameHash: visitor?.first_name_hash ?? null,
        lastNameHash: visitor?.last_name_hash ?? null,
        // Geo é guardado em texto e hasheado só na hora do envio.
        cityHash: hashCity(visitor?.geo_city),
        stateHash: hashState(visitor?.geo_region),
        countryHash: hashCountry(visitor?.geo_country),
        externalIdHash: hashExternalId(params.trckUserId),
        // Texto puro por exigência do Meta.
        fbp: visitor?.fbp ?? null,
        fbc: visitor?.fbc ?? null,
        clientIpAddress: visitor?.ip ?? null,
        clientUserAgent: visitor?.user_agent ?? null,
      },
    })

    if (dispatch.results.length === 0) {
      // Nenhum pixel ativo: registra pra não parecer que o envio sumiu.
      await recordDispatch(params.eventId, null, {
        note: "nenhum pixel ativo configurado",
      })
      return
    }

    await recordDispatch(params.eventId, dispatch.payload, dispatch.results)
  } catch (error) {
    await recordDispatch(params.eventId, null, {
      error: error instanceof Error ? error.message : "falha inesperada",
    }).catch(() => {})
  }
}

/**
 * Guarda o payload enviado e a resposta de CADA destino no log do evento.
 *
 * É esse par que a tela de Eventos (fase 8) mostra no modal, e é o que permite
 * responder "esse evento chegou no Meta?" sem depender do Events Manager. O
 * job de retenção (fase 2) zera estes campos depois de 14 dias.
 */
async function recordDispatch(
  eventId: string,
  payload: unknown,
  response: unknown
): Promise<void> {
  const supabase = createServiceClient()
  await supabase
    .from("events_log")
    .update({
      payload_meta: payload ?? null,
      response_meta: response ?? null,
    })
    .eq("event_id", eventId)
}
