import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { pageTitle } from "@/lib/branding"
import { OverviewDashboard, type OverviewData } from "./overview-dashboard"

export const metadata = {
  title: pageTitle("Visão geral"),
}

/** Contagem por tabela, lida COM a sessão do usuário (ou seja, sob RLS). */
async function readCounts() {
  const supabase = await createClient()

  const [visitors, events, purchases] = await Promise.all([
    supabase.from("visitors").select("*", { count: "exact", head: true }),
    supabase.from("events_log").select("*", { count: "exact", head: true }),
    supabase.from("purchases").select("*", { count: "exact", head: true }),
  ])

  return {
    visitors,
    events,
    purchases,
    hasError: visitors.error || events.error || purchases.error,
    errors: [visitors, events, purchases].filter((r) => r.error).map((r) => r.error?.message),
  }
}

export default async function OverviewPage() {
  const counts = await readCounts()

  // Mock dados para os campos que ainda não têm cálculo real (Fase 8)
  // Utiliza as contagens reais de visitantes e vendas (purchases) se disponíveis.
  const dashboardData: OverviewData = {
    faturamento: 0,
    roas: 0,
    vendas: counts.purchases.count ?? 0,
    cpa: 0,
    visitantes: counts.visitors.count ?? 0,
    novosClientes: 0, // Placeholder
    ticketMedio: 0,
    valorPorVisitante: 0,
    valorPorLead: 0,
    valorPorCliente: 0,
    connectRate: 0,
    conversaoLeads: 0,
    conversaoClientes: 0,
    cpl: 0,
    cac: 0,
    produtoMaisVendido: "Nenhum dado",
  }

  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Funil, conversão e volume de eventos aparecem aqui quando a captura estiver ligada."
      />

      <OverviewDashboard data={dashboardData} />
    </>
  )
}
