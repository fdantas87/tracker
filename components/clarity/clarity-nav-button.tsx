import * as React from "react"
import { ArrowUpRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Botão da navbar do Mapa de Calor: um formato só para as ações do lado
 * direito. (O "atualizar" não usa este botão: ele é só ícone, colado no
 * horário da última atualização.)
 *
 * Abaixo de `sm` o rótulo vira `sr-only`: o botão fica só com o ícone na tela
 * e continua com nome acessível — a navbar não quebra em duas linhas no celular.
 */
export function ClarityNavButton({
  icone,
  rotulo,
  externo = false,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  icone: React.ReactNode
  rotulo: string
  /** Abre outra aba: ganha a seta no fim, o sinal de "sai do painel". */
  externo?: boolean
}) {
  const conteudo = (
    <>
      {icone}
      <span className="max-sm:sr-only">{rotulo}</span>
      {externo ? <ArrowUpRight aria-hidden className="-mr-1 size-3 opacity-60 max-sm:hidden" /> : null}
    </>
  )

  return (
    <Button
      variant="ghost"
      title={rotulo}
      className={cn(
        "h-8 gap-1.5 rounded-lg border border-border/70 bg-card/40 px-3 text-[0.8rem] font-medium text-muted-foreground max-sm:w-8 max-sm:px-0",
        "hover:border-border hover:bg-muted hover:text-foreground dark:hover:bg-muted/60",
        "[&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    >
      {/* Com asChild, o filho (ex.: <a>) recebe o conteúdo padronizado. */}
      {props.asChild && React.isValidElement<{ children?: React.ReactNode }>(children)
        ? React.cloneElement(children, undefined, conteudo)
        : conteudo}
    </Button>
  )
}
