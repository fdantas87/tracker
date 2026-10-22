import type { PurchaseStatus } from "@/lib/webhooks/adapters/types"

/**
 * O status que uma venda deve ter depois de um webhook, dado o que já estava
 * gravado.
 *
 * Primeira regra: **uma venda nunca volta para `pending`.** Plataforma que
 * entrega "at-least-once" e sem ordem garantida (a Bask documenta as duas
 * coisas) pode mandar o "pedido criado" DEPOIS do "pagamento confirmado", e a
 * gravação é um upsert da linha inteira — sem esta regra, a venda aprovada
 * voltaria a pendente e sumiria do faturamento.
 *
 * Segunda regra: **`refunded`/`chargeback` só voltam para `approved` por
 * evento explícito de reversão** (`permiteReabrir`, usado pela troca de status
 * — hoje a disputa ganha da Bask). Um "pagamento aprovado" comum chegando
 * depois do reembolso é reentrega fora de ordem ou replay, e reabriria uma
 * receita que já saiu. O Purchase não seria reenviado de qualquer jeito (a
 * trava de `meta_event_id` já foi usada), mas o faturamento ficaria inflado.
 */
const TERMINAIS = new Set(["refunded", "chargeback"])

export function resolveStatus(
  atual: { status: string; platformStatus: string } | null,
  novo: { status: PurchaseStatus; platformStatus: string },
  opcoes: { permiteReabrir?: boolean } = {}
): { status: PurchaseStatus; platformStatus: string; mantido: boolean } {
  const rebaixaParaPendente = novo.status === "pending" && atual?.status !== "pending"
  const reabreTerminal =
    novo.status === "approved" && TERMINAIS.has(atual?.status ?? "") && !opcoes.permiteReabrir

  if (atual && (rebaixaParaPendente || reabreTerminal)) {
    return {
      status: atual.status as PurchaseStatus,
      platformStatus: atual.platformStatus,
      mantido: true,
    }
  }

  return { status: novo.status, platformStatus: novo.platformStatus, mantido: false }
}
