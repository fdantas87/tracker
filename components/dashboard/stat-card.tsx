import type { ComponentType, ReactNode } from "react"
import { Info } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
  info,
  compacto = false,
  acento = "primary",
  children,
}: {
  label: string
  valor: ReactNode
  legenda?: ReactNode
  icone?: ComponentType<{ className?: string }>
  tom?: "neutro" | "positivo" | "atencao" | "negativo"
  /** Explicação da métrica, num balão ao lado do título — no lugar da legenda. */
  info?: ReactNode
  /** Menos respiro e número menor — para fileiras de 6 cards numa linha só. */
  compacto?: boolean
  /** Cor do gradiente e do brilho de fundo. `destructive` para métricas negativas. */
  acento?: "primary" | "destructive"
  /** Abaixo do número, na largura do card (ex.: o gráfico de tendência). */
  children?: ReactNode
}) {
  const corDaLegenda = {
    neutro: "text-muted-foreground",
    positivo: "text-primary",
    atencao: "text-cyan",
    negativo: "text-destructive",
  }[tom]

  // Sem legenda, o tom vai para o número — senão ele não apareceria em lugar
  // nenhum. Neutro mantém a cor normal do texto, não o cinza da legenda.
  const corDoValor = legenda || tom === "neutro" ? undefined : corDaLegenda

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col justify-center overflow-hidden rounded-3xl border bg-gradient-to-b to-transparent shadow-sm",
        acento === "destructive" ? "from-destructive/10" : "from-primary/5",
        compacto ? "p-4 sm:p-5" : "p-5 sm:p-8",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -top-16 left-1/2 h-32 w-full max-w-[200px] -translate-x-1/2 rounded-full opacity-50 blur-2xl",
          acento === "destructive" ? "bg-destructive/20" : "bg-primary/15",
        )}
      />
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <p className={cn(compacto && "leading-tight")}>{label}</p>
          {info ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Sobre ${label}`}
                  className="rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Info className="size-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-left leading-relaxed">{info}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        <p
          className={cn(
            "mt-2 max-w-full break-words font-mono font-semibold tabular-nums tracking-tight",
            compacto ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl",
            corDoValor,
          )}
        >
          {valor}
        </p>

        {legenda ? (
          <p className={cn("mt-3 flex items-center justify-center gap-1.5 text-[13px]", corDaLegenda)}>
            {Icone ? <Icone className="size-3.5 shrink-0" /> : null}
            <span className="min-w-0 truncate">{legenda}</span>
          </p>
        ) : null}
      </div>

      {children ? <div className="relative z-10 mt-4 w-full">{children}</div> : null}
    </div>
  )
}
