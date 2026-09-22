import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import { revealSecret } from "@/lib/crypto/vault"
import { createServiceClient } from "@/lib/supabase/service"
import { LIMITS, cleanAmount, cleanString } from "@/lib/validation"
import type {
  AdapterResult,
  PaymentMethod,
  PurchaseStatus,
  WebhookAdapter,
} from "./types"

/**
 * Adaptador do Stripe.
 *
 * Diferente do `perfectpay.ts`, este arquivo é `server-only` e toca banco:
 * o Stripe não autentica por token compartilhado, e sim assinando cada
 * requisição com HMAC — e a chave dessa assinatura mora no Vault. O `parse()`
 * em si continua puro e síncrono, igual ao dos outros adaptadores; quem
 * precisa de I/O é só a verificação de assinatura, que a rota chama antes.
 *
 * ESCOPO DESTA VERSÃO (o que está coberto e o que não está):
 *
 *   checkout.session.completed                -> approved | pending
 *   checkout.session.async_payment_succeeded  -> approved
 *   checkout.session.async_payment_failed     -> expired
 *   charge.refunded (reembolso TOTAL)         -> refunded
 *
 * Fora, de propósito e documentado:
 * - `charge.dispute.*` (chargeback). O objeto Dispute do Stripe não traz os
 *   dados do comprador — só `payment_intent`, valor e motivo. Como a rota faz
 *   upsert da linha inteira a cada webhook, aceitar uma disputa apagaria email
 *   e nome já gravados pela compra original. Fazer direito exige uma chamada
 *   extra à API do Stripe para reidratar o Charge, e isso é uma iteração
 *   própria. O enum de `purchases.status` já tem 'chargeback' pronto.
 * - Assinaturas/recorrência: `purchases` não modela assinatura em plataforma
 *   nenhuma; um Payment Link com preço recorrente não gera `payment_intent`
 *   único e é recusado aqui em vez de virar uma venda avulsa errada.
 * - Reembolso PARCIAL: recusado explicitamente (ver `parseChargeRefunded`).
 */

/**
 * Moedas sem casa decimal no Stripe: o valor já vem na unidade inteira.
 * Dividir por 100 aqui faria ¥5.000 virar ¥50 — erro financeiro que não
 * apareceria como erro nenhum. Lista da doc oficial do Stripe.
 */
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg",
  "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
])

/** Moedas de 3 casas: o valor vem em milésimos. */
const THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"])

/**
 * `payment_method_types` / `payment_method_details.type` do Stripe para o enum
 * canônico de `purchases.payment_method`.
 *
 * Só o que existe de verdade no vocabulário do Stripe entra aqui; qualquer
 * outro valor conhecido (carteiras, débito automático, vouchers) cai em
 * 'other', e o valor bruto é preservado em `platformPaymentMethod` — mesma
 * regra do PerfectPay.
 */
const PAYMENT_MAP: Record<string, PaymentMethod> = {
  card: "credit_card",
  link: "credit_card",
  boleto: "billet",
  pix: "pix",
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
 * Campos de referência do Stripe vêm como id em texto, mas viram objeto
 * completo se o endpoint foi cadastrado com `expand`. Aceita os dois.
 */
function readId(value: unknown): string | null {
  const direct = cleanString(value, LIMITS.id)
  if (direct) return direct
  return cleanString(asObject(value).id, LIMITS.id)
}

/** Converte da menor unidade monetária do Stripe para a unidade cheia. */
function toMajorUnits(amount: number, currency: string): number {
  const code = currency.toLowerCase()
  if (ZERO_DECIMAL.has(code)) return amount
  if (THREE_DECIMAL.has(code)) return amount / 1000
  return amount / 100
}

function splitName(fullName: string | null): {
  first: string | null
  last: string | null
} {
  if (!fullName) return { first: null, last: null }
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0], last: null }
  return { first: parts[0], last: parts.slice(1).join(" ") }
}

function readPaymentMethod(raw: string | null): {
  method: PaymentMethod | null
  raw: string | null
} {
  if (!raw) return { method: null, raw: null }
  return { method: PAYMENT_MAP[raw.toLowerCase()] ?? "other", raw }
}

/**
 * Nosso trck_user_id.
 *
 * `client_reference_id` é o campo oficial do Stripe pra isso e é o que o
 * track.js preenche nos Payment Links (parâmetro de URL documentado). O
 * metadata é varrido como plano B, pra quem cria a Checkout Session pela API e
 * prefere mandar o id lá — achar a venda vale mais que ser purista sobre o
 * campo, mesma postura do adaptador do PerfectPay.
 */
function findTrckUserId(session: Record<string, unknown>): string | null {
  const direct = cleanString(session.client_reference_id, LIMITS.id)
  if (direct) return direct.match(UUID_PATTERN)?.[0] ?? direct

  for (const value of Object.values(asObject(session.metadata))) {
    const match = cleanString(value, LIMITS.url)?.match(UUID_PATTERN)
    if (match) return match[0]
  }
  return null
}

