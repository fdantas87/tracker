import { LIMITS, cleanAmount, cleanString } from "@/lib/validation"
import type { AdapterResult, PurchaseStatus, WebhookAdapter } from "./types"

/**
 * Adaptador da Bask — `/api/webhook/bask` (e o caminho antigo `/api/webhook/compra/bask`).
 *
 * A Bask manda um webhook por tipo de evento, sempre como `{ type, data }`
 * (confirmado no template oficial `bask-labs/bask-webhooks-vercel`). A doc com
 * o formato de cada `data` é fechada (docs.bask.health exige login), então a
 * leitura dos campos é TOLERANTE: aceita os nomes da entidade de pagamento da
 * Bask (`id`, `amountPaid`, `totalPrice`, `refundAmount`, `patientId`) direto
 * em `data` ou aninhados em `data.payment`, e o paciente em `data.patient`.
 * Quando nada bate, o erro lista só os NOMES das chaves recebidas — nunca os
 * valores, que podem ser dado de saúde — para o ajuste ser feito a partir do
 * primeiro payload real.
 *
 * Tradução (decidida com o usuário; Purchase = pagamento CONFIRMADO):
 *   paymentSucceeded -> venda aprovada + Purchase (inclusive renovação e refil:
 *                       cada cobrança é um pagamento novo, com id próprio)
 *   paymentRefunded  -> reembolsada (reembolso parcial é ignorado, como no Stripe)
 *   paymentCanceled  -> cancelada
 *   disputeCreated   -> chargeback
 *   disputeUpdated   -> ganha volta a aprovada, perdida fica chargeback
 *   qualquer outro   -> ignorado com 200 (newOrder NUNCA vira Purchase)
 *
 * A chave da venda é o id do PAGAMENTO, não do pedido: no modelo da Bask
 * pagamento e pedido são entidades separadas, e só o pagamento aparece no
 * reembolso e na disputa.
 *
 * Nome e id do produto (o medicamento) nunca vão para Meta/GA4.
 */

type Efeito =
  | { kind: "purchase" }
  | { kind: "statusUpdate"; status: PurchaseStatus }
  | { kind: "refund" }
  | { kind: "disputeUpdate" }

/** Chave normalizada: minúscula, sem `_`, `.` ou `-` (paymentSucceeded, payment.succeeded...). */
const EVENTOS: Record<string, Efeito> = {
  paymentsucceeded: { kind: "purchase" },
  paymentrefunded: { kind: "refund" },
  paymentcanceled: { kind: "statusUpdate", status: "canceled" },
  paymentcancelled: { kind: "statusUpdate", status: "canceled" },
  disputecreated: { kind: "statusUpdate", status: "chargeback" },
  disputeupdated: { kind: "disputeUpdate" },
}

/** A Bask vende nos EUA; o modelo dela guarda valor decimal em dólar, sem campo de moeda. */
const MOEDA_PADRAO = "USD"

/**
 * Primeiro valor MAIOR QUE ZERO entre os campos. Um `"0"` num campo não pode
 * esconder o valor real que está no seguinte; nada positivo = 0 (e não null),
 * porque o campo existir com zero é diferente de não existir.
 */
