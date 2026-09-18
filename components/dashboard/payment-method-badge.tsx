import { Banknote, CreditCard, HelpCircle, QrCode, Wallet } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  PAGAMENTO_LABELS,
  PAGAMENTO_NAO_INFORMADO,
} from "@/lib/dashboard/vendas-filters"
import type { PaymentMethod } from "@/lib/webhooks/adapters/types"

/**
 * Etiqueta da forma de pagamento de uma compra.
 *
 * `null` NÃO é "Outros": é "a plataforma não informou". Confundir os dois faria
 * a tela afirmar que houve um meio de pagamento exótico onde na verdade não há
 * dado nenhum — e esconderia justamente o sintoma de o adaptador ter parado de
 * ler o campo. Ver o comentário da coluna na migration 20260919120000.
 */
const ICONES: Record<PaymentMethod, typeof CreditCard> = {
  credit_card: CreditCard,
  pix: QrCode,
  billet: Banknote,
  other: Wallet,
}

export function PaymentMethodBadge({ metodo }: { metodo: PaymentMethod | null }) {
  const Icone = metodo ? ICONES[metodo] : HelpCircle

  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <Icone className="size-3.5" aria-hidden />
      {metodo ? PAGAMENTO_LABELS[metodo] : PAGAMENTO_NAO_INFORMADO}
    </Badge>
  )
}