// ---------------------------------------------------------------------------
// Eventos de Checkout Session
// ---------------------------------------------------------------------------

function parseCheckoutSession(
  session: Record<string, unknown>,
  eventType: string
): AdapterResult {
  // O PaymentIntent é a chave de idempotência, e não o id da Session: ele é o
  // único identificador que também aparece no evento de reembolso, então é o
  // que amarra as transições de status na MESMA linha de `purchases`.
  const transactionId = readId(session.payment_intent)
  if (!transactionId) {
    return {
      ok: false,
      error:
        "checkout session sem `payment_intent` (assinatura, valor zero ou modo setup — fora do escopo)",
    }
  }

  const paymentStatus = cleanString(session.payment_status, LIMITS.shortText)

  let status: PurchaseStatus
  if (eventType === "checkout.session.async_payment_failed") {
    status = "expired"
  } else if (eventType === "checkout.session.async_payment_succeeded") {
    status = "approved"
  } else if (paymentStatus === "paid" || paymentStatus === "no_payment_required") {
    status = "approved"
  } else {
    // `unpaid` num checkout concluído = meio de pagamento assíncrono (boleto,
    // OXXO, Konbini): a compra existe e o comprador já deu o email, mas o
    // dinheiro ainda não entrou. É exatamente o 'pending' do nosso enum.
    status = "pending"
  }

  const currency =
    cleanString(session.currency, LIMITS.shortText)?.toUpperCase() ?? "BRL"
  const amountRaw = cleanAmount(session.amount_total) ?? 0

  const customer = asObject(session.customer_details)
  const address = asObject(customer.address)
  const metadata = asObject(session.metadata)

  const { first, last } = splitName(
    cleanString(customer.name, LIMITS.shortText)
  )

  // `payment_method_types` é o que o webhook da Session entrega sem expandir.
  // Com um método só (o caso normal) ele é exato; com vários, é o configurado
  // e não necessariamente o usado — por isso o valor bruto vai junto.
  const types = Array.isArray(session.payment_method_types)
    ? session.payment_method_types
    : []
  const pagamento = readPaymentMethod(
    types.length === 1 ? cleanString(types[0], LIMITS.shortText) : null
  )

  return {
    ok: true,
    purchase: {
      transactionId,
      status,
      platformStatus: paymentStatus ? `${eventType}/${paymentStatus}` : eventType,

      amount: toMajorUnits(amountRaw, currency),
      currency,

      paymentMethod: pagamento.method,
      platformPaymentMethod: pagamento.raw,

      // `line_items` não vem no webhook sem expand, então o nome do produto só
      // existe se o lojista o colocou no metadata do link. Nulo é honesto: a
      // tela de Vendas já sabe lidar, e inventar "Compra Stripe" poluiria o
      // relatório com um nome que não é de produto nenhum.
      productName: cleanString(metadata.product_name, LIMITS.shortText),
      productId: cleanString(metadata.product_id, LIMITS.id),

      buyerEmail: cleanString(customer.email, LIMITS.shortText),
      buyerPhone: cleanString(customer.phone, LIMITS.shortText),
      buyerFirstName: first,
      buyerLastName: last,
      buyerPostalCode: cleanString(address.postal_code, LIMITS.shortText),

      trckUserId: findTrckUserId(session),

      // O Stripe aceita utm_* na URL do Payment Link, mas — confirmado na doc
      // oficial — elas só viajam para a URL de redirecionamento pós-pagamento,
      // nunca para o webhook. Ficam nulas aqui de propósito; a atribuição de
      // campanha vem do visitante casado, que já a guarda desde o PageView.
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
    },
  }
}

// ---------------------------------------------------------------------------
// Reembolso
// ---------------------------------------------------------------------------

