import type { LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

/**
 * Estado de uma integração na lista.
 *
 * "disponivel" e "em-breve" são coisas diferentes e a tela não pode confundi-las:
 * a primeira é "dá pra conectar agora", a segunda é "ainda não existe". Sem
 * essa distinção, um card cinza deixaria o operador tentando configurar algo
 * que não foi construído.
 */
import { cn } from "@/lib/utils"

export type IntegrationStatus = "conectado" | "disponivel" | "em-breve"

export function IntegrationCard({
  name,
  description,
  icon: Icon,
  status,
  isActive,
  headerAction,
  actions,
  testResult,
  children,
  onOpen,
}: {
  name: string
  description?: string
  icon: LucideIcon | string
  status: IntegrationStatus
  isActive?: boolean
  headerAction?: React.ReactNode
  actions?: React.ReactNode
  testResult?: React.ReactNode
  children?: React.ReactNode
  /** Card apagado e clicável: abre a configuração para ativar. */
  onOpen?: () => void
}) {
  const indisponivel = status === "em-breve"
  const apagado = indisponivel || isActive === false
  const config = { glow: "bg-primary", bg: "bg-background/50", border: "border-border" }

  return (
    <li
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.target !== e.currentTarget) return
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onOpen()
              }
            }
          : undefined
      }
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `Configurar ${name}` : undefined}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-5 sm:p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/30",
        apagado && "opacity-60 grayscale hover:opacity-90 hover:grayscale-0",
        onOpen && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      )}
    >
      <div className={cn("pointer-events-none absolute -top-10 -left-10 h-32 w-32 rounded-full blur-3xl opacity-15 transition-opacity group-hover:opacity-30", config.glow)} />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-sm backdrop-blur-md border transition-transform group-hover:scale-105 duration-300", config.bg, config.border)}>
            {typeof Icon === "string" ? (
              <img src={Icon} alt={name} className="size-8 object-contain rounded-md" />
            ) : (
              <Icon className="size-8 text-primary" />
            )}
          </div>

          <div className="min-w-0 flex flex-col gap-1.5">
            <h3 className="text-lg font-bold tracking-tight truncate leading-none text-foreground">{name}</h3>
            {description && indisponivel ? (
              <p className="text-xs text-muted-foreground leading-snug line-clamp-2 mt-1 max-w-[200px]">{description}</p>
            ) : null}
          </div>
        </div>

        {headerAction ? (
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {headerAction}
          </div>
        ) : null}
      </div>

      <div className="relative z-10 mt-6 flex items-center justify-between border-t border-border/50 pt-4">
        <div>
          {isActive !== undefined ? (
            isActive ? (
              <Badge variant="outline" className="border-green-500/30 text-green-600 bg-green-500/10 dark:text-green-400">Ativo</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">Desativado</Badge>
            )
          ) : (
            <Badge variant="outline" className={status === "conectado" ? "border-green-500/30 text-green-600 bg-green-500/10 dark:text-green-400" : "text-muted-foreground"}>
              {status === "conectado" ? "Conectado" : status === "disponivel" ? "Não configurado" : "Em breve"}
            </Badge>
          )}
        </div>
        
        {actions && (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </div>

      {testResult ? (
        <div className="relative z-10 mt-4 border-t border-border/50 pt-4">
          {testResult}
        </div>
      ) : null}
      
      {children ? (
        <div className="relative z-10 mt-4 border-t border-border/50 pt-4">
          {children}
        </div>
      ) : null}
    </li>
  )
}

export function IntegrationSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-medium">{title}</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{children}</ul>
    </section>
  )
}
