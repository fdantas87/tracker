import { after } from "next/server"

import { jsonResponse, preflightResponse } from "@/lib/cors"
import { dispatchEventNow } from "@/lib/dispatch/event-dispatch"
import { getGeo, toInetOrNull } from "@/lib/geo"
import {
  CAPTURE_RULE,
  checkRateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit"
import {
  getDispatchConfig,
  resolveDispatchDelayMs,
} from "@/lib/settings/dispatch-config"
import { createServiceClient } from "@/lib/supabase/service"
import {
  LIMITS,
  cleanEventName,
  cleanJson,
  cleanString,
  cleanUrl,
  cleanUtms,
  readJsonBody,
} from "@/lib/validation"

/**
 * POST /api/event
 *
 * Registra um evento em `events_log` e decide QUANDO ele vai pro Meta.
 *
 * O `event_id` é OBRIGATÓRIO e nasce no navegador — o mesmo id vai pro
 * `fbq(..., { eventID })` e pra cá. É isso que permite o Meta deduplicar o
 * evento do Pixel com o da Conversions API. Se o servidor gerasse um id
 * próprio, os dois lados nunca casariam e todo evento contaria em dobro.
 * Por isso aqui ele é validado, nunca inventado.
 *
 * A partir da fase 7.5 o envio pode ser ATRASADO (ver lib/dispatch/
 * event-dispatch.ts): o evento espera numa fila enquanto a conversão de fundo
 * de funil não chega, e sai enriquecido com email/telefone/nome. Quando o
 * navegador já disparou o pixel (`pixel_fired`), o envio é imediato — atrasar
 * aí garantiria a perda, porque o Meta descarta o evento que chega depois.
 */

/**
 * O `after()` abaixo roda DENTRO do orçamento de tempo da função. O padrão da
 * Vercel é 10s, e o envio ao Meta tem timeout de 10s — ou seja, no pior caso o
 * disparo seria morto no meio, perdendo o evento sem erro nenhum aparecer.
 * 30s dá folga confortável.
 */
export const maxDuration = 30

/** Limite do Meta pro event_time: 7 dias. 6 deixa margem pra fila e retries. */
const MAX_EVENT_AGE_MS = 6 * 24 * 60 * 60 * 1000
/** Relógio de cliente adiantado é comum; mais que isso é lixo. */
const MAX_EVENT_FUTURE_MS = 5 * 60 * 1000

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
  const pixelFired = body.pixel_fired === true
  const eventTime = resolveEventTime(body.event_time)

  try {
    const config = await getDispatchConfig()
    const delayMs = resolveDispatchDelayMs(config, eventName, pixelFired)
    const dispatchAfter = new Date(Date.now() + delayMs)

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
        geo_postal_code: geo.postalCode,
        geo_latitude: geo.latitude,
        geo_longitude: geo.longitude,
        geo_timezone: geo.timezone,
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
          // Colunas próprias, não dentro de payload_meta: o disparo atrasado
          // precisa delas intactas na hora de montar o payload, e o
          // payload_meta é sobrescrito com o que foi enviado ao Meta.
          event_time: eventTime.toISOString(),
          event_source_url: eventSourceUrl,
          custom_data: customData,
          action_source: "website",
          pixel_fired: pixelFired,
          dispatch_status: "pending",
          dispatch_after: dispatchAfter.toISOString(),
          ip: toInetOrNull(geo.ip),
          // Geo do INSTANTE do evento. Difere do geo atual do visitante quando
          // a pessoa muda de lugar entre a visita e a compra, e é isso que a
          // tela de Eventos precisa mostrar.
          geo_country: geo.country,
          geo_region: geo.region,
          geo_city: geo.city,
          geo_postal_code: geo.postalCode,
          geo_latitude: geo.latitude,
          geo_longitude: geo.longitude,
          geo_timezone: geo.timezone,
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
    const queued = delayMs > 0

    // Envio imediato acontece DEPOIS de responder: `after()` do Next roda o
    // callback com a resposta já entregue, então a ida e volta até o Meta não
    // atrasa o carregamento da página. Diferente de um fire-and-forget solto,
    // a Vercel mantém a função viva até este trabalho terminar.
    //
    // Duplicata não redispara, e evento enfileirado não é enviado aqui: quem
    // cuida dele é o cron. As duas pontas reivindicam a linha atomicamente,
    // então nem uma corrida entre elas manda o evento duas vezes.
    if (!duplicated && !queued) {
      after(async () => {
        await dispatchEventNow(eventId)
      })
    }

    return jsonResponse(
      request,
      { ok: true, event_id: eventId, duplicated, queued },
      200,
      rateLimitHeaders(limit)
    )
  } catch {
    return jsonResponse(request, { error: "persist_failed" }, 500)
  }
}

/**
 * O momento em que o evento aconteceu no navegador.
 *
 * Relógio de cliente não é confiável, mas é a única fonte do instante real —
 * e com a fila o `created_at` já não serve, porque o envio pode acontecer
 * muito depois. Então aceitamos o valor do cliente dentro de uma faixa sã e
 * caímos pro relógio do servidor em qualquer coisa fora dela.
 */
function resolveEventTime(value: unknown): Date {
  const now = Date.now()
  const parsed = typeof value === "number" ? value : Number(value)

  if (!Number.isFinite(parsed)) return new Date(now)
  if (parsed > now + MAX_EVENT_FUTURE_MS) return new Date(now)
  if (parsed < now - MAX_EVENT_AGE_MS) return new Date(now)

  return new Date(parsed)
}
