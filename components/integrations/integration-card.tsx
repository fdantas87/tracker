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
export type IntegrationStatus = "conectado" | "disponivel" | "em-breve"

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  conectado: "conectado",
  disponivel: "não configurado",
  "em-breve": "em breve",
}

export function IntegrationCard({
  name,
  description,
  icon: Icon,
  status,
  children,
}: {
  name: string
  description: string
  icon: LucideIcon
  status: IntegrationStatus
  /** Ações do card (botões, formulário). Ausente em integração futura. */
  children?: React.ReactNode
}) {
  const indisponivel = status === "em-breve"

  return (
    <li
      className={`glass flex flex-col gap-4 rounded-2xl p-5 ${
        indisponivel ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background/60">
          <Icon className="size-5 text-muted-foreground" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{name}</h3>
            {status === "conectado" ? (
              <Badge>{STATUS_LABEL[status]}</Badge>
            ) : (
              <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {children ? <div className="flex flex-col gap-3">{children}</div> : null}
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
      <ul className="grid gap-3 lg:grid-cols-2">{children}</ul>
    </section>
  )
}
