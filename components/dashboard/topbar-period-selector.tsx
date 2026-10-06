"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"
import { PERIODOS, PERIODO_PADRAO, type PeriodoKey } from "@/lib/dashboard/filters"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const SHOW_ON_ROUTES = ["/", "/eventos", "/leads", "/vendas", "/geo", "/mapa-de-calor"]

export function TopbarPeriodSelector() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  if (!SHOW_ON_ROUTES.includes(pathname)) return null

  const p = searchParams.get("periodo")
  const periodo = p && p in PERIODOS ? (p as PeriodoKey) : PERIODO_PADRAO

  function setPeriodo(chave: PeriodoKey) {
    if (chave === periodo) return

    const params = new URLSearchParams(searchParams.toString())
    
    // Deletar o default mantém as URLs limpas sem "?periodo=7d"
    if (chave === PERIODO_PADRAO) {
      params.delete("periodo")
    } else {
      params.set("periodo", chave)
    }

    params.delete("pagina")

    startTransition(() => {
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  const chaves = Object.keys(PERIODOS) as PeriodoKey[]

  return (
    <>
      {/* Abaixo de sm, 4 pílulas + tema + conta não cabem em 360px ao lado do
          título: vira um select compacto. */}
      <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoKey)}>
        <SelectTrigger size="sm" aria-label="Período" className="text-xs sm:hidden">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {chaves.map((chave) => (
            <SelectItem key={chave} value={chave} className="text-xs">
              {PERIODOS[chave].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="hidden rounded-lg border p-0.5 sm:flex">
        {chaves.map((chave) => (
          <button
            key={chave}
            type="button"
            onClick={() => setPeriodo(chave)}
            aria-pressed={periodo === chave}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              periodo === chave
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {PERIODOS[chave].label}
          </button>
        ))}
      </div>
    </>
  )
}
