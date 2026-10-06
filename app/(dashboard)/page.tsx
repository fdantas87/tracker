import { AlertCircle, Info } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { pageTitle } from "@/lib/branding"
import { PERIODOS, PERIODO_PADRAO, type PeriodoKey } from "@/lib/dashboard/filters"
import { getOverview } from "@/lib/dashboard/overview"
import { OverviewDashboard, type OverviewData } from "./overview-dashboard"

export const metadata = {
  title: pageTitle("Visão geral"),
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function lerPeriodo(sp: Record<string, string | string[] | undefined>): PeriodoKey {
  const bruto = Array.isArray(sp.periodo) ? sp.periodo[0] : sp.periodo
  return bruto && bruto in PERIODOS ? (bruto as PeriodoKey) : PERIODO_PADRAO
}

/** Divisão que devolve 0, nunca NaN/Infinity, quando não há denominador. */
const razao = (parte: number, total: number) => (total > 0 ? parte / total : 0)

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const periodo = lerPeriodo(await searchParams)
  const o = await getOverview(periodo)

  // ROAS, CPA, CPL, CAC e Connect Rate dependem de gasto e cliques de anúncio
  // (fase 9, Campanhas) e ficam em 0 até lá — ver `lib/dashboard/overview.ts`.
  const dashboardData: OverviewData = {
    moeda: o.moeda,
    faturamento: o.faturamento,
    roas: 0,
    vendas: o.vendas,
    cpa: 0,
    visitantes: o.visitantes,
    novosClientes: o.clientes,
    ticketMedio: o.ticketMedio,
    valorPorVisitante: razao(o.faturamento, o.visitantes),
    valorPorLead: razao(o.faturamento, o.leads),
    valorPorCliente: razao(o.faturamento, o.clientes),
    connectRate: 0,
    conversaoLeads: razao(o.leads, o.visitantes) * 100,
    conversaoClientes: razao(o.clientesNoFunil, o.visitantes) * 100,
    cpl: 0,
    cac: 0,
    produtoMaisVendido: o.topProduto ?? "Nenhum dado",
  }

  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Funil, conversão e faturamento do período escolhido, a partir de tudo que o painel recebeu."
      />

      {o.error ? (
        <Alert variant="destructive" className="relative z-[1]">
          <AlertCircle className="size-4" aria-hidden />
          <AlertTitle>Os números abaixo estão zerados porque a leitura falhou</AlertTitle>
          <AlertDescription>{o.error}</AlertDescription>
        </Alert>
      ) : null}

      {!o.error && (o.truncado || o.moedasMultiplas) ? (
        <Alert className="relative z-[1]">
          <Info className="size-4" aria-hidden />
          <AlertTitle>Os números podem estar incompletos</AlertTitle>
          <AlertDescription>
            {[
              o.truncado
                ? "O período tem mais registros do que a tela consegue somar de uma vez; escolha um período menor."
                : null,
              o.moedasMultiplas
                ? `As vendas do período misturam moedas; o faturamento soma todas e é exibido em ${o.moeda}.`
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </AlertDescription>
        </Alert>
      ) : null}

      <OverviewDashboard data={dashboardData} />
    </>
  )
}
