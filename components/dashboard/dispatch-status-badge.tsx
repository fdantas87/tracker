import { CheckCircle2, Clock, MinusCircle, Send, XCircle } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { DispatchStatus } from "@/lib/dashboard/filters"

/**
 * O estado de um evento na fila da fase 7.5, em uma etiqueta.
 *
 * `skipped` NÃO é erro e a cor não pode sugerir que seja: é o evento com mais
 * de 6 dias que `claim_pending_events` descarta de propósito, porque um
 * `event_time` velho faz o Meta rejeitar o lote inteiro. Mesma lição da fase 4,
 * onde um resultado esperado pintado de âmbar foi lido como falha.
 */

export const STATUS_META: Record<
  DispatchStatus,
  { label: string; classe: string; Icone: typeof CheckCircle2; ajuda: string }
> = {
  sent: {
    label: "Enviado",
    classe: "border-primary/30 bg-primary/10 text-primary",
    Icone: CheckCircle2,
    ajuda: "Saiu para a Conversions API e o Meta confirmou o recebimento.",
  },
  pending: {
    label: "Na fila",
    classe: "border-border bg-muted/60 text-muted-foreground",
    Icone: Clock,
    ajuda:
      "Aguardando a janela de atraso. Se a pessoa converter antes, a fila é liberada na hora e o evento sai enriquecido.",
  },
  sending: {
    label: "Enviando",
    classe: "border-cyan/30 bg-cyan/10 text-cyan",
    Icone: Send,
    ajuda: "Reivindicado por um worker agora mesmo. Deve virar Enviado em segundos.",
  },
  failed: {
    label: "Falhou",
    classe: "border-destructive/30 bg-destructive/10 text-destructive",
    Icone: XCircle,
    ajuda:
      "Todos os pixels recusaram, nas 5 tentativas (1/5/15/60 min). O motivo está no evento.",
  },
  skipped: {
    label: "Descartado",
    classe: "border-border bg-muted/40 text-muted-foreground",
    Icone: MinusCircle,
    ajuda:
      "Não é erro: evento com mais de 6 dias é descartado de propósito, porque um event_time velho faz o Meta rejeitar o lote inteiro.",
  },
}

export function DispatchStatusBadge({
  status,
  className,
}: {
  status: DispatchStatus
  className?: string
}) {
  const meta = STATUS_META[status] ?? STATUS_META.pending
  const { Icone } = meta

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
            meta.classe,
            className
          )}
        >
          <Icone className="size-3.5 shrink-0" aria-hidden />
          {meta.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{meta.ajuda}</TooltipContent>
    </Tooltip>
  )
}
