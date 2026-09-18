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

/**
 * Enum canônico da forma de pagamento, igual ao CHECK de
 * `purchases.payment_method`.
 *
 * Propositalmente grosso: a tela de Vendas quebra em Cartão / Pix / Boleto /
 * Outros, e carteiras (Google Pay, Apple Pay, PicPay, PayPal) não somam o
 * bastante para virar categoria própria. O valor bruto da plataforma fica em
 * `platformPaymentMethod`, então a granularidade não se perde.
 */
export type PaymentMethod = "credit_card" | "billet" | "pix" | "other"

export type NormalizedPurchase = {
  /** Identificador da transação na plataforma. Chave de idempotência. */
  transactionId: string
  status: PurchaseStatus
  /** Valor bruto de status como a plataforma mandou, preservado pra auditoria. */
  platformStatus: string

  amount: number
  currency: string

  /**
   * Forma de pagamento canônica, ou null quando a plataforma não informou.
   *
   * `null` e `"other"` são estados diferentes e a tela os distingue: o
   * primeiro é "não sei", o segundo é "sei que não é cartão, boleto nem Pix".
   */
  paymentMethod: PaymentMethod | null
  /** O valor bruto da plataforma, preservado para auditoria. */
  platformPaymentMethod: string | null

  productName: string | null
  productId: string | null

  buyerEmail: string | null
  buyerPhone: string | null
  buyerFirstName: string | null
  buyerLastName: string | null
  /**
   * CEP digitado no checkout, quando a plataforma repassa.
   *
   * Vale mais que o CEP derivado de IP (`visitors.geo_postal_code`), que aponta
   * a área do provedor e não o endereço da pessoa. É o `zp` da Conversions API
   * do Meta, um parâmetro de correspondência a mais.
   */
  buyerPostalCode: string | null

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
