import { Suspense } from "react"
import { AlertCircle } from "lucide-react"

import { pageTitle } from "@/lib/branding"
import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { LeadsFilters } from "@/components/dashboard/leads-filters"
import { LeadsTable } from "@/components/dashboard/leads-table"
import { PaginationLinks } from "@/components/dashboard/pagination-links"
import { listLeads, getVisitorCounts } from "@/lib/dashboard/leads"
import { VisitorChips } from "@/components/dashboard/visitor-chips"
import {
  CONVERTEU_VALORES,
  IDENTIFICADO_VALORES,
  PAGE_SIZE,
  PERIODOS,
  PERIODO_PADRAO,
  type ConverteuFiltro,
  type IdentificadoFiltro,
  type LeadFilters,
  type PeriodoKey,
} from "@/lib/dashboard/leads-filters"

export const metadata = {
  title: pageTitle("Visitantes"),
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function texto(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s && s.trim() ? s.trim() : undefined
}

function lerFiltros(sp: Record<string, string | string[] | undefined>): LeadFilters {
  const periodo = texto(sp.periodo)
  const identificado = texto(sp.identificado)
  const converteu = texto(sp.converteu)
  const pagina = Number.parseInt(texto(sp.pagina) ?? "1", 10)

  return {
    q: texto(sp.q),
    identificado:
      identificado && (IDENTIFICADO_VALORES as readonly string[]).includes(identificado)
        ? (identificado as IdentificadoFiltro)
        : "todos",
    converteu:
      converteu && (CONVERTEU_VALORES as readonly string[]).includes(converteu)
        ? (converteu as ConverteuFiltro)
        : "todos",
    periodo: periodo && periodo in PERIODOS ? (periodo as PeriodoKey) : PERIODO_PADRAO,
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  }
}

function paramsDe(filtros: LeadFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (filtros.periodo !== PERIODO_PADRAO) p.set("periodo", filtros.periodo)
  if (filtros.identificado !== "todos") p.set("identificado", filtros.identificado)
  if (filtros.converteu !== "todos") p.set("converteu", filtros.converteu)
  if (filtros.q) p.set("q", filtros.q)
  return p
}

async function Conteudo({ filtros }: { filtros: LeadFilters }) {
  const { rows, total, error } = await listLeads(filtros)

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" aria-hidden />
        <AlertTitle>Não foi possível ler os visitantes</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  const params = paramsDe(filtros)
  const filtrado = Boolean(
    filtros.q || filtros.identificado !== "todos" || filtros.converteu !== "todos"
  )

  return (
    <>
      <LeadsTable rows={rows} filtrado={filtrado} />

      <PaginationLinks
        pagina={filtros.pagina}
        total={total}
        pageSize={PAGE_SIZE}
        params={params}
        basePath="/leads"
      />
    </>
  )
}

async function ChipsSlot({ filtros }: { filtros: LeadFilters }) {
  const contagens = await getVisitorCounts(filtros)
  return <VisitorChips contagens={contagens} filtrosAtuais={filtros} params={paramsDe(filtros)} />
}

function ChipsCarregando() {
  return (
    <div className="flex w-full gap-1 sm:gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
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

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const filtros = lerFiltros(await searchParams)
  const chaveTopo = `${filtros.periodo}|${filtros.q}`

  return (
    <>
      <PageHeader
        title="Visitantes"
        description="Todo visitante que já passou pelo track.js, identificado ou não — e a ficha completa de cada um."
      />

      <Suspense fallback={<Skeleton className="h-10 w-full rounded-xl -mt-2 mb-2 sm:-mt-4" />}>
        <LeadsFilters
          periodo={filtros.periodo}
          identificado={filtros.identificado}
          converteu={filtros.converteu}
          q={filtros.q}
        />
      </Suspense>

      <Suspense key={chaveTopo} fallback={<ChipsCarregando />}>
        <ChipsSlot filtros={filtros} />
      </Suspense>

      <Suspense key={JSON.stringify(filtros)} fallback={<Carregando />}>
        <Conteudo filtros={filtros} />
      </Suspense>
    </>
  )
}
