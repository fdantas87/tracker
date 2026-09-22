import { after } from "next/server"

import { verifyWebhookToken } from "@/lib/crypto/webhook-token"
import { hashEmail, hashPhone } from "@/lib/crypto/hash"
import { dispatchPurchase } from "@/lib/dispatch/purchase-dispatch"
import {
  enrichVisitorFromPurchase,
  flushAndDrain,
} from "@/lib/dispatch/visitor-enrich"
import { getGeo } from "@/lib/geo"
import {
  WEBHOOK_RULE,
  checkRateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit"
import { getDispatchConfig } from "@/lib/settings/dispatch-config"
import { createServiceClient } from "@/lib/supabase/service"
import { parseJsonText } from "@/lib/validation"
import { getAdapter } from "@/lib/webhooks/adapters"
import {
  getStripeWebhookSecret,
  verifyStripeSignature,
} from "@/lib/webhooks/adapters/stripe"
import type { NormalizedPurchase } from "@/lib/webhooks/adapters/types"

const MAX_BODY_BYTES = 256_000

/**
 * POST /api/webhook/compra/[platform]
 *
 * Recebe a notificação de compra da plataforma de venda (PerfectPay e Stripe).
 *
 * Fluxo:
 * 1. valida o token do webhook (o nosso, não o da plataforma)
 * 1.5. quando a plataforma assina a requisição (Stripe), confere a assinatura
 *    sobre o corpo BRUTO — é a prova criptográfica de que o payload veio de lá
 * 2. traduz o payload pelo adaptador da plataforma
 * 3. grava/atualiza a compra de forma idempotente
 * 4. tenta casar com um visitante (trck_user_id -> email -> telefone)
 * 5. se a venda está aprovada e ainda não foi disparada, manda o Purchase pro
 *    Meta e pro GA4 — uma única vez, garantido por uma trava atômica no banco
 *
 * Sempre responde 200 quando o payload foi entendido, mesmo em caso de erro
 * interno no disparo: plataforma de pagamento reenvia webhook que não recebeu
 * 2xx, e reenvio em loop por causa de um erro nosso só piora a situação. O que
 * deu errado fica registrado na linha da compra.
 */

/**
 * Mais folga que os outros endpoints: aqui o `after()` fala com o Meta E com o
 * GA4. Com o padrão de 10s da Vercel, o disparo da compra seria interrompido no
 * meio — e compra perdida em silêncio é o pior defeito possível neste sistema.
 */
export const maxDuration = 60

export async function POST(
  request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params

  const geo = getGeo(request.headers)
  const limit = await checkRateLimit(
    "webhook",
    geo.ip ?? "sem-ip",
    WEBHOOK_RULE
  )
  if (!limit.allowed) {
    return Response.json({ error: "rate_limited" }, {
      status: 429,
      headers: rateLimitHeaders(limit),
    })
  }

  const adapter = getAdapter(platform)
  if (!adapter) {
    return Response.json({ error: "plataforma_nao_suportada" }, { status: 404 })
  }

  // --- 1. autenticação -----------------------------------------------------
  // Aceita o token no header (preferido) ou na querystring, porque nem toda
  // plataforma deixa configurar header customizado na URL do webhook.
  const url = new URL(request.url)
  const token =
    request.headers.get("x-webhook-token") ?? url.searchParams.get("token") ?? ""

  const supabase = createServiceClient()
  const { data: settings } = await supabase
    .from("settings")
    .select("webhook_token_hash")
    .eq("id", true)
    .maybeSingle()

  if (!settings?.webhook_token_hash) {
    return Response.json({ error: "webhook_nao_configurado" }, { status: 503 })
  }

  // Comparação em tempo constante — ver lib/crypto/webhook-token.ts.
  if (!verifyWebhookToken(token, settings.webhook_token_hash)) {
    // Nunca logar a URL completa: ela carrega o token na querystring.
    return Response.json({ error: "nao_autorizado" }, { status: 401 })
  }

  // --- 1.5. corpo bruto e assinatura da plataforma -------------------------
  // O corpo é lido como TEXTO antes de virar JSON porque a verificação de
  // assinatura do Stripe é feita sobre os bytes exatos que ele mandou —
  // reserializar o objeto muda um espaço e invalida a assinatura. Para as
  // outras plataformas o resultado é idêntico ao `readJsonBody` de antes:
  // mesmo limite de tamanho, mesma validação, mesma resposta de erro.
  const contentLength = request.headers.get("content-length")
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return Response.json({ error: "payload_invalido" }, { status: 400 })
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return Response.json({ error: "payload_invalido" }, { status: 400 })
  }

  if (platform === "stripe") {
    // Aqui a autenticação é criptográfica, não um token compartilhado: só quem
    // tem o signing secret consegue produzir esta assinatura. Falha fechado —
    // sem secret configurado, nenhum webhook é aceito.
    const secret = await getStripeWebhookSecret()
    if (!secret) {
      return Response.json({ error: "stripe_nao_configurado" }, { status: 503 })
    }

    const signature = request.headers.get("stripe-signature")
    if (!verifyStripeSignature(rawBody, signature, secret)) {
      return Response.json({ error: "assinatura_invalida" }, { status: 401 })
    }
  }

  // --- 2. tradução ---------------------------------------------------------
  const body = parseJsonText(rawBody, MAX_BODY_BYTES)
  if (!body) {
    return Response.json({ error: "payload_invalido" }, { status: 400 })
  }

  const parsed = adapter.parse(body)
  if (!parsed.ok) {
    // 400 aqui é proposital: o payload chegou mas não é o que esperamos, e
    // reenviar não vai mudar nada. O erro volta pra plataforma mostrar no log.
    return Response.json({ error: "payload_nao_reconhecido", detail: parsed.error }, { status: 400 })
  }

  const purchase = parsed.purchase

  try {
    const config = await getDispatchConfig()

    // --- 3. vinculação com o visitante -------------------------------------
    const match = await findVisitor(purchase, config.defaultPhoneCountry)

    // --- 4. gravação idempotente -------------------------------------------
    // `transaction_id` é UNIQUE. O upsert atualiza a linha quando a mesma
    // venda muda de status (pendente -> aprovada -> reembolsada), que é o
    // comportamento normal: a plataforma manda um webhook por transição.
    const { error: upsertError } = await supabase.from("purchases").upsert(
      {
        transaction_id: purchase.transactionId,
        trck_user_id: match.visitor?.trck_user_id ?? null,
        email: purchase.buyerEmail,
        email_hash: hashEmail(purchase.buyerEmail),
        phone_hash: hashPhone(purchase.buyerPhone, config.defaultPhoneCountry),
        // Texto puro para a ficha do lead (fase 8b) — os hashes acima seguem
        // existindo só para o Meta, propósito diferente. Requer a migration
        // 20260919090000 aplicada ANTES do deploy, ou este upsert inteiro falha.
        buyer_first_name: purchase.buyerFirstName,
        buyer_last_name: purchase.buyerLastName,
        buyer_phone: purchase.buyerPhone,
        product_name: purchase.productName,
        product_id: purchase.productId,
        amount: purchase.amount,
        currency: purchase.currency,
        // Forma de pagamento para a tela de Vendas (fase 8b). Canônico +
        // bruto, mesmo par de `status`/`platform_status`. Requer a migration
        // 20260919120000 aplicada ANTES do deploy, ou este upsert inteiro
        // falha e a compra deixa de ser registrada.
        payment_method: purchase.paymentMethod,
        platform_payment_method: purchase.platformPaymentMethod,
        status: purchase.status,
        platform: adapter.platform,
        platform_status: purchase.platformStatus,
        utm_source: purchase.utmSource,
        utm_medium: purchase.utmMedium,
        utm_campaign: purchase.utmCampaign,
        utm_term: purchase.utmTerm,
        utm_content: purchase.utmContent,
        fbp: (match.visitor?.fbp as string | null) ?? null,
        fbc: (match.visitor?.fbc as string | null) ?? null,
        geo_country: (match.visitor?.geo_country as string | null) ?? null,
        geo_region: (match.visitor?.geo_region as string | null) ?? null,
        geo_city: (match.visitor?.geo_city as string | null) ?? null,
        match_method: match.method,
        match_found: Boolean(match.visitor),
        raw_webhook: body,
      },
      { onConflict: "transaction_id" }
    )

    if (upsertError) {
      return Response.json(
        { error: "persist_failed", detail: upsertError.message },
        { status: 500 }
      )
    }

    // --- 4.5. enriquecimento do visitante (fase 7.5) ------------------------
    // Vem DEPOIS da gravação (o dinheiro é registrado primeiro, aconteça o que
    // acontecer aqui) e ANTES do retorno de status não-aprovado — de propósito.
    // Um boleto/Pix apenas GERADO já traz o email do comprador, e é justamente
    // essa PII que os eventos parados na fila estão esperando. Sair cedo aqui
    // desperdiçaria o melhor momento de enriquecimento do funil.
    const visitorId = match.visitor?.trck_user_id
      ? String(match.visitor.trck_user_id)
      : null

    if (visitorId) {
      const enrichment = await enrichVisitorFromPurchase(
        visitorId,
        purchase,
        config.defaultPhoneCountry
      )

      if (enrichment.enriched) {
        after(() => flushAndDrain(visitorId))
      }
    }

    // --- 5. disparo, uma única vez -----------------------------------------
    if (purchase.status !== "approved") {
      return Response.json(
        { ok: true, status: purchase.status, dispatched: false },
        { status: 200 }
      )
    }

    // event_id determinístico: reentrega do mesmo webhook produz o mesmo id, e
    // o Meta deduplica. O UPDATE condicional (`is meta_event_id null`) é a
    // trava: só UMA requisição consegue marcar a linha, mesmo se duas chegarem
    // ao mesmo tempo. Quem marcou, dispara.
    const eventId = `purchase_${purchase.transactionId}`

    const { data: claimed } = await supabase
      .from("purchases")
      .update({ meta_event_id: eventId })
      .eq("transaction_id", purchase.transactionId)
      .is("meta_event_id", null)
      .select("id")
      .maybeSingle()

    if (!claimed) {
      return Response.json(
        { ok: true, status: purchase.status, dispatched: false, reason: "ja_enviado" },
        { status: 200 }
      )
    }

    after(async () => {
      await dispatchPurchase({
        purchase,
        eventId,
        visitor: match.visitor,
      }).catch(() => {
        // Nunca deixa a falha derrubar o processo: o que aconteceu já está
        // registrado em response_meta/response_ga4 pela própria dispatchPurchase.
      })
    })

    return Response.json(
      {
        ok: true,
        status: purchase.status,
        dispatched: true,
        matched: Boolean(match.visitor),
        match_method: match.method,
      },
      { status: 200 }
    )
  } catch (error) {
    return Response.json(
      {
        error: "erro_interno",
        detail: error instanceof Error ? error.message : "desconhecido",
      },
      { status: 500 }
    )
  }
}

