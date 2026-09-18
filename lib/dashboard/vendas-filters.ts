/**
 * Vocabulário dos filtros da tela de Vendas — valores e tipos, sem acesso a
 * dados.
 *
 * Módulo próprio, não importado de `./filters` nem de `./leads-filters`: cada
 * tela mantém seu filtro autocontido. E, como nas outras duas, o motivo
 * estrutural continua valendo — `lib/dashboard/vendas.ts` importa
 * `server-only`, e a barra de filtros é Client Component; se ela importasse
 * uma constante de lá, o bundler arrastaria o módulo inteiro para o cliente e
 * o build quebraria com "'server-only' cannot be imported from a Client
 * Component module".
 */

import type { PaymentMethod, PurchaseStatus } from "@/lib/webhooks/adapters/types"
import { inicioDoDiaLocal } from "./timezone"

/** Mesma semântica das outras telas: dias de calendário, não janela deslizante. */
export const PERIODOS = {
  hoje: { label: "Hoje", dias: 1 },
  "7d": { label: "7 dias", dias: 7 },
  "30d": { label: "30 dias", dias: 30 },
  tudo: { label: "Tudo", dias: null },
} as const

export type PeriodoKey = keyof typeof PERIODOS

export const PERIODO_PADRAO: PeriodoKey = "30d"

export const PAGE_SIZE = 50

export const STATUS_VALORES = [
  "approved",
  "pending",
  "refunded",
  "chargeback",
  "canceled",
  "expired",
] as const satisfies readonly PurchaseStatus[]

/**
 * O filtro de pagamento tem um valor a mais que o enum do banco:
 * `nao_informado`, que casa com `payment_method is null`. Sem ele não haveria
 * como isolar as compras cuja forma de pagamento a plataforma não mandou — e
 * elas não são "outros", são "não sei" (ver o comentário da coluna na
 * migration 20260919120000).
 */
export const PAGAMENTO_VALORES = [
  "credit_card",
  "pix",
  "billet",
  "other",
  "nao_informado",
] as const

export type PagamentoFiltro = (typeof PAGAMENTO_VALORES)[number]

/** Rótulos em pt-BR, usados pelo filtro, pela tabela e pelo gráfico. */
export const PAGAMENTO_LABELS: Record<PaymentMethod, string> = {
  credit_card: "Cartão",
  pix: "Pix",
  billet: "Boleto",
  other: "Outros",
}

export const PAGAMENTO_NAO_INFORMADO = "Não informado"

export type VendaFilters = {
  /** Busca por e-mail, transação, produto ou nome do comprador. */
  q?: string
  status?: PurchaseStatus
  pagamento?: PagamentoFiltro
  /** Sobre purchases.created_at. */
  periodo: PeriodoKey
  pagina: number
}

/** Início do recorte, ou null para "tudo" — sempre meia-noite no fuso do painel. */
export function periodoInicio(periodo: PeriodoKey): Date | null {
  const cfg = PERIODOS[periodo] ?? PERIODOS[PERIODO_PADRAO]
  if (cfg.dias === null) return null

  return inicioDoDiaLocal(cfg.dias - 1)
}
