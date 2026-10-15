"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"
import { PERIODO_PADRAO } from "@/lib/dashboard/filters"
import {
  PERIODOS,
  datasDoPeriodo,
  lerPeriodo,
  periodoPersonalizado,
  rotuloDoPeriodo,
  type PeriodoFixo,
  type PeriodoKey,
} from "@/lib/dashboard/periodo"
import { PeriodRangePicker } from "@/components/dashboard/period-range-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const SHOW_ON_ROUTES = ["/", "/eventos", "/leads", "/vendas", "/geo", "/mapa-de-calor"]

const FIXOS = Object.keys(PERIODOS) as PeriodoFixo[]

export function TopbarPeriodSelector() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  if (!SHOW_ON_ROUTES.includes(pathname)) return null

  const periodo = lerPeriodo(searchParams.get("periodo"), PERIODO_PADRAO)
  const datas = datasDoPeriodo(periodo)

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
    <>
      {/* Abaixo de sm, as pílulas + tema + conta não cabem em 360px ao lado do
          título: vira um select compacto, e o calendário fica ao lado. */}
      <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoKey)}>
        <SelectTrigger size="sm" aria-label="Período" className="text-xs sm:hidden">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {FIXOS.map((chave) => (
            <SelectItem key={chave} value={chave} className="text-xs">
              {PERIODOS[chave].label}
            </SelectItem>
          ))}
          {datas ? (
            <SelectItem value={periodo} className="text-xs tabular-nums">
              {rotuloDoPeriodo(periodo)}
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>
      <div className="flex items-center rounded-lg border p-0.5">
        {FIXOS.map((chave) => (
          <button
            key={chave}
            type="button"
            onClick={() => setPeriodo(chave)}
            aria-pressed={periodo === chave}
            className={cn(
              "hidden shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:block",
              periodo === chave
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {PERIODOS[chave].label}
          </button>
        ))}
        <span aria-hidden className="mx-0.5 hidden h-4 w-px bg-border sm:block" />
        <PeriodRangePicker
          periodo={periodo}
          datas={datas}
          onAplicar={(de, ate) => setPeriodo(periodoPersonalizado(de, ate))}
        />
      </div>
    </>
  )
}
