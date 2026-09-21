import Link from "next/link"

import { cn } from "@/lib/utils"
import type { VisitorCounts } from "@/lib/dashboard/leads"
import type { LeadFilters } from "@/lib/dashboard/leads-filters"

type ChipAction = {
  identificado: "todos" | "sim" | "nao"
  converteu: "todos" | "sim" | "nao"
}

export function VisitorChips({
  contagens,
  filtrosAtuais,
  params,
}: {
  contagens: VisitorCounts
  filtrosAtuais: LeadFilters
  params: URLSearchParams
}) {
  function href(action: ChipAction) {
    const p = new URLSearchParams(params)
    p.delete("pagina")

    if (action.identificado !== "todos") p.set("identificado", action.identificado)
    else p.delete("identificado")

    if (action.converteu !== "todos") p.set("converteu", action.converteu)
    else p.delete("converteu")

    const qs = p.toString()
    return qs ? `/leads?${qs}` : "/leads"
  }

  const chips = [
    {
      label: "Visitantes",
      valor: contagens.visitantes,
      action: { identificado: "todos", converteu: "todos" } as ChipAction,
    },
    {
      label: "Leads",
      valor: contagens.leads,
      action: { identificado: "sim", converteu: "nao" } as ChipAction,
      classe: "text-amber-500 dark:text-amber-400",
    },
    {
      label: "Clientes",
      valor: contagens.clientes,
      action: { identificado: "todos", converteu: "sim" } as ChipAction,
      classe: "text-emerald-500 dark:text-emerald-400",
    },
    {
      label: "Identificados",
      valor: contagens.identificados,
      action: { identificado: "sim", converteu: "todos" } as ChipAction,
      classe: "text-blue-500 dark:text-blue-400",
    },
    {
      label: "Anônimos",
      valor: contagens.anonimos,
      action: { identificado: "nao", converteu: "todos" } as ChipAction,
      classe: "text-muted-foreground",
    },
  ]

  return (
    <div className="flex w-full gap-1 sm:gap-2">
      {chips.map(({ label, valor, action, classe }) => {
        const selecionado =
          filtrosAtuais.identificado === action.identificado &&
          filtrosAtuais.converteu === action.converteu

        return (
          <Link
            key={label}
            href={href(action)}
            scroll={false}
            aria-current={selecionado ? "true" : undefined}
            className={cn(
              "glass flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border p-1.5 transition-colors sm:rounded-xl sm:p-2",
              selecionado
                ? "border-primary/50 ring-1 ring-primary/30"
                : "hover:border-foreground/20",
              valor === 0 && !selecionado && "opacity-50"
            )}
          >
            <span
              className={cn(
                "font-mono text-base font-semibold leading-none tabular-nums sm:text-lg md:text-xl lg:text-2xl",
                classe
              )}
            >
              {valor.toLocaleString("pt-BR")}
            </span>
            <span className="whitespace-nowrap text-center text-[7px] font-bold uppercase tracking-tighter text-muted-foreground sm:text-[8px] md:text-[10px] lg:text-xs">
              {label}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
