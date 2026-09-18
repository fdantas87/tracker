import { LIMITS, cleanAmount, cleanString } from "@/lib/validation"
import type {
  AdapterResult,
  PaymentMethod,
  PurchaseStatus,
  WebhookAdapter,
} from "./types"

/**
 * Adaptador do PerfectPay.
 *
 * Estrutura confirmada na documentação oficial (OpenAPI em
 * https://app.perfectpay.com.br/docs/api.json e o exemplo de postback no
 * suporte), não deduzida:
 *
 * {
 *   "token": "...", "code": "PPCPMTB58MNF4E", "sale_amount": 385,
 *   "currency_enum": 1, "sale_status_enum": 2, "date_created": "...",
 *   "product":  { "code", "name", "external_reference", "guarantee" },
 *   "plan":     { "code", "name", "quantity" },
 *   "customer": { "full_name", "email", "identification_number" },
 *   "metadata": { "src", "utm_source", "utm_medium", "utm_campaign", "utm_content" }
 * }
 *
 * `code` é o identificador da transação (chave de idempotência).
 * `metadata.src` é o campo que o PerfectPay repassa da URL do checkout — é por
 * ele que o nosso trck_user_id atravessa do site até a venda.
 */

/**
 * Mapeamento oficial do `sale_status_enum`.
 *
 * DETALHE QUE A DOC AVISA E QUE SERIA IMPOSSÍVEL ADIVINHAR: no PostBack alguns
 * status chegam JÁ NORMALIZADOS pelo próprio PerfectPay —
 * 8/10/16 -> 2, 11 -> 6, 17 -> 9, 18/19/20 -> 7. Ou seja, na prática o webhook
 * entrega um subconjunto. Mapeamos todos mesmo assim, porque receber um valor
 * que não esperávamos é pior do que ter uma linha a mais aqui.
 */
const STATUS_MAP: Record<number, PurchaseStatus> = {
  1: "pending", // aguardando pagamento
  2: "approved", // aprovado
  3: "pending", // in_process (em análise)
  // in_mediation: o dinheiro foi recebido e ainda NÃO foi revertido, então
  // continua contando como receita. Se virar chargeback de fato, chega o 9 e o
  // status muda. O valor cru fica em platform_status pra não perder o sinal.
  4: "approved",
  5: "canceled", // rejected
  6: "canceled", // cancelled
  7: "refunded", // refunded
  8: "approved", // authorized (o postback normaliza pra 2)
  9: "chargeback", // charged_back
  10: "approved", // completed (normaliza pra 2)
  11: "canceled", // checkout_error (normaliza pra 6)
  12: "pending", // precheckout
  13: "expired", // expired
  15: "canceled", // cancelled_regenerated
  16: "approved", // in_review, antifraude (normaliza pra 2)
  17: "chargeback", // pre_chargeback (normaliza pra 9)
  18: "refunded", // pre_refunded (normaliza pra 7)
  19: "refunded", // med (normaliza pra 7)
  20: "refunded", // pre_med (normaliza pra 7)
}

const STATUS_NAMES: Record<number, string> = {
  1: "pending",
  2: "approved",
  3: "in_process",
  4: "in_mediation",
  5: "rejected",
  6: "cancelled",
  7: "refunded",
  8: "authorized",
  9: "charged_back",
  10: "completed",
  11: "checkout_error",
  12: "precheckout",
  13: "expired",
  15: "cancelled_regenerated",
  16: "in_review",
  17: "pre_chargeback",
  18: "pre_refunded",
  19: "med",
  20: "pre_med",
}

/** currency_enum: 1 = BRL, 2 = USD, 3 = EUR. */
const CURRENCY_MAP: Record<number, string> = { 1: "BRL", 2: "USD", 3: "EUR" }

