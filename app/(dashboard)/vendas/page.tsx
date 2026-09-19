import { Suspense } from "react"
import {
  AlertCircle,
  CreditCard,
  DollarSign,
  Receipt,
  ShieldAlert,
  Undo2,
} from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { PaginationLinks } from "@/components/dashboard/pagination-links"
import { PaymentMethodChart } from "@/components/dashboard/payment-method-chart"
import { StatCard } from "@/components/dashboard/stat-card"
import { VendasFilters } from "@/components/dashboard/vendas-filters"
import { VendasTable } from "@/components/dashboard/vendas-table"
import { formatarMoeda } from "@/lib/dashboard/format"
import { getVendasResumo, listVendas, type VendasResumo } from "@/lib/dashboard/vendas"
import {
  PAGAMENTO_VALORES,
  PAGE_SIZE,
  PERIODOS,
  PERIODO_PADRAO,
  STATUS_VALORES,
  type PagamentoFiltro,
  type PeriodoKey,
  type VendaFilters,
} from "@/lib/dashboard/vendas-filters"
import type { PurchaseStatus } from "@/lib/webhooks/adapters/types"
import { pageTitle } from "@/lib/branding"

export const metadata = {
  title: pageTitle("Vendas"),
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function texto(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s && s.trim() ? s.trim() : undefined
}

function lerFiltros(sp: Record<string, string | string[] | undefined>): VendaFilters {
  const periodo = texto(sp.periodo)
  const status = texto(sp.status)
  const pagamento = texto(sp.pagamento)
  const pagina = Number.parseInt(texto(sp.pagina) ?? "1", 10)

  return {
    q: texto(sp.q),
    status:
      status && (STATUS_VALORES as readonly string[]).includes(status)
        ? (status as PurchaseStatus)
        : undefined,
    pagamento:
      pagamento && (PAGAMENTO_VALORES as readonly string[]).includes(pagamento)
        ? (pagamento as PagamentoFiltro)
        : undefined,
    periodo: periodo && periodo in PERIODOS ? (periodo as PeriodoKey) : PERIODO_PADRAO,
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  }
}

function paramsDe(filtros: VendaFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (filtros.periodo !== PERIODO_PADRAO) p.set("periodo", filtros.periodo)
  if (filtros.status) p.set("status", filtros.status)
  if (filtros.pagamento) p.set("pagamento", filtros.pagamento)
  if (filtros.q) p.set("q", filtros.q)
  return p
}

/**
 * Os cards do topo.
 *
 * Deliberadamente SEM taxas, imposto, custo de produto e faturamento líquido:
 * nenhum desses dados existe no banco nem chega pelo webhook, e estimá-los por
 * percentual chutado produziria um "líquido" que parece número e não é. Quando
 * a taxa real da plataforma passar a ser capturada, eles entram aqui.
 */
function Cards({ resumo }: { resumo: VendasResumo }) {
  const moeda = resumo.moeda

  const formasUsadas = resumo.porPagamento
    .map((fatia) => `${fatia.label} ${fatia.quantidade}`)
    .join(" · ")

  // A forma com mais receita. Com tudo zerado não há "principal" nenhuma, e
  // mostrar "Cartão" ali seria afirmar algo que não aconteceu.
  const principal = resumo.porPagamento.reduce<(typeof resumo.porPagamento)[number] | null>(
    (melhor, fatia) =>
      fatia.valor > 0 && (!melhor || fatia.valor > melhor.valor) ? fatia : melhor,
    null
  )

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Faturamento Total"
        valor={formatarMoeda(resumo.faturamento, moeda)}
        legenda="Total de vendas aprovadas"
        icone={DollarSign}
        tom="positivo"
      />

      <StatCard
        label="Vendas Aprovadas"
        valor={resumo.aprovadas.toLocaleString("pt-BR")}
        legenda={`Ticket médio ${formatarMoeda(resumo.ticketMedio, moeda)}`}
        icone={Receipt}
      />

      <StatCard
        label="Vendas Reembolsadas"
        valor={formatarMoeda(resumo.reembolsado, moeda)}
        legenda={`${resumo.reembolsadas.toLocaleString("pt-BR")} ${
          resumo.reembolsadas === 1 ? "reembolso" : "reembolsos"
        }`}
        icone={Undo2}
      />

      <StatCard
        label="Vendas Chargeback"
        valor={formatarMoeda(resumo.chargeback, moeda)}
        legenda={`Quantidade ${resumo.chargebacks.toLocaleString("pt-BR")}`}
        icone={ShieldAlert}
        tom={resumo.chargebacks > 0 ? "negativo" : "neutro"}
      />

      <StatCard
        label="Vendas por Pagamento"
        valor={principal ? principal.label : "—"}
        legenda={formasUsadas}
        icone={CreditCard}
        tom="atencao"
      />
    </section>
  )
}

