import { Suspense } from "react"
import { AlertCircle } from "lucide-react"

import { pageTitle } from "@/lib/branding"
import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { EventsChart } from "@/components/dashboard/events-chart"
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

async function Conteudo({ filtros }: { filtros: EventFilters }) {
  const [{ rows, total, error, agoraMs }, contagens, serie, nomes] = await Promise.all([
    listEvents(filtros),
    getStatusCounts(filtros),
    getSerieDiaria(filtros),
    getEventNames(),
  ])

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
      <StatusChips contagens={contagens} ativo={filtros.status} params={params} />

      <EventsFilters
        nomes={nomes}
        periodo={filtros.periodo}
        evento={filtros.evento}
        q={filtros.q}
      />

      {filtros.periodo !== "tudo" ? (
        <div className="glass rounded-2xl p-4">
          <EventsChart dados={serie} />
        </div>
      ) : null}

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

function Carregando() {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-52 rounded-2xl" />
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

  return (
    <>
      <PageHeader
        title="Eventos"
        description="Tudo que foi capturado e o que aconteceu com cada envio para a Conversions API."
      />

      {/* A chave força o Suspense a reagir a cada mudança de filtro, em vez de
          segurar a tela antiga até a nova query terminar. */}
      <Suspense key={JSON.stringify(filtros)} fallback={<Carregando />}>
        <Conteudo filtros={filtros} />
      </Suspense>
    </>
  )
}
