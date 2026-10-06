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
import { PERIODOS, PERIODO_PADRAO, type PeriodoKey } from "@/lib/dashboard/filters"

const TODOS = "__todos__"

/**
 * Os filtros vivem na URL, não em estado de React: o link é compartilhável, o
 * botão voltar funciona e a página continua sendo renderizada no servidor —
 * sem nenhum useEffect de busca.
 */
export function EventsFilters({
  nomes,
  periodo,
  evento,
  q,
}: {
  nomes: string[]
  periodo: PeriodoKey
  evento?: string
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

    // Qualquer mudança de filtro reinicia a paginação: continuar na página 7 de
    // um recorte que agora tem 2 páginas mostraria uma tabela vazia.
    params.delete("pagina")

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const temFiltro =
    Boolean(evento || q || searchParams.get("status")) || periodo !== PERIODO_PADRAO

  return (
    <div className="glass mb-2 flex flex-col items-stretch gap-y-1 rounded-xl p-1.5 sm:-mt-4 sm:flex-row sm:items-center">
      <Select
        value={evento ?? TODOS}
        onValueChange={(v) => navegar({ evento: v === TODOS ? null : v })}
      >
        <SelectTrigger className="h-8 w-full sm:w-[220px] border-none bg-transparent shadow-none text-xs focus:ring-0">
          <SelectValue placeholder="Todos os eventos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS} className="text-xs">Todos os eventos</SelectItem>
          {nomes.map((nome) => (
            <SelectItem key={nome} value={nome} className="text-xs">
              {nome}
            </SelectItem>
          ))}
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
          placeholder="Buscar por event_id ou trck_user_id"
          className="h-8 pl-8 border-none bg-transparent shadow-none text-xs focus-visible:ring-0"
          aria-label="Buscar por event_id ou trck_user_id"
        />
      </form>

      <div className="flex shrink-0 items-center justify-end gap-2 px-2 empty:hidden">
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
              navegar({ periodo: PERIODO_PADRAO, evento: null, q: null, status: null })
            }
          >
            Limpar
          </Button>
        ) : null}
      </div>
    </div>
  )
}
