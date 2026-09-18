import { Badge } from "@/components/ui/badge"
import type { PurchaseStatus } from "@/lib/webhooks/adapters/types"

/**
 * Etiqueta do status de uma COMPRA — enum próprio de `purchases.status`, não o
 * de disparo (`DispatchStatus`). Não reaproveitar `DispatchStatusBadge`: os
 * dois enums não têm relação nenhuma entre si, e um `"approved"` não existe
 * no vocabulário de disparo.
 */
const LABELS: Record<PurchaseStatus, string> = {
  approved: "Aprovada",
  refunded: "Reembolsada",
  chargeback: "Chargeback",
  canceled: "Cancelada",
  pending: "Pendente",
  expired: "Expirada",
}

const VARIANTES: Record<PurchaseStatus, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default",
  pending: "outline",
  refunded: "secondary",
  canceled: "secondary",
  chargeback: "destructive",
  expired: "secondary",
}

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  return <Badge variant={VARIANTES[status]}>{LABELS[status]}</Badge>
}