async function Conteudo({ filtros }: { filtros: VendaFilters }) {
  const [resumo, lista] = await Promise.all([
    getVendasResumo(filtros),
    listVendas(filtros),
  ])

  const erro = resumo.error ?? lista.error
  const params = paramsDe(filtros)
  const filtrado = Boolean(filtros.q || filtros.status || filtros.pagamento)

  return (
    <>
      <VendasFilters
        periodo={filtros.periodo}
        status={filtros.status}
        pagamento={filtros.pagamento}
        q={filtros.q}
      />

      {/* O erro NÃO substitui a tela: os cards continuam lá, zerados, e o aviso
          vem numa faixa acima. Trocar a página inteira por um alerta vermelho
          fazia uma falha momentânea de leitura parecer que o painel havia
          quebrado. Mas o aviso também não pode sumir — num painel de vendas,
          "R$ 0,00" sem explicação não deixa distinguir "não vendi nada" de "a
          consulta falhou", e essa é a pior dúvida possível aqui. */}
      {erro ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertTitle>Os números abaixo estão zerados porque a leitura falhou</AlertTitle>
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}

      <Cards resumo={resumo} />

      {resumo.moedasMultiplas ? (
        <p className="text-xs text-muted-foreground">
          Este período tem vendas em mais de uma moeda. Os totais acima somam apenas
          as vendas em {resumo.moeda} — valores em outras moedas não são convertidos.
        </p>
      ) : null}

      {resumo.truncado ? (
        <p className="text-xs text-muted-foreground">
          Os totais consideram as 20.000 vendas mais recentes do período.
        </p>
      ) : null}

      <div className="glass rounded-2xl p-4">
        <h2 className="mb-3 text-sm font-medium">Vendas por Forma de Pagamento</h2>
        <PaymentMethodChart dados={resumo.porPagamento} moeda={resumo.moeda} />
      </div>

      <VendasTable rows={lista.rows} filtrado={filtrado} />

      <PaginationLinks
        pagina={filtros.pagina}
        total={lista.total}
        pageSize={PAGE_SIZE}
        params={params}
        basePath="/vendas"
      />
    </>
  )
}

function Carregando() {
  return (
    <>
      <Skeleton className="h-9 w-72 rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-60 rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </>
  )
}

export default async function VendasPage({ searchParams }: { searchParams: SearchParams }) {
  const filtros = lerFiltros(await searchParams)

  return (
    <>
      <PageHeader
        title="Análise de Vendas"
        description="Faturamento, reembolsos e formas de pagamento — direto das compras que chegaram pelo webhook."
      />

      {/* A chave força o Suspense a reagir a cada mudança de filtro, em vez de
          segurar a tela antiga até a nova query terminar. */}
      <Suspense key={JSON.stringify(filtros)} fallback={<Carregando />}>
        <Conteudo filtros={filtros} />
      </Suspense>
    </>
  )
}
