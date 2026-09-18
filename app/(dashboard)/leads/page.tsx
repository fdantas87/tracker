import { Suspense } from "react"
import { AlertCircle } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { LeadsFilters } from "@/components/dashboard/leads-filters"
import { LeadsTable } from "@/components/dashboard/leads-table"
import { PaginationLinks } from "@/components/dashboard/pagination-links"
import { listLeads } from "@/lib/dashboard/leads"
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
  title: "Leads · Negou Tracking",
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
        <AlertTitle>Não foi possível ler os leads</AlertTitle>
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
      <LeadsFilters
        periodo={filtros.periodo}
        identificado={filtros.identificado}
        converteu={filtros.converteu}
        q={filtros.q}
      />

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

  return (
    <>
      <PageHeader
        title="Leads"
        description="Todo visitante que já passou pelo track.js, identificado ou não — e a ficha completa de cada um."
      />

      {/* A chave força o Suspense a reagir a cada mudança de filtro, em vez de
          segurar a tela antiga até a nova query terminar. */}
      <Suspense key={JSON.stringify(filtros)} fallback={<Carregando />}>
        <Conteudo filtros={filtros} />
      </Suspense>
    </>
  )
}