/**
 * Mapeamento oficial do `payment_type_enum`, confirmado no OpenAPI
 * (app.perfectpay.com.br/docs/api.json), não deduzido:
 *
 *   1 credit_card · 2 billet · 3 paypal · 4 credit_card_recurrent
 *   5 free_price · 6 credit_card_upsell · 7 pix · 8 billet_installments
 *   9 open_finance · 10 google_pay · 11 apple_pay · 12 picpay · 16 amazon_pay
 *
 * As três variações de cartão colapsam em `credit_card` e as duas de boleto em
 * `billet`: para o relatório de vendas, "recorrente" e "upsell" são o mesmo
 * meio de pagamento. O bruto continua sendo gravado em
 * `platform_payment_method`, então nada disso se perde.
 *
 * LIMITE CONHECIDO: o OpenAPI documenta a API de vendas; a seção de Webhooks
 * (o payload do PostBack) não está publicada nele e `llms-full.txt` responde
 * 404. Ou seja: está confirmado que a plataforma TEM o campo, não que o
 * postback o entregue com este nome exato. Por isso a leitura abaixo é
 * tolerante e a ausência total vira `null` em vez de `other` — mesma postura
 * já adotada aqui para telefone e CEP.
 */
const PAYMENT_MAP: Record<number, PaymentMethod> = {
  1: "credit_card",
  2: "billet",
  3: "other", // paypal
  4: "credit_card", // recorrente
  5: "other", // free_price
  6: "credit_card", // upsell
  7: "pix",
  8: "billet", // boleto parcelado
  9: "other", // open_finance
  10: "other", // google_pay
  11: "other", // apple_pay
  12: "other", // picpay
  16: "other", // amazon_pay
}

/** Reconhece a forma de pagamento escrita por extenso, quando vier assim. */
const PAYMENT_TEXTO: Record<string, PaymentMethod> = {
  credit_card: "credit_card",
  creditcard: "credit_card",
  cartao: "credit_card",
  cartão: "credit_card",
  billet: "billet",
  boleto: "billet",
  pix: "pix",
}

/**
 * Lê a forma de pagamento aceitando número ou texto, em qualquer dos nomes
 * prováveis de campo.
 *
 * Devolve sempre o bruto junto do canônico: valor desconhecido vira `other`
 * (sabemos que houve pagamento, só não em qual dos três meios), e campo
 * ausente vira `null` (não sabemos nada).
 */
function readPaymentMethod(body: Record<string, unknown>): {
  method: PaymentMethod | null
  raw: string | null
} {
  const bruto =
    cleanString(body.payment_type_enum, LIMITS.shortText) ??
    cleanString(body.payment_method_enum, LIMITS.shortText) ??
    cleanString(body.payment_type, LIMITS.shortText) ??
    cleanString(body.payment_method, LIMITS.shortText)

  if (!bruto) return { method: null, raw: null }

  const numero = Number(bruto)
  if (Number.isFinite(numero) && numero in PAYMENT_MAP) {
    return { method: PAYMENT_MAP[numero], raw: bruto }
  }

  const texto = PAYMENT_TEXTO[bruto.toLowerCase().replace(/[\s-]/g, "_")]
  return { method: texto ?? "other", raw: bruto }
}

/** Reconhece um UUID, pra achar nosso id em qualquer campo repassado. */
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * O PerfectPay manda o nome inteiro em `full_name`; o Meta quer nome e
 * sobrenome separados e hasheados em campos diferentes.
 */
function splitName(fullName: string | null): {
  first: string | null
  last: string | null
} {
  if (!fullName) return { first: null, last: null }
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0], last: null }
  return { first: parts[0], last: parts.slice(1).join(" ") }
}

/**
 * Procura o trck_user_id no metadata. `src` é o campo documentado de
 * repasse, mas varremos os outros também: se o link foi montado de outro
 * jeito, o id ainda pode estar em utm_content ou num campo customizado, e
 * achar a venda vale mais do que ser purista sobre o campo.
 */
