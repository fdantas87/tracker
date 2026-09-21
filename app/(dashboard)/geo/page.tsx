import { Suspense } from "react"
import { AlertCircle } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { GeoFilters } from "@/components/dashboard/geo-filters"
import { GeoView } from "@/components/dashboard/geo-view"
import { getReceitaPorLocal, getVisitantesPorLocal } from "@/lib/dashboard/geo"
import {
  PERIODOS,
  PERIODO_PADRAO,
  type GeoFilters,
  type PeriodoKey,
} from "@/lib/dashboard/geo-filters"
import { pageTitle } from "@/lib/branding"

export const metadata = {
  title: pageTitle("Geo"),
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function texto(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s && s.trim() ? s.trim() : undefined
}

function lerFiltros(sp: Record<string, string | string[] | undefined>): GeoFilters {
  const periodo = texto(sp.periodo)

  return {
    q: texto(sp.q),
    periodo: periodo && periodo in PERIODOS ? (periodo as PeriodoKey) : PERIODO_PADRAO,
  }
}

async function Conteudo({ filtros }: { filtros: GeoFilters }) {
  const [visitantes, receita] = await Promise.all([
    getVisitantesPorLocal(filtros),
    getReceitaPorLocal(filtros),
  ])

  const erro = visitantes.error ?? receita.error

  return (
    <>
      {/* Mesma postura da tela de Vendas: o erro não substitui a página. O mapa
          e os chips continuam lá, vazios, com o aviso numa faixa acima — um
          mapa vazio sem explicação não deixa distinguir "ninguém acessou" de
          "a consulta falhou". */}
      {erro ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertTitle>O mapa está vazio porque a leitura falhou</AlertTitle>
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}

      <GeoView visitantes={visitantes} receita={receita} />
    </>
  )
}

function Carregando() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="aspect-4/3 w-full rounded-2xl sm:aspect-video lg:aspect-2/1" />
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  )
}

export default async function GeoPage({ searchParams }: { searchParams: SearchParams }) {
  const filtros = lerFiltros(await searchParams)

  return (
    <>
      <PageHeader
        title="Geolocalização"
        description="De onde vêm os seus visitantes."
      />

      <Suspense fallback={<Skeleton className="h-10 w-full rounded-xl -mt-2 mb-2 sm:-mt-4" />}>
        <GeoFilters periodo={filtros.periodo} q={filtros.q} />
      </Suspense>

      {/* A chave força o Suspense a reagir à troca de período, em vez de segurar
          a tela antiga até a nova consulta terminar. */}
      <Suspense key={JSON.stringify(filtros)} fallback={<Carregando />}>
        <Conteudo filtros={filtros} />
      </Suspense>
    </>
  )
}
