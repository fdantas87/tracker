import type { ComponentType, ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * O card de número do painel.
 *
 * Sobre o idiom que já existia solto em `app/(dashboard)/page.tsx`
 * (`glass rounded-2xl p-5` + `font-mono … tabular-nums`), agora com ícone e
 * legenda. Usa a utility `.glass` do `globals.css`, não o `ui/card.tsx` — o
 * shadcn Card nunca foi usado neste app e traria um segundo vocabulário visual
 * para o mesmo papel.
 *
 * `tabular-nums` não é detalhe estético: sem ele os dígitos têm larguras
 * diferentes e uma fileira de cards "dança" a cada atualização de valor.
 */
export function StatCard({
  label,
  valor,
  legenda,
  icone: Icone,
  tom = "neutro",
}: {
  label: string
  valor: ReactNode
  legenda?: ReactNode
  icone?: ComponentType<{ className?: string }>
  tom?: "neutro" | "positivo" | "atencao" | "negativo"
}) {
  const corDaLegenda = {
    neutro: "text-muted-foreground",
    positivo: "text-primary",
    atencao: "text-cyan",
    negativo: "text-destructive",
  }[tom]

  return (
    <div className="relative flex flex-col justify-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-6 sm:p-8 shadow-sm">
      <div className="pointer-events-none absolute -top-16 left-1/2 h-32 w-full max-w-[200px] -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-2xl" />
      <div className="relative z-10 flex flex-col items-center text-center">
        <p className="text-sm text-muted-foreground">{label}</p>

        <p className="mt-2 font-mono text-4xl font-semibold tabular-nums tracking-tight">
          {valor}
        </p>

        {legenda ? (
          <p className={cn("mt-3 flex items-center justify-center gap-1.5 text-[13px]", corDaLegenda)}>
            {Icone ? <Icone className="size-3.5 shrink-0" /> : null}
            <span className="min-w-0 truncate">{legenda}</span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
