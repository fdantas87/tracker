import { randomUUID } from "node:crypto"

import { jsonResponse, preflightResponse } from "@/lib/cors"
import { getGeo, toInetOrNull } from "@/lib/geo"
import { hashEmail, hashName, hashPhone } from "@/lib/crypto/hash"
import {
  CAPTURE_RULE,
  checkRateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit"
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
 * de cada página.
 *
 * O que o CLIENTE manda: trck_user_id (se já tiver), fbp, fbc, cookies do GA,
 * UTMs, referrer e, quando existirem, dados de contato.
 * O que o SERVIDOR resolve sozinho (e nunca aceita do cliente): IP real,
 * user agent e geo. Confiar no cliente para esses seria entregar a chave da
 * geolocalização e do IP para quem quisesse forjar.
 */

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

  const utms = cleanUtms(body)

  const row = {
    trck_user_id: trckUserId,
    email,
    email_hash: hashEmail(email),
    phone_hash: hashPhone(phone),
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
    const { error } = await supabase
      .from("visitors")
      .upsert(payload, { onConflict: "trck_user_id" })

    if (error) {
      return jsonResponse(request, { error: "persist_failed" }, 500)
    }

    return jsonResponse(
      request,
      { trck_user_id: trckUserId },
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