type VisitorMatch = {
  visitor: Record<string, unknown> | null
  method: "trck_user_id" | "email" | "phone" | "none"
}

/**
 * Casa a venda com a visita, em ordem de confiança.
 *
 * 1. trck_user_id — veio da URL do checkout, é o vínculo direto e certo
 * 2. email (hash) — o comprador usou o mesmo email no site e no checkout
 * 3. telefone (hash) — último recurso
 * 4. o vínculo que ESTA transação já tinha, de um webhook anterior
 *
 * O passo 4 não é atribuição nova: é preservação. A gravação é um upsert da
 * linha inteira, e nem toda plataforma repete todos os dados em toda transição
 * de status — o evento de reembolso do Stripe, por exemplo, não carrega o
 * `client_reference_id` da sessão de checkout. Sem este passo, um reembolso de
 * visitante que nunca deixou email no site apagaria o `trck_user_id` gravado
 * na compra, e a venda perderia a origem justamente por ter sido reembolsada.
 *
 * Sem vínculo nenhum, a compra é gravada mesmo assim: perder a venda por não
 * saber de onde ela veio seria muito pior do que registrá-la sem atribuição.
 */
async function findVisitor(
  purchase: NormalizedPurchase,
  defaultPhoneCountry: string
): Promise<VisitorMatch> {
  const supabase = createServiceClient()

  if (purchase.trckUserId) {
    const { data } = await supabase
      .from("visitors")
      .select("*")
      .eq("trck_user_id", purchase.trckUserId)
      .maybeSingle()
    if (data) return { visitor: data, method: "trck_user_id" }
  }

  const emailHash = hashEmail(purchase.buyerEmail)
  if (emailHash) {
    const { data } = await supabase
      .from("visitors")
      .select("*")
      .eq("email_hash", emailHash)
      .order("updated_at", { ascending: false })
      .limit(1)
    if (data && data.length > 0) return { visitor: data[0], method: "email" }
  }

  const phoneHash = hashPhone(purchase.buyerPhone, defaultPhoneCountry)
  if (phoneHash) {
    const { data } = await supabase
      .from("visitors")
      .select("*")
      .eq("phone_hash", phoneHash)
      .order("updated_at", { ascending: false })
      .limit(1)
    if (data && data.length > 0) return { visitor: data[0], method: "phone" }
  }

  // 4. Vínculo preservado: esta transação já foi gravada antes com um
  // visitante? Então o webhook atual só não trouxe o dado — ele não desfez o
  // vínculo. Mantém o que já existia, inclusive o `match_method` original,
  // que continua sendo a verdade de COMO a venda foi casada.
  const { data: anterior } = await supabase
    .from("purchases")
    .select("trck_user_id, match_method")
    .eq("transaction_id", purchase.transactionId)
    .maybeSingle()

  if (anterior?.trck_user_id) {
    const { data: visitor } = await supabase
      .from("visitors")
      .select("*")
      .eq("trck_user_id", anterior.trck_user_id)
      .maybeSingle()

    if (visitor) {
      const metodo = anterior.match_method
      return {
        visitor,
        method:
          metodo === "trck_user_id" || metodo === "email" || metodo === "phone"
            ? metodo
            : "trck_user_id",
      }
    }
  }

  return { visitor: null, method: "none" }
}
