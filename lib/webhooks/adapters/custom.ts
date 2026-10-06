import { LIMITS, cleanAmount, cleanString } from "@/lib/validation"
import type {
  AdapterResult,
  PaymentMethod,
  PurchaseStatus,
  WebhookAdapter,
} from "./types"

/**
 * Adaptador de contrato fixo — `/api/webhook/custom` (e o caminho antigo `/api/webhook/compra/custom`).
 *
 * Para qualquer plataforma sem adaptador próprio: quem integra (n8n, Make,
 * Zapier, o sistema do próprio cliente) monta este JSON e pronto. O formato é
 * NOSSO, então aqui a leitura é estrita — campo com nome errado vira erro com
 * mensagem clara, em vez da tolerância dos adaptadores de plataforma, que
 * existem para aguentar payload de terceiro que não controlamos.
 *
 * Só compra/transação. Eventos por nome (Lead, InitiateCheckout) ficam fora.
 *
 * Este módulo não tem `server-only`: a aba Webhook (Client Component) importa
 * o exemplo e a tabela de status daqui, para a documentação na tela e o código
 * nunca divergirem.
 */

export const CUSTOM_PAYLOAD_EXAMPLE = {
  token: "SEU_TOKEN",
  transaction: { id: "12345678" },
  event: { status: "approved" },
  payment: {
    amount: 147.9,
    currency: "BRL",
    method: "credit_card",
    platform_method: "Visa",
  },
  product: { id: "prod_1", name: "Nome do produto", omit_from_ads: false },
  lead: {
    email: "comprador@email.com",
    phone: "+5511999999999",
    first_name: "João",
    last_name: "Silva",
    postal_code: "01001-000",
  },
  parameter: { src: "id-do-rastreio" },
}

type Efeito =
  | { kind: "purchase"; status: PurchaseStatus }
  | { kind: "statusUpdate"; status: PurchaseStatus }
  | { kind: "ignored" }

/**
 * `event.status` aceito -> o que acontece.
 *
 * Reembolso, cancelamento e chargeback só trocam o status de uma venda já
 * gravada: o integrador costuma mandar esses eventos sem repetir email e
 * valor, e o upsert da linha inteira apagaria os dois.
 */
const STATUS: Record<string, Efeito> = {
  approved: { kind: "purchase", status: "approved" },
  waiting_payment: { kind: "purchase", status: "pending" },
  billet_pix_generate: { kind: "purchase", status: "pending" },
  refund: { kind: "statusUpdate", status: "refunded" },
  canceled: { kind: "statusUpdate", status: "canceled" },
  chargeback: { kind: "statusUpdate", status: "chargeback" },
  abandoned_cart: { kind: "ignored" },
  trial: { kind: "ignored" },
  subscribe: { kind: "ignored" },
}

/** A mesma tabela, em texto, para a aba Webhook. */
export const CUSTOM_STATUS_DOC: { status: string; efeito: string }[] = [
  { status: "approved", efeito: "Grava a venda aprovada e dispara o Purchase (Meta e GA4)" },
  { status: "waiting_payment", efeito: "Grava a venda como pendente, sem Purchase" },
  { status: "billet_pix_generate", efeito: "Grava a venda como pendente, sem Purchase" },
  { status: "refund", efeito: "Marca uma venda já registrada como reembolsada" },
  { status: "canceled", efeito: "Marca uma venda já registrada como cancelada" },
  { status: "chargeback", efeito: "Marca uma venda já registrada como chargeback" },
  { status: "abandoned_cart, trial, subscribe", efeito: "Aceito e ignorado (responde 200)" },
]

const PAYMENT_METHODS: readonly PaymentMethod[] = ["credit_card", "billet", "pix", "other"]

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function parse(body: Record<string, unknown>): AdapterResult {
  // O status vem antes de tudo: um evento ignorado não precisa trazer id nem
  // valor, e exigir isso transformaria um "não uso" em 400.
  const statusRaw = cleanString(asObject(body.event).status, LIMITS.eventName)
  if (!statusRaw) {
    return { ok: false, error: "payload sem `event.status`" }
  }

  const efeito = STATUS[statusRaw.toLowerCase()]
  if (!efeito) {
    return { ok: false, error: `event.status desconhecido: ${statusRaw}` }
  }
  if (efeito.kind === "ignored") {
    return { ok: true, ignored: "status_fora_do_escopo" }
  }

  const transactionId = cleanString(asObject(body.transaction).id, LIMITS.id)
  if (!transactionId) {
    return { ok: false, error: "payload sem `transaction.id`" }
  }

  if (efeito.kind === "statusUpdate") {
    return {
      ok: true,
      statusUpdate: { transactionId, status: efeito.status, platformStatus: statusRaw },
    }
  }

  const payment = asObject(body.payment)

  // Sem valor ou moeda a venda não é gravada: um Purchase de valor 0 no Meta
  // seria um erro silencioso, e a moeda decide o país do telefone.
  const amount = cleanAmount(payment.amount)
  if (amount === null) {
    return { ok: false, error: "`payment.amount` ausente ou inválido (número >= 0)" }
  }

  const currency = cleanString(payment.currency, 8)?.toUpperCase() ?? null
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, error: "`payment.currency` ausente ou inválido (ISO 4217, ex.: BRL)" }
  }

  // Ausente = não sei (null); fora dos quatro = sei que não é cartão, boleto
  // nem Pix (other). Mesma distinção dos outros adaptadores.
  const methodRaw = cleanString(payment.method, LIMITS.shortText)
  const paymentMethod = methodRaw
    ? (PAYMENT_METHODS.find((m) => m === methodRaw.toLowerCase()) ?? "other")
    : null

  const product = asObject(body.product)
  const lead = asObject(body.lead)
  const src = cleanString(asObject(body.parameter).src, LIMITS.id)

  return {
    ok: true,
    purchase: {
      transactionId,
      status: efeito.status,
      platformStatus: statusRaw,

      amount,
      currency,

      paymentMethod,
      platformPaymentMethod:
        cleanString(payment.platform_method, LIMITS.shortText) ?? methodRaw,

      productName: cleanString(product.name, LIMITS.shortText),
      productId: cleanString(product.id, LIMITS.id),
      omitProductFromAds: product.omit_from_ads === true,

      buyerEmail: cleanString(lead.email, LIMITS.shortText),
      buyerPhone: cleanString(lead.phone, LIMITS.shortText),
      buyerFirstName: cleanString(lead.first_name, LIMITS.shortText),
      buyerLastName: cleanString(lead.last_name, LIMITS.shortText),
      buyerPostalCode: cleanString(lead.postal_code, LIMITS.shortText),

      // O `track.js` põe o id em links de checkout como UUID; se vier embutido
      // num texto maior, extrai. Sem cara de UUID, vale como veio.
      trckUserId: src?.match(UUID_PATTERN)?.[0] ?? src,

      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
    },
  }
}

export const customAdapter: WebhookAdapter = {
  platform: "custom",
  parse,
}
