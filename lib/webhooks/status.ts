import type { PurchaseStatus } from "@/lib/webhooks/adapters/types"

/**
 * O status que uma venda deve ter depois de um webhook, dado o que já estava
 * gravado.
 *
 * A regra é uma só: **uma venda nunca volta para `pending`.** Plataforma que
 * entrega "at-least-once" e sem ordem garantida (a Bask documenta as duas
 * coisas) pode mandar o "pedido criado" DEPOIS do "pagamento confirmado", e a
 * gravação é um upsert da linha inteira — sem esta regra, a venda aprovada
 * voltaria a pendente e sumiria do faturamento.
 *
 * O que NÃO é bloqueado, de propósito: sair de `refunded`/`chargeback` para
 * `approved`. Parece regressão e às vezes é legítimo — disputa ganha pelo
 * vendedor devolve a venda para aprovada. Travar isso congelaria como
 * chargeback uma receita que voltou. O Purchase não é reenviado nesse caso de
 * qualquer jeito, porque a trava de `meta_event_id` já foi usada.
 */
export function resolveStatus(
  atual: { status: string; platformStatus: string } | null,
  novo: { status: PurchaseStatus; platformStatus: string }
): { status: PurchaseStatus; platformStatus: string; mantido: boolean } {
  if (atual && novo.status === "pending" && atual.status !== "pending") {
    return {
      status: atual.status as PurchaseStatus,
      platformStatus: atual.platformStatus,
      mantido: true,
    }
  }

  return { status: novo.status, platformStatus: novo.platformStatus, mantido: false }
}
