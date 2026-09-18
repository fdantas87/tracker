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
    <div className="glass rounded-2xl p-5">
      <p className="text-sm text-muted-foreground">{label}</p>

      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums sm:text-3xl">
        {valor}
      </p>

      {legenda ? (
        <p className={cn("mt-2 flex items-center gap-1.5 text-xs", corDaLegenda)}>
          {Icone ? <Icone className="size-3.5 shrink-0" /> : null}
          <span className="min-w-0 truncate">{legenda}</span>
        </p>
      ) : null}
    </div>
  )
}
