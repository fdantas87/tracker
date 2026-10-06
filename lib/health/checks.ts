import "server-only"

import { createClient } from "@/lib/supabase/server"
import { getClarityAccount } from "@/lib/clarity/queries"
import { getStripeAccount } from "@/lib/settings/queries"
import type { HealthIssue, HealthLevel, HealthStatus } from "./types"

// Avisos técnicos ficam aqui, no ícone da sidebar, e não na tela de cada feature.
export async function getHealthStatus(): Promise<HealthStatus> {
  const supabase = await createClient()
  const issues: HealthIssue[] = []

  const [visitors, events, purchases, stripe, clarity] = await Promise.all([
    supabase.from("visitors").select("*", { count: "exact", head: true }),
    supabase.from("events_log").select("*", { count: "exact", head: true }),
    supabase.from("purchases").select("*", { count: "exact", head: true }),
    getStripeAccount().then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.message : "erro desconhecido"),
    ),
    getClarityAccount().then(
      (account) => ({ account, error: null }),
      (error: unknown) => ({
        account: null,
        error: error instanceof Error ? error.message : "erro desconhecido",
      }),
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

  if (clarity.error) {
    issues.push({
      title: "Integração do Clarity indisponível",
      message: `Provável migration pendente: 20261005120000_clarity_integration.sql. Detalhe: ${clarity.error}`,
      level: "warn",
    })
  } else if (clarity.account?.isActive && clarity.account.hasApiToken) {
    // Só reclama de sincronização quando há o que sincronizar. Sem sync há
    // mais de 2 dias (o cron é diário) ou com erro, os KPIs estão parados.
    const { lastSyncAt, lastSyncStatus, lastSyncError } = clarity.account
    const parado =
      lastSyncAt !== null && Date.now() - new Date(lastSyncAt).getTime() > 48 * 3_600_000
    if (lastSyncStatus === "erro" || parado) {
      issues.push({
        title: "Clarity sem sincronizar",
        message: parado
          ? "A última sincronização do Clarity tem mais de 2 dias. Confira o token em Mapa de Calor → Configurar."
          : (lastSyncError ?? "A última sincronização do Clarity falhou."),
        level: "warn",
      })
    }
  }

  const level: HealthLevel = issues.some((i) => i.level === "error")
    ? "error"
    : issues.length > 0
      ? "warn"
      : "ok"

  return { level, issues }
}
