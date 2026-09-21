"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"
import { PERIODOS, PERIODO_PADRAO, type PeriodoKey } from "@/lib/dashboard/filters"

const SHOW_ON_ROUTES = ["/", "/eventos", "/leads", "/vendas", "/geo"]

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

  return (
    <div className="flex shrink-0 max-w-full overflow-x-auto rounded-lg border p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {(Object.keys(PERIODOS) as PeriodoKey[]).map((chave) => (
        <button
          key={chave}
          type="button"
          onClick={() => setPeriodo(chave)}
          aria-pressed={periodo === chave}
          className={cn(
            "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors sm:px-3 sm:py-1.5",
            periodo === chave
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {PERIODOS[chave].label}
        </button>
      ))}
    </div>
  )
}
