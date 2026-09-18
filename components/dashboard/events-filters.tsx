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
    <div className="glass flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center">
      <div className="flex shrink-0 rounded-lg border p-0.5">
        {(Object.keys(PERIODOS) as PeriodoKey[]).map((chave) => (
          <button
            key={chave}
            type="button"
            onClick={() => navegar({ periodo: chave })}
            aria-pressed={periodo === chave}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              periodo === chave
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {PERIODOS[chave].label}
          </button>
        ))}
      </div>

      <Select
        value={evento ?? TODOS}
        onValueChange={(v) => navegar({ evento: v === TODOS ? null : v })}
      >
        <SelectTrigger className="w-full sm:w-52">
          <SelectValue placeholder="Todos os eventos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos os eventos</SelectItem>
          {nomes.map((nome) => (
            <SelectItem key={nome} value={nome}>
              {nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <form
        className="relative flex-1"
        onSubmit={(e) => {
          e.preventDefault()
          const valor = new FormData(e.currentTarget).get("q")
          navegar({ q: typeof valor === "string" ? valor.trim() : null })
        }}
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por event_id ou trck_user_id"
          className="pl-9 font-mono text-xs"
          aria-label="Buscar por event_id ou trck_user_id"
        />
      </form>

      <div className="flex shrink-0 items-center gap-2">
        {pendente ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Carregando" />
        ) : null}
        {temFiltro ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              navegar({ periodo: PERIODO_PADRAO, evento: null, q: null, status: null })
            }
          >
            <X className="size-4" aria-hidden />
            Limpar
          </Button>
        ) : null}
      </div>
    </div>
  )
}
