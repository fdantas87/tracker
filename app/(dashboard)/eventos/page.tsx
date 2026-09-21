import { Suspense } from "react"
import { AlertCircle } from "lucide-react"

import { pageTitle } from "@/lib/branding"
import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { EventsChartWidget } from "@/components/dashboard/events-chart-widget"
import { EventsFilters } from "@/components/dashboard/events-filters"
import { EventsTable } from "@/components/dashboard/events-table"
import { PaginationLinks } from "@/components/dashboard/pagination-links"
import { StatusChips } from "@/components/dashboard/status-chips"
import {
  getEventNames,
  getSerieDiaria,
  getStatusCounts,
  listEvents,
} from "@/lib/dashboard/events"
import {
  DISPATCH_STATUSES,
  PAGE_SIZE,
  PERIODOS,
  PERIODO_PADRAO,
  type DispatchStatus,
  type EventFilters,
  type PeriodoKey,
} from "@/lib/dashboard/filters"

export const metadata = {
  title: pageTitle("Eventos"),
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function texto(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s && s.trim() ? s.trim() : undefined
}

function lerFiltros(sp: Record<string, string | string[] | undefined>): EventFilters {
  const periodo = texto(sp.periodo)
  const status = texto(sp.status)
  const pagina = Number.parseInt(texto(sp.pagina) ?? "1", 10)

  return {
    evento: texto(sp.evento),
    status:
      status && (DISPATCH_STATUSES as readonly string[]).includes(status)
        ? (status as DispatchStatus)
        : undefined,
    periodo: periodo && periodo in PERIODOS ? (periodo as PeriodoKey) : PERIODO_PADRAO,
    q: texto(sp.q),
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  }
}

function paramsDe(filtros: EventFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (filtros.periodo !== PERIODO_PADRAO) p.set("periodo", filtros.periodo)
  if (filtros.evento) p.set("evento", filtros.evento)
  if (filtros.status) p.set("status", filtros.status)
  if (filtros.q) p.set("q", filtros.q)
  return p
}

async function FiltersSlot({ filtros }: { filtros: EventFilters }) {
  const nomes = await getEventNames()
  return (
    <EventsFilters
      nomes={nomes}
      periodo={filtros.periodo}
      evento={filtros.evento}
      q={filtros.q}
    />
  )
}

async function Conteudo({ filtros }: { filtros: EventFilters }) {
  const { rows, total, error, agoraMs } = await listEvents(filtros)

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" aria-hidden />
        <AlertTitle>Não foi possível ler os eventos</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  const params = paramsDe(filtros)
  const filtrado = Boolean(filtros.evento || filtros.status || filtros.q)

  return (
    <>
      <EventsTable rows={rows} filtrado={filtrado} agora={agoraMs} />

      <PaginationLinks
        pagina={filtros.pagina}
        total={total}
        pageSize={PAGE_SIZE}
        params={params}
      />
    </>
  )
}

/**
 * Chips e gráfico moram no bloco de topo, que renderiza FORA do Suspense
 * principal para o título aparecer na hora. Por isso cada um busca o que
 * precisa e tem o próprio Suspense: nenhum espera a tabela, e nenhum atrasa o
 * título.
 */
async function ChipsSlot({ filtros }: { filtros: EventFilters }) {
  const contagens = await getStatusCounts(filtros)
  return (
    <StatusChips contagens={contagens} ativo={filtros.status} params={paramsDe(filtros)} />
  )
}

async function ChartWidgetSlot({ filtros }: { filtros: EventFilters }) {
  const serie = await getSerieDiaria(filtros)
  return <EventsChartWidget dados={serie} />
}

function ChipsCarregando() {
  return (
    <div className="flex w-full gap-1 sm:gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 min-w-0 flex-1 rounded-lg sm:h-14 sm:rounded-xl xl:h-[52px]" />
      ))}
    </div>
  )
}

function Carregando() {
  return (
    <>
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </>
  )
}

export default async function EventosPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const filtros = lerFiltros(await searchParams)

  // Em "Tudo" não há intervalo pré-preenchido (ver getSerieDiaria), então não
  // existe série a desenhar. Sem gráfico o topo volta a ser uma coluna só — do
  // contrário metade da largura ficaria em branco.
  const temGrafico = filtros.periodo !== "tudo"

  // A paginação fica fora das chaves de propósito: trocar de página não muda
  // nem as contagens nem a série, e remontar refaria as queries à toa.
  const chaveTopo = `${filtros.periodo}|${filtros.evento}|${filtros.q}`

  return (
    <>
      <PageHeader
        title="Eventos"
        description="Tudo que foi capturado e o que aconteceu com cada envio para a Conversions API."
      />

      <Suspense fallback={<Skeleton className="h-10 w-full rounded-xl -mt-2 mb-2 sm:-mt-4" />}>
        <FiltersSlot filtros={filtros} />
      </Suspense>

      {/* Bloco de topo: título e chips empilhados à esquerda, gráfico à direita
          ocupando a altura das duas linhas. Abaixo de `lg` vira uma coluna só,
          na ordem chips → gráfico (os chips são navegação; o gráfico é
          indicador). */}
      <section className={`grid gap-4 ${temGrafico ? "lg:grid-cols-2 lg:gap-6" : ""}`}>
        <div className="flex min-w-0 flex-col justify-between gap-4">
          <Suspense key={chaveTopo} fallback={<ChipsCarregando />}>
            <ChipsSlot filtros={filtros} />
          </Suspense>
        </div>

        {temGrafico ? (
          <Suspense key={chaveTopo} fallback={<Skeleton className="h-56 w-full rounded-2xl" />}>
            <ChartWidgetSlot filtros={filtros} />
          </Suspense>
        ) : null}
      </section>

      {/* A chave força o Suspense a reagir a cada mudança de filtro, em vez de
          segurar a tela antiga até a nova query terminar. */}
      <Suspense key={JSON.stringify(filtros)} fallback={<Carregando />}>
        <Conteudo filtros={filtros} />
      </Suspense>
    </>
  )
}