function parseChargeRefunded(charge: Record<string, unknown>): AdapterResult {
  const transactionId = readId(charge.payment_intent)
  if (!transactionId) {
    return { ok: false, error: "charge sem `payment_intent`" }
  }

  // Reembolso PARCIAL não vira status: a venda continua valendo, só com valor
  // menor, e `purchases` não tem onde guardar "quanto voltou". Marcar a linha
  // inteira como reembolsada zeraria uma receita que em boa parte ficou de pé.
  // Recusar é a opção honesta — a rota devolve 400 e nada é sobrescrito.
  if (charge.refunded !== true) {
    return {
      ok: false,
      error: "reembolso parcial não é suportado (a venda segue como aprovada)",
    }
  }

  const currency =
    cleanString(charge.currency, LIMITS.shortText)?.toUpperCase() ?? "BRL"

  // O valor da VENDA, não o reembolsado: a linha representa a transação, e é o
  // `status` que diz que ela voltou. A tela de Vendas soma por status.
  const amountRaw = cleanAmount(charge.amount) ?? 0

  const billing = asObject(charge.billing_details)
  const address = asObject(billing.address)
  const { first, last } = splitName(cleanString(billing.name, LIMITS.shortText))

  const pagamento = readPaymentMethod(
    cleanString(asObject(charge.payment_method_details).type, LIMITS.shortText)
  )

  return {
    ok: true,
    purchase: {
      transactionId,
      status: "refunded",
      platformStatus: "charge.refunded",

      amount: toMajorUnits(amountRaw, currency),
      currency,

      paymentMethod: pagamento.method,
      platformPaymentMethod: pagamento.raw,

      productName: cleanString(asObject(charge.metadata).product_name, LIMITS.shortText),
      productId: cleanString(asObject(charge.metadata).product_id, LIMITS.id),

      // O Charge carrega os dados de cobrança, então o upsert do reembolso não
      // apaga o que a compra original gravou. É por isso que o reembolso está
      // no escopo e a disputa não: o objeto Dispute não tem nada disso.
      buyerEmail:
        cleanString(billing.email, LIMITS.shortText) ??
        cleanString(charge.receipt_email, LIMITS.shortText),
      buyerPhone: cleanString(billing.phone, LIMITS.shortText),
      buyerFirstName: first,
      buyerLastName: last,
      buyerPostalCode: cleanString(address.postal_code, LIMITS.shortText),

      // O Charge não carrega o `client_reference_id` da Session. O vínculo com
      // a visita é preservado pela rota, que mantém o `trck_user_id` já
      // gravado quando o webhook novo não traz vínculo próprio.
      trckUserId: null,

      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
    },
  }
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

function parse(body: Record<string, unknown>): AdapterResult {
  const eventType = cleanString(body.type, LIMITS.shortText)
  if (!eventType) {
    return { ok: false, error: "payload sem `type` — não parece um evento do Stripe" }
  }

  const object = asObject(asObject(body.data).object)

  switch (eventType) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
      return parseCheckoutSession(object, eventType)

    case "charge.refunded":
      return parseChargeRefunded(object)

    default:
      // Um endpoint cadastrado como "todos os eventos" manda dezenas de tipos
      // que não são venda. A rota devolve 400 e o Stripe registra a tentativa
      // como falha no painel dele — sem retry em loop, mas com ruído no log.
      // Por isso a tela de Integrações orienta a assinar só os 4 tipos acima.
      return { ok: false, error: `evento não tratado: ${eventType}` }
  }
}

export const stripeAdapter: WebhookAdapter = {
  platform: "stripe",
  parse,
}

// ---------------------------------------------------------------------------
// Autenticação: assinatura HMAC
// ---------------------------------------------------------------------------

/** Tolerância de replay. 5 minutos é o padrão do próprio SDK do Stripe. */
const SIGNATURE_TOLERANCE_SECONDS = 300

/**
 * Lê o webhook signing secret (`whsec_...`) do Vault.
 *
 * Devolve null quando não há Stripe configurado OU quando o Vault falha — nos
 * dois casos a rota recusa o webhook. Falhar FECHADO aqui é obrigatório: sem o
 * secret não há como distinguir um evento do Stripe de um payload forjado, e
 * aceitar assim injetaria vendas falsas no painel e no Meta.
 */
export async function getStripeWebhookSecret(): Promise<string | null> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from("stripe_accounts")
      .select("webhook_secret_vault_id")
      .eq("id", true)
      .maybeSingle()

    if (!data?.webhook_secret_vault_id) return null
    return await revealSecret(String(data.webhook_secret_vault_id))
  } catch {
    return null
  }
}

/**
 * Verifica o header `Stripe-Signature`.
 *
 * Formato: `t=<unix>,v1=<hex>[,v1=<hex>...][,v0=<legado>]`. A assinatura é
 * `HMAC-SHA256(secret, "<t>.<corpo bruto>")` — daí a rota precisar do texto
 * exato da requisição: reserializar o JSON muda um espaço e invalida tudo.
 *
 * Pode vir mais de um `v1` durante rotação de secret no Stripe; basta um
 * bater. `v0` é ignorado (esquema legado do Stripe CLI).
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string
): boolean {
  if (!rawBody || !header || !secret) return false

  let timestamp: string | null = null
  const signatures: string[] = []

  for (const part of header.split(",")) {
    const separator = part.indexOf("=")
    if (separator === -1) continue

    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()

    if (key === "t") timestamp = value
    else if (key === "v1") signatures.push(value)
  }

  if (!timestamp || signatures.length === 0) return false

  const sentAt = Number(timestamp)
  if (!Number.isFinite(sentAt)) return false

  // Sem a janela, uma requisição legítima capturada uma vez poderia ser
  // reenviada para sempre — a assinatura continuaria válida.
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - sentAt)
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) return false

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex")
  const expectedBuffer = Buffer.from(expected, "hex")

  return signatures.some((signature) => {
    // Tempo constante, mesmo motivo de lib/crypto/webhook-token.ts: comparar
    // com === vazaria o acerto byte a byte pelo tempo de resposta.
    const received = Buffer.from(signature, "hex")
    if (received.length !== expectedBuffer.length) return false
    return timingSafeEqual(received, expectedBuffer)
  })
}
