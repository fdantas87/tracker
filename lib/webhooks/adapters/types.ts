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

  /**
   * Quando true, nome e id do produto ficam só no painel e NÃO vão para o Meta
   * nem para o GA4 (`content_ids`, `content_name`, `items`). Valor e moeda
   * continuam indo.
   *
   * Existe para plataforma de saúde: na Bask o produto é o medicamento, e
   * mandar "SEMAGLUTIDE" para uma plataforma de anúncio é entregar dado de
   * saúde a quem não deveria tê-lo. Omitido = false, que é o comportamento de
   * sempre das outras plataformas.
   */
  omitProductFromAds?: boolean
}

/**
 * Transição de status de uma venda que JÁ existe, sem os dados da venda.
 *
 * Existe porque a gravação normal é um upsert da linha inteira: um evento de
 * reembolso ou de disputa que só traz ids apagaria email, nome e valor já
 * gravados. Com este resultado a rota faz um UPDATE só de `status` e
 * `platform_status`, e o resto da linha fica como estava.
 */
export type StatusUpdate = {
  transactionId: string
  status: PurchaseStatus
  platformStatus: string
}

/**
 * - `purchase`: a venda completa, gravada por upsert.
 * - `statusUpdate`: só muda o status de uma venda já gravada.
 * - `ignored`: o payload é legítimo, mas não é algo que o tracker trata (tipo
 *   de evento fora do escopo, reembolso parcial...). A rota responde 200.
 * - `ok: false`: o payload não é o que a plataforma deveria mandar. A rota
 *   responde 400.
 *
 * A diferença entre `ignored` e erro importa mais do que parece: plataforma
 * que desliga o endpoint sozinha por taxa de falha (a Bask desliga com 50% em
 * 24 h) trataria um 400 de "evento que não usamos" como falha nossa, e o
 * endpoint inteiro cairia por causa de um evento irrelevante.
 */
export type AdapterResult =
  | { ok: true; purchase: NormalizedPurchase }
  | { ok: true; statusUpdate: StatusUpdate }
  | { ok: true; ignored: string }
  | { ok: false; error: string }

export type WebhookAdapter = {
  platform: string
  parse: (body: Record<string, unknown>) => AdapterResult
}
