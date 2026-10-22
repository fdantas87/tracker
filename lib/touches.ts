import "server-only"

import type { createServiceClient } from "@/lib/supabase/service"
import { LIMITS, cleanString, cleanUrl, cleanUtms, type UtmFields } from "@/lib/validation"

/**
 * Jornada de UTMs (migration 20261022120000_utm_touches.sql).
 *
 * Um TOQUE é uma chegada com campanha na URL: UTM, fbclid ou gclid. O track.js
 * decide o que é toque (só ele vê a URL de entrada) e manda `touch` no
 * /api/identify; aqui ele é validado e vira uma linha de `visitor_touches`.
 *
 * Tudo aqui é enriquecimento: falhar não pode derrubar o identify. Por isso as
 * funções engolem o erro em vez de lançar.
 */

type Supabase = ReturnType<typeof createServiceClient>

/** Mesmo toque repetido dentro desta janela não é toque novo. */
const JANELA_DUPLICADO_MS = 30 * 60 * 1000

/** first_touch_at aceito do navegador: no passado, até este limite. */
const IDADE_MAXIMA_PRIMEIRO_TOQUE_MS = 400 * 24 * 60 * 60 * 1000

export type Touch = UtmFields & {
  touch_id: string
  fbclid: string | null
  gclid: string | null
  referrer: string | null
  landing_url: string | null
}

export type FirstTouch = UtmFields & { at: string }

const TUPLA = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
] as const

function objeto(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Olha só as 5 UTMs, mesmo num objeto com mais campos (um Touch). */
export function temUtm(utms: UtmFields): boolean {
  return TUPLA.slice(0, 5).some((campo) => utms[campo as keyof UtmFields] !== null)
}

export function cleanTouch(value: unknown): Touch | null {
  const raw = objeto(value)
  if (!raw) return null

  const touchId = cleanString(raw.touch_id, LIMITS.id)
  if (!touchId) return null

  const touch: Touch = {
    touch_id: touchId,
    ...cleanUtms(raw),
    fbclid: cleanString(raw.fbclid, LIMITS.shortText),
    gclid: cleanString(raw.gclid, LIMITS.shortText),
    referrer: cleanUrl(raw.referrer),
    landing_url: cleanUrl(raw.landing_url),
  }
  // Sem campanha nenhuma não é toque, é só uma visita.
  return TUPLA.some((campo) => touch[campo] !== null) ? touch : null
}

/** O primeiro toque guardado no cookie do navegador, com a data dele. */
export function cleanFirstTouch(value: unknown, agora = Date.now()): FirstTouch | null {
  const raw = objeto(value)
  if (!raw) return null

  const utms = cleanUtms(raw)
  if (!temUtm(utms)) return null

  const at = typeof raw.at === "number" ? raw.at : Number(raw.at)
  const valido =
    Number.isFinite(at) && at <= agora && agora - at <= IDADE_MAXIMA_PRIMEIRO_TOQUE_MS
  return { ...utms, at: new Date(valido ? at : agora).toISOString() }
}

/**
 * Grava o toque, a não ser que o último toque do visitante seja o mesmo e
 * recente. Esse é o caso do link para o quiz decorado com as UTMs: o quiz vê a
 * campanha na URL e manda como toque, mas é a mesma chegada da LP.
 */
export async function recordTouch(
  supabase: Supabase,
  trckUserId: string,
  touch: Touch
): Promise<void> {
  try {
    const { data: ultimo } = await supabase
      .from("visitor_touches")
      .select(
        "touch_id, touched_at, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbclid, gclid"
      )
      .eq("trck_user_id", trckUserId)
      .order("touched_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (ultimo) {
      const anterior = ultimo as unknown as Record<string, unknown>
      if (anterior.touch_id === touch.touch_id) return
      const recente =
        Date.now() - new Date(String(anterior.touched_at)).getTime() < JANELA_DUPLICADO_MS
      const igual = TUPLA.every((campo) => (anterior[campo] ?? null) === touch[campo])
      if (recente && igual) return
    }

    await supabase
      .from("visitor_touches")
      .upsert(
        { trck_user_id: trckUserId, ...touch },
        { onConflict: "touch_id", ignoreDuplicates: true }
      )
  } catch {
    // Sem a migration, ou banco instável: o identify segue.
  }
}

/** Preenche o primeiro toque UMA vez (`first_touch_at is null`). */
export async function fillFirstTouch(
  supabase: Supabase,
  trckUserId: string,
  first: FirstTouch
): Promise<void> {
  try {
    await supabase
      .from("visitors")
      .update({
        first_utm_source: first.utm_source,
        first_utm_medium: first.utm_medium,
        first_utm_campaign: first.utm_campaign,
        first_utm_term: first.utm_term,
        first_utm_content: first.utm_content,
        first_touch_at: first.at,
      })
      .eq("trck_user_id", trckUserId)
      .is("first_touch_at", null)
  } catch {
    // Idem.
  }
}
