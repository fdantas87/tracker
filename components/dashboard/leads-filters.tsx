"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Loader2, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  PERIODOS,
  PERIODO_PADRAO,
  type ConverteuFiltro,
  type IdentificadoFiltro,
  type PeriodoKey,
} from "@/lib/dashboard/leads-filters"

/**
 * Mesmo princípio de `events-filters.tsx`: filtros na URL, não em estado de
 * React — link compartilhável, botão voltar funcionando, zero useEffect de
 * busca.
 */
export function LeadsFilters({
  periodo,
  identificado,
  converteu,
  q,
}: {
  periodo: PeriodoKey
  identificado: IdentificadoFiltro
  converteu: ConverteuFiltro
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

    // Qualquer mudança de filtro reinicia a paginação.
    params.delete("pagina")

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const temFiltro =
    Boolean(q) || identificado !== "todos" || converteu !== "todos" || periodo !== PERIODO_PADRAO

  return (
    <div className="glass -mt-2 mb-2 flex flex-col items-center rounded-xl p-1.5 sm:-mt-4 sm:flex-row">
      <Select
        value={identificado}
        onValueChange={(v) => navegar({ identificado: v === "todos" ? null : v })}
      >
        <SelectTrigger className="h-8 w-full sm:w-[140px] border-none bg-transparent shadow-none text-xs focus:ring-0">
          <SelectValue placeholder="Identificado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos" className="text-xs">Todos</SelectItem>
          <SelectItem value="sim" className="text-xs">Identificado</SelectItem>
          <SelectItem value="nao" className="text-xs">Anônimo</SelectItem>
        </SelectContent>
      </Select>

      <div className="hidden sm:block h-4 w-px shrink-0 bg-border/50 mx-1" />

      <Select
        value={converteu}
        onValueChange={(v) => navegar({ converteu: v === "todos" ? null : v })}
      >
        <SelectTrigger className="h-8 w-full sm:w-[140px] border-none bg-transparent shadow-none text-xs focus:ring-0">
          <SelectValue placeholder="Converteu" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos" className="text-xs">Comprou ou não</SelectItem>
          <SelectItem value="sim" className="text-xs">Converteu</SelectItem>
          <SelectItem value="nao" className="text-xs">Não converteu</SelectItem>
        </SelectContent>
      </Select>

      <div className="hidden sm:block h-4 w-px shrink-0 bg-border/50 mx-1" />

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
          placeholder="Buscar por e-mail ou trck_user_id"
          className="h-8 pl-8 border-none bg-transparent shadow-none text-xs focus-visible:ring-0"
          aria-label="Buscar por e-mail ou trck_user_id"
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
            onClick={() =>
              navegar({ periodo: PERIODO_PADRAO, identificado: null, converteu: null, q: null })
            }
          >
            Limpar
          </Button>
        ) : null}
      </div>
    </div>
  )
}
