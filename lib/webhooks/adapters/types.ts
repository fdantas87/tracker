/**
 * Forma normalizada de uma compra, independente da plataforma de venda.
 *
 * Cada adaptador (PerfectPay hoje; Hotmart, Kiwify, Eduzz depois) traduz o
 * payload da sua plataforma para este formato, e todo o resto do sistema —
 * vinculação com o visitante, disparo pro Meta e GA4, dashboard — conhece só
 * isto. Adicionar uma plataforma nova é escrever um adaptador, nada mais.
 */

/** Enum canônico, igual ao CHECK da coluna `purchases.status`. */
export type PurchaseStatus =
  | "approved"
  | "refunded"
  | "chargeback"
  | "canceled"
  | "pending"
  | "expired"

export type NormalizedPurchase = {
  /** Identificador da transação na plataforma. Chave de idempotência. */
  transactionId: string
  status: PurchaseStatus
  /** Valor bruto de status como a plataforma mandou, preservado pra auditoria. */
  platformStatus: string

  amount: number
  currency: string

  productName: string | null
  productId: string | null

  buyerEmail: string | null
  buyerPhone: string | null
  buyerFirstName: string | null
  buyerLastName: string | null

  /** Nosso trck_user_id, quando a plataforma repassou o parâmetro do checkout. */
  trckUserId: string | null

  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmTerm: string | null
  utmContent: string | null
}

export type AdapterResult =
  | { ok: true; purchase: NormalizedPurchase }
  | { ok: false; error: string }

export type WebhookAdapter = {
  platform: string
  parse: (body: Record<string, unknown>) => AdapterResult
}
