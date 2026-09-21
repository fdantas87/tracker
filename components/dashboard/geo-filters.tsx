"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Loader2, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PERIODO_PADRAO, type PeriodoKey } from "@/lib/dashboard/geo-filters"

export function GeoFilters({
  periodo,
  q,
}: {
  periodo: PeriodoKey
  q?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendente, startTransition] = useTransition()

  function navegar(mudancas: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())

    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor === null || valor === "") params.delete(chave)
      else params.set(chave, valor)
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const temFiltro = Boolean(q) || periodo !== PERIODO_PADRAO

  return (
    <div className="glass -mt-2 mb-2 flex flex-col items-center rounded-xl p-1.5 sm:-mt-4 sm:flex-row">
      <form
        className="relative flex-1 w-full"
        onSubmit={(e) => {
          e.preventDefault()
          const valor = new FormData(e.currentTarget).get("q")
          navegar({ q: typeof valor === "string" ? valor.trim() : null })
        }}
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por país, estado ou cidade"
          className="h-8 pl-8 border-none bg-transparent shadow-none text-xs focus-visible:ring-0"
          aria-label="Buscar por país, estado ou cidade"
        />
      </form>

      <div className="flex shrink-0 items-center gap-2 px-2">
        {pendente ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Carregando" />
        ) : null}
        {temFiltro ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => navegar({ periodo: PERIODO_PADRAO, q: null })}
          >
            Limpar
          </Button>
        ) : null}
      </div>
    </div>
  )
}
