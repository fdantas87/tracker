import { randomUUID } from "node:crypto"

import { after } from "next/server"

import { jsonResponse, preflightResponse } from "@/lib/cors"
import { drainEventQueue } from "@/lib/dispatch/event-dispatch"
import { getGeo, toInetOrNull } from "@/lib/geo"
import { hashEmail, hashName, hashPhone } from "@/lib/crypto/hash"
import {
  CAPTURE_RULE,
  checkRateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit"
import { getDispatchConfig } from "@/lib/settings/dispatch-config"
import { createServiceClient } from "@/lib/supabase/service"
import {
  LIMITS,
  cleanString,
  cleanUrl,
  cleanUtms,
  readJsonBody,
} from "@/lib/validation"

/**
 * POST /api/identify
 *
 * Cria ou atualiza o visitante. Chamado pelo track.js no primeiro carregamento
 * de cada página e sempre que o site souber quem é a pessoa
 * (`negou.identify({...})` ou um formulário enviado).
 *
 * O que o CLIENTE manda: trck_user_id (se já tiver), fbp, fbc, cookies do GA,
 * UTMs, referrer e, quando existirem, dados de contato.
 * O que o SERVIDOR resolve sozinho (e nunca aceita do cliente): IP real,
 * user agent e geo. Confiar no cliente para esses seria entregar a chave da
 * geolocalização e do IP para quem quisesse forjar.
 *
 * A resposta devolve `identified`, que é o que o track.js usa pra decidir se
 * dispara o pixel do navegador (fase 7.5). Ele NÃO pode vir de
 * /api/config/public: aquele endpoint responde com `Cache-Control: public`, e
 * um CDN serviria o estado de um visitante pra todos os outros.
 */

/**
 * O `after()` daqui pode disparar a fila inteira de um visitante quando a PII
 * chega. 30s é a mesma folga do /api/event.
 */
export const maxDuration = 30

export async function OPTIONS(request: Request) {
  return preflightResponse(request)
}

export async function POST(request: Request) {
  const geo = getGeo(request.headers)

  const limit = await checkRateLimit(
    "identify",
    geo.ip ?? "sem-ip",
    CAPTURE_RULE
  )
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

  // trck_user_id vem do cliente quando o visitante já foi identificado antes
  // (cookie ou parâmetro de URL vindo de outro domínio). Se não vier, nasce
  // aqui.
  const incomingId = cleanString(body.trck_user_id, LIMITS.id)
  const trckUserId = incomingId ?? randomUUID()

  const email = cleanString(body.email, LIMITS.shortText)
  const phone = cleanString(body.phone, LIMITS.shortText)
  const firstName = cleanString(body.first_name, LIMITS.shortText)
  const lastName = cleanString(body.last_name, LIMITS.shortText)

  // Só a chegada de dado pessoal libera a fila. Um identify de pageview comum
  // (a esmagadora maioria das chamadas) não traz nada e não dispara nada.
  const hasPii = Boolean(email || phone || firstName || lastName)

  const config = await getDispatchConfig()
  const utms = cleanUtms(body)

  const row = {
    trck_user_id: trckUserId,
    email,
    email_hash: hashEmail(email),
    phone_hash: hashPhone(phone, config.defaultPhoneCountry),
    first_name_hash: hashName(firstName),
    last_name_hash: hashName(lastName),
    fbp: cleanString(body.fbp, LIMITS.id),
    fbc: cleanString(body.fbc, LIMITS.id),
    ga_client_id: cleanString(body.ga_client_id, LIMITS.id),
    ga_session_id: cleanString(body.ga_session_id, LIMITS.id),
    ga_session_number: toSmallInt(body.ga_session_number),
    ...utms,
    referrer: cleanUrl(body.referrer),
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
    updated_at: new Date().toISOString(),
  }

  // Campo nulo não pode apagar o que já foi capturado antes: numa visita
  // seguinte sem UTM na URL, manter a origem da primeira visita é o
  // comportamento certo pra atribuição.
  const payload = Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null)
  )

  try {
    const supabase = createServiceClient()

    // O `.select()` no próprio upsert devolve o estado DEPOIS da escrita, que
    // é exatamente o que o navegador precisa saber ("este visitante já tem
    // dado pessoal?"). Uma ida ao banco só.
    const { data: saved, error } = await supabase
      .from("visitors")
      .upsert(payload, { onConflict: "trck_user_id" })
      .select("email_hash, phone_hash")
      .maybeSingle()

    if (error) {
      return jsonResponse(request, { error: "persist_failed" }, 500)
    }

    const identified = Boolean(saved?.email_hash || saved?.phone_hash)

    if (hasPii) {
      // Primeira vez que a identidade aparece. `is null` preserva a semântica
      // de primeiro toque: um segundo formulário não reescreve a data.
      await supabase
        .from("visitors")
        .update({ identified_at: new Date().toISOString() })
        .eq("trck_user_id", trckUserId)
        .is("identified_at", null)

      // LIBERAÇÃO ANTECIPADA: o motivo do atraso já aconteceu. Não faz sentido
      // o PageView continuar esperando quando o dado que ele ia ganhar já está
      // gravado. Adianta a fila deste visitante e drena na sequência.
      after(async () => {
        try {
          await supabase.rpc("flush_visitor_events", {
            p_trck_user_id: trckUserId,
          })
          await drainEventQueue(50)
        } catch {
          // Falha aqui só significa que os eventos saem no tique normal do
          // cron, ainda dentro da janela. Nunca pode quebrar o identify.
        }
      })
    }

    return jsonResponse(
      request,
      { trck_user_id: trckUserId, identified },
      200,
      rateLimitHeaders(limit)
    )
  } catch {
    return jsonResponse(request, { error: "persist_failed" }, 500)
  }
}

function toSmallInt(value: unknown): number | null {
  const num = typeof value === "string" ? Number(value) : value
  if (typeof num !== "number" || !Number.isInteger(num) || num < 0) return null
  return Math.min(num, 2_000_000_000)
}
