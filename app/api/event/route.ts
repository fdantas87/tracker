import { after } from "next/server"

import { jsonResponse, preflightResponse } from "@/lib/cors"
import { dispatchBrowserEvent } from "@/lib/dispatch/event-dispatch"
import { getGeo, toInetOrNull } from "@/lib/geo"
import {
  CAPTURE_RULE,
  checkRateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit"
import type { MetaCustomData } from "@/lib/meta/capi"
import { createServiceClient } from "@/lib/supabase/service"
import {
  LIMITS,
  cleanAmount,
  cleanEventName,
  cleanJson,
  cleanString,
  cleanStringArray,
  cleanUrl,
  cleanUtms,
  readJsonBody,
} from "@/lib/validation"

/**
 * POST /api/event
 *
 * Registra um evento em `events_log`.
 *
 * O `event_id` é OBRIGATÓRIO e nasce no navegador — o mesmo id vai pro
 * `fbq(..., { eventID })` e pra cá. É isso que permite o Meta deduplicar o
 * evento do Pixel com o da Conversions API. Se o servidor gerasse um id
 * próprio, os dois lados nunca casariam e todo evento contaria em dobro.
 * Por isso aqui ele é validado, nunca inventado.
 *
 * O disparo pro Meta e pro GA4 entra na fase 6. Nesta fase o evento é só
 * capturado e guardado.
 */

export async function OPTIONS(request: Request) {
  return preflightResponse(request)
}

export async function POST(request: Request) {
  const geo = getGeo(request.headers)

  const limit = await checkRateLimit("event", geo.ip ?? "sem-ip", CAPTURE_RULE)
  if (!limit.allowed) {
    return jsonResponse(
      request,
      { error: "rate_limited" },
      429,
      rateLimitHeaders(limit)
    )
  }

  const body = await readJsonBody(request)
  if (!body) {
    return jsonResponse(request, { error: "invalid_body" }, 400)
  }

  const eventId = cleanString(body.event_id, LIMITS.id)
  const eventName = cleanEventName(body.event_name)
  const trckUserId = cleanString(body.trck_user_id, LIMITS.id)

  if (!eventId) {
    return jsonResponse(
      request,
      { error: "event_id_required", detail: "O event_id precisa ser gerado no navegador." },
      400
    )
  }
  if (!eventName) {
    return jsonResponse(request, { error: "invalid_event_name" }, 400)
  }
  if (!trckUserId) {
    return jsonResponse(request, { error: "trck_user_id_required" }, 400)
  }

  const utms = cleanUtms(body)
  const customData = cleanJson(body.custom_data)
  const eventSourceUrl = cleanUrl(body.event_source_url)

  try {
    const supabase = createServiceClient()

    // `events_log.trck_user_id` tem FK pra `visitors`. Um evento pode chegar
    // antes do identify (corrida de rede, aba restaurada), então garantimos a
    // linha mínima do visitante em vez de descartar o evento.
    const { error: visitorError } = await supabase.from("visitors").upsert(
      {
        trck_user_id: trckUserId,
        ip: toInetOrNull(geo.ip),
        user_agent: cleanString(
          request.headers.get("user-agent"),
          LIMITS.userAgent
        ),
        geo_country: geo.country,
        geo_region: geo.region,
        geo_city: geo.city,
      },
      { onConflict: "trck_user_id", ignoreDuplicates: true }
    )

    if (visitorError) {
      return jsonResponse(request, { error: "persist_failed" }, 500)
    }

    // O event_id é UNIQUE: reenvio do mesmo evento (retry do navegador,
    // keepalive duplicado) não vira linha duplicada. `ignoreDuplicates` faz o
    // insert virar "on conflict do nothing".
    const { data, error } = await supabase
      .from("events_log")
      .upsert(
        {
          trck_user_id: trckUserId,
          event_name: eventName,
          event_id: eventId,
          ...utms,
          // payload_meta guarda o que veio do navegador até a fase 6 preencher
          // com o payload real enviado à Conversions API.
          payload_meta: customData
            ? { custom_data: customData, event_source_url: eventSourceUrl }
            : null,
          ip: toInetOrNull(geo.ip),
          geo_country: geo.country,
          geo_region: geo.region,
          geo_city: geo.city,
        },
        { onConflict: "event_id", ignoreDuplicates: true }
      )
      .select("id")

    if (error) {
      return jsonResponse(request, { error: "persist_failed" }, 500)
    }

    // Sem linha devolvida = era duplicata. O cliente não precisa saber a
    // diferença, mas devolvemos pra facilitar depuração.
    const duplicated = !data || data.length === 0

    // Dispara pro Meta DEPOIS de responder: `after()` do Next roda o callback
    // com a resposta já entregue, então a ida e volta até o Meta não atrasa o
    // carregamento da página. Diferente de um fire-and-forget solto, a Vercel
    // mantém a função viva até este trabalho terminar.
    //
    // Duplicata não redispara: o evento original já foi (ou está sendo)
    // enviado, e reenviar seria contar duas vezes.
    if (!duplicated) {
      after(async () => {
        await dispatchBrowserEvent({
          trckUserId,
          eventId,
          eventName,
          eventSourceUrl,
          customData: toMetaCustomData(customData),
        })
      })
    }

    return jsonResponse(
      request,
      { ok: true, event_id: eventId, duplicated },
      200,
      rateLimitHeaders(limit)
    )
  } catch {
    return jsonResponse(request, { error: "persist_failed" }, 500)
  }
}

/**
 * Converte o `custom_data` solto que veio do navegador nos campos que a
 * Conversions API entende. Só passa o que reconhecemos e validamos — o resto
 * do objeto fica guardado no log, mas não é repassado ao Meta.
 */
function toMetaCustomData(
  customData: Record<string, unknown> | null
): MetaCustomData | null {
  if (!customData) return null

  const mapped: MetaCustomData = {
    value: cleanAmount(customData.value),
    currency: cleanString(customData.currency, 8),
    contentIds: cleanStringArray(customData.content_ids),
    contentName: cleanString(customData.content_name),
    contentType: cleanString(customData.content_type, 32),
    orderId: cleanString(customData.order_id, LIMITS.id),
  }

  const hasValue = Object.values(mapped).some(
    (value) => value !== null && value !== undefined
  )
  return hasValue ? mapped : null
}
