import "server-only"

import { createServiceClient } from "@/lib/supabase/service"

/**
 * Project ID do Clarity para o `track.js`, lido por /api/config/public.
 *
 * Mesmo memo de 60s de `dispatch-config.ts`: é consultado em toda carga de
 * página dos sites do cliente (atrás do Cache-Control público, mas ainda
 * assim), e muda uma vez na vida.
 *
 * Falha de leitura vira `null` — Clarity desligado — e NUNCA erro. A migration
 * do Clarity é recomendada antes do deploy, mas a captura não pode depender
 * dela: um 503 no /api/config/public derrubaria Meta e GA4 junto.
 */

let cached: { value: string | null; expiresAt: number } | null = null

const TTL_MS = 60_000

export async function getClarityProjectId(): Promise<string | null> {
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.value

  let value: string | null = null
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("clarity_accounts")
      .select("project_id, is_active")
      .eq("id", true)
      .maybeSingle()

    if (!error && data?.is_active && typeof data.project_id === "string") {
      value = data.project_id
    }
  } catch {
    value = null
  }

  cached = { value, expiresAt: now + TTL_MS }
  return value
}

/** Usado pelas Server Actions depois de salvar, pra não esperar o TTL. */
export function invalidateClarityConfig(): void {
  cached = null
}
