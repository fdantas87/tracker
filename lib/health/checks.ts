import "server-only"

import { createClient } from "@/lib/supabase/server"
import { getStripeAccount } from "@/lib/settings/queries"
import type { HealthIssue, HealthLevel, HealthStatus } from "./types"

// Avisos técnicos ficam aqui, no ícone da sidebar, e não na tela de cada feature.
export async function getHealthStatus(): Promise<HealthStatus> {
  const supabase = await createClient()
  const issues: HealthIssue[] = []

  const [visitors, events, purchases, stripe] = await Promise.all([
    supabase.from("visitors").select("*", { count: "exact", head: true }),
    supabase.from("events_log").select("*", { count: "exact", head: true }),
    supabase.from("purchases").select("*", { count: "exact", head: true }),
    getStripeAccount().then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.message : "erro desconhecido"),
    ),
  ])

  const dbErrors = [visitors, events, purchases].flatMap((r) =>
    r.error ? [r.error.message] : [],
  )
  if (dbErrors.length > 0) {
    issues.push({
      title: "Falha ao ler o banco",
      message: dbErrors.join(" · "),
      level: "error",
    })
  }

  if (stripe) {
    issues.push({
      title: "Integração do Stripe indisponível",
      message: `Provável migration pendente: 20260921130000_stripe_integration.sql. Detalhe: ${stripe}`,
      level: "warn",
    })
  }

  const level: HealthLevel = issues.some((i) => i.level === "error")
    ? "error"
    : issues.length > 0
      ? "warn"
      : "ok"

  return { level, issues }
}