function valorPositivo(fontes: Record<string, unknown>[], chaves: string[]): number | null {
  let achou = false
  for (const fonte of fontes) {
    for (const chave of chaves) {
      const valor = cleanAmount(fonte[chave])
      if (valor === null) continue
      if (valor > 0) return valor
      achou = true
    }
  }
  return achou ? 0 : null
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Primeiro valor preenchido entre as fontes e nomes de campo prováveis. */
function pick(
  fontes: Record<string, unknown>[],
  chaves: string[],
  max: number = LIMITS.shortText
): string | null {
  for (const fonte of fontes) {
    for (const chave of chaves) {
      const valor = cleanString(fonte[chave], max)
      if (valor) return valor
    }
  }
  return null
}

/** Só os nomes das chaves (até um nível dentro de `data`), nunca os valores. */
function descreverChaves(body: Record<string, unknown>): string {
  const partes = Object.keys(body).map((chave) => {
    const valor = asObject(body[chave])
    const filhas = Object.keys(valor)
    if (filhas.length === 0) return chave
    const netas = filhas.map((filha) => {
      const sub = Object.keys(asObject(valor[filha]))
      return sub.length > 0 ? `${filha}{${sub.join(",")}}` : filha
    })
    return `${chave}{${netas.join(",")}}`
  })
  return partes.join(", ").slice(0, 600)
}

function erro(mensagem: string, body: Record<string, unknown>): AdapterResult {
  const detalhe = `${mensagem}; chaves recebidas: ${descreverChaves(body)}`
  console.warn(`[webhooks/bask] ${detalhe}`)
  return { ok: false, error: detalhe }
}

function parse(body: Record<string, unknown>): AdapterResult {
  const tipo = cleanString(body.type ?? body.event, LIMITS.eventName)
  if (!tipo) return erro("payload sem `type`", body)

  const efeito = EVENTOS[tipo.toLowerCase().replace(/[_.\-\s]/g, "")]
  if (!efeito) return { ok: true, ignored: `evento_fora_do_escopo:${tipo}` }

  const data = asObject(body.data)
  const payment = asObject(data.payment)
  const dispute = asObject(data.dispute)

  // Em evento de pagamento, `data.id` é o próprio pagamento; em disputa é o id
  // da disputa, então ali só valem os campos que nomeiam o pagamento.
  const ehPagamento = tipo.toLowerCase().startsWith("payment")
  const transactionId =
    pick([data, dispute], ["paymentId", "payment_id"], LIMITS.id) ??
    pick([payment], ["id"], LIMITS.id) ??
    (ehPagamento ? pick([data], ["transactionId", "transaction_id", "id"], LIMITS.id) : null)

  if (!transactionId) return erro(`${tipo} sem id do pagamento`, body)

  if (efeito.kind === "statusUpdate") {
    return {
      ok: true,
      statusUpdate: { transactionId, status: efeito.status, platformStatus: tipo },
    }
  }

  const fontesPagamento = [payment, data]
  // O campo nativo `amount` do webhook vem em CENTAVOS (payload real de
  // 2026-10-08: 24700 para uma venda de US$ 247). Os demais nomes seguem em
  // dólar, como no modelo de dados da Bask.
  const emCentavos = valorPositivo(fontesPagamento, ["amount"])
  const pago =
    emCentavos !== null
      ? Math.round(emCentavos) / 100
      : valorPositivo(fontesPagamento, [
          "amountPaid", "amount_paid", "totalPrice", "total_price", "total",
        ])

  if (efeito.kind === "refund") {
    // Reembolso parcial: a venda continua valendo, só menor, e `purchases`
    // não tem onde guardar quanto voltou. Marcar a linha inteira zeraria uma
    // receita que em boa parte ficou de pé — mesma decisão do Stripe.
    const devolvido = cleanAmount(
      pick(fontesPagamento, ["refundAmount", "refund_amount", "amountRefunded"])
    )
    if (pago !== null && devolvido !== null && devolvido > 0 && devolvido < pago) {
      return { ok: true, ignored: "reembolso_parcial" }
    }
    return {
      ok: true,
      statusUpdate: { transactionId, status: "refunded", platformStatus: tipo },
    }
  }

  if (efeito.kind === "disputeUpdate") {
    const situacao = pick([dispute, data], ["disputeStatus", "status"])?.toLowerCase()
    if (situacao === "won") {
      return {
        ok: true,
        statusUpdate: { transactionId, status: "approved", platformStatus: `${tipo}:won` },
      }
    }
    if (situacao === "lost") {
      return {
        ok: true,
        statusUpdate: { transactionId, status: "chargeback", platformStatus: `${tipo}:lost` },
      }
    }
    return { ok: true, ignored: "disputa_em_andamento" }
  }

  // --- paymentSucceeded ------------------------------------------------------
  const patient = asObject(data.patient)
  const customer = asObject(data.customer)
  const address = asObject(patient.address)
  const fontesPaciente = [patient, customer, data]

  const email = pick(fontesPaciente, ["email", "patientEmail", "customerEmail"])
  const telefone = pick(fontesPaciente, ["phone", "phoneNumber", "mobilePhone", "patientPhone"])

  // Sem campo de valor nenhum: 400 com as chaves, que diz onde o valor está.
  if (pago === null) return erro("paymentSucceeded sem valor reconhecível", body)

  // Pagamento de teste: a rota o trata em modo simulação (não grava venda, não
  // envia ao Meta/GA4; só registra o evento em Eventos). O botão "Test" da Bask
  // manda dados inventados com `testMode: false` e `amount: 0` (visto no
  // primeiro payload real, 2026-10-08) — então valor zero também é teste. Um
  // pagamento real de 0 (cupom de 100%) não teria nada a dizer ao Meta mesmo.
  const isTest =
    data.testMode === true || payment.testMode === true || body.testMode === true || pago === 0

  const product = asObject(data.product)
  // `paymentMethod` chega como objeto: { type: "card", card: { brand, last4 } }.
  const metodo = asObject(data.paymentMethod ?? payment.paymentMethod)
  const metodoBruto =
    pick([asObject(metodo.card)], ["brand"]) ??
    pick([metodo], ["type"]) ??
    pick(fontesPagamento, ["paymentMethod", "paymentMethodType", "payment_method", "cardBrand"])
  const ehCartao =
    pick([metodo], ["type"])?.toLowerCase() === "card" ||
    (metodoBruto !== null && /card|visa|master|amex|discover/i.test(metodoBruto))

  const patientId = pick([data, patient, payment], ["patientId", "patient_id"], LIMITS.id) ??
    pick([patient], ["id"], LIMITS.id)

  return {
    ok: true,
    purchase: {
      // Prefixo no teste: o id do payload de teste é sempre o mesmo, e sem ele
      // uma venda real futura com esse id colidiria com o evento simulado.
      transactionId: isTest ? `test_${transactionId}` : transactionId,
      isTest,
      status: "approved",
      platformStatus: tipo,

      amount: pago,
      currency: pick(fontesPagamento, ["currency"], 8)?.toUpperCase() ?? MOEDA_PADRAO,

      paymentMethod: ehCartao ? "credit_card" : metodoBruto ? "other" : null,
      platformPaymentMethod: metodoBruto,

      productName: pick([product], ["name"]) ?? pick([data], ["productName"]),
      productId: pick([product], ["id"], LIMITS.id) ?? pick([data], ["productId"], LIMITS.id),
      omitProductFromAds: true,

      buyerEmail: email,
      buyerPhone: telefone,
      buyerFirstName: pick(fontesPaciente, ["firstName", "first_name"]),
      buyerLastName: pick(fontesPaciente, ["lastName", "last_name"]),
      buyerPostalCode: pick([address, patient, customer, data], ["zipCode", "zip", "postalCode", "postal_code"]),

      // O checkout da Bask não repassa o nosso id, e o webhook de pagamento
      // não traz email: o vínculo com a visita é pelo id do paciente, que a
      // ponte do GTM grava no SubmitApplication (ver findVisitor na rota).
      trckUserId: null,
      platformCustomerId: patientId,

      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
    },
  }
}

export const baskAdapter: WebhookAdapter = {
  platform: "bask",
  parse,
}