function findTrckUserId(metadata: Record<string, unknown>): string | null {
  const direct = cleanString(metadata.src, LIMITS.id)
  if (direct && UUID_PATTERN.test(direct)) {
    return direct.match(UUID_PATTERN)?.[0] ?? direct
  }

  for (const value of Object.values(metadata)) {
    const text = cleanString(value, LIMITS.url)
    const match = text?.match(UUID_PATTERN)
    if (match) return match[0]
  }

  // `src` sem cara de UUID ainda pode ser um id nosso antigo ou customizado.
  return direct
}

function parse(body: Record<string, unknown>): AdapterResult {
  const transactionId = cleanString(body.code, LIMITS.id)
  if (!transactionId) {
    return { ok: false, error: "payload sem `code` (identificador da transação)" }
  }

  const statusRaw = body.sale_status_enum
  const statusNumber =
    typeof statusRaw === "number" ? statusRaw : Number(statusRaw)

  if (!Number.isFinite(statusNumber) || !(statusNumber in STATUS_MAP)) {
    return {
      ok: false,
      error: `sale_status_enum desconhecido: ${String(statusRaw)}`,
    }
  }

  const amount = cleanAmount(body.sale_amount) ?? 0
  const currencyNumber = Number(body.currency_enum)
  const currency = CURRENCY_MAP[currencyNumber] ?? "BRL"

  const pagamento = readPaymentMethod(body)

  const product = asObject(body.product)
  const plan = asObject(body.plan)
  const customer = asObject(body.customer)
  const metadata = asObject(body.metadata)

  const { first, last } = splitName(
    cleanString(customer.full_name, LIMITS.shortText)
  )

  return {
    ok: true,
    purchase: {
      transactionId,
      status: STATUS_MAP[statusNumber],
      platformStatus: STATUS_NAMES[statusNumber] ?? String(statusNumber),

      amount,
      currency,

      paymentMethod: pagamento.method,
      platformPaymentMethod: pagamento.raw,

      // O nome do plano costuma ser mais específico que o do produto
      // ("3 potes + 2 grátis" vs "Herus Caps") — melhor pro relatório.
      productName:
        cleanString(plan.name, LIMITS.shortText) ??
        cleanString(product.name, LIMITS.shortText),
      productId:
        cleanString(product.code, LIMITS.id) ??
        cleanString(plan.code, LIMITS.id),

      buyerEmail: cleanString(customer.email, LIMITS.shortText),
      // O exemplo da doc não traz telefone, mas a plataforma pode mandar em
      // contas com endereço/entrega. Aceitamos os nomes prováveis sem exigir.
      buyerPhone:
        cleanString(customer.phone, LIMITS.shortText) ??
        cleanString(customer.phone_number, LIMITS.shortText) ??
        cleanString(customer.telephone, LIMITS.shortText),
      buyerFirstName: first,
      buyerLastName: last,
      // Mesma postura do telefone acima: o exemplo da doc não traz endereço,
      // mas contas com entrega física mandam. Aceitamos os nomes prováveis sem
      // exigir nenhum — vindo nulo, o CEP derivado de IP continua valendo.
      buyerPostalCode:
        cleanString(customer.zip_code, LIMITS.shortText) ??
        cleanString(customer.postal_code, LIMITS.shortText) ??
        cleanString(customer.address_zip_code, LIMITS.shortText) ??
        cleanString(customer.cep, LIMITS.shortText),

      trckUserId: findTrckUserId(metadata),

      utmSource: cleanString(metadata.utm_source),
      utmMedium: cleanString(metadata.utm_medium),
      utmCampaign: cleanString(metadata.utm_campaign),
      utmTerm: cleanString(metadata.utm_term),
      utmContent: cleanString(metadata.utm_content),
    },
  }
}

export const perfectPayAdapter: WebhookAdapter = {
  platform: "perfectpay",
  parse,
}
