import { DEFAULT_PHONE_COUNTRY } from "@/lib/phone-country"

import { perfectPayAdapter } from "./perfectpay"
import { stripeAdapter } from "./stripe"
import type { WebhookAdapter } from "./types"

/**
 * Registro de plataformas suportadas.
 *
 * A URL do webhook carrega a plataforma (`/api/webhook/compra/perfectpay`), e
 * é esta tabela que decide quem sabe ler aquele payload. Para adicionar
 * Hotmart, Kiwify ou Eduzz: escrever o adaptador, registrar aqui, e incluir o
 * nome no CHECK de `purchases.platform` (a migration da fase 2 já deixou os
 * quatro previstos; 'stripe' entrou depois, em 20260921130000).
 *
 * O Stripe é o primeiro cuja autenticação NÃO é o token compartilhado: ele
 * assina cada requisição com HMAC. A rota trata isso antes de chamar o
 * adaptador — ver `verifyStripeSignature` em ./stripe.
 */
const ADAPTERS: Record<string, WebhookAdapter> = {
  perfectpay: perfectPayAdapter,
  stripe: stripeAdapter,
}

export function getAdapter(platform: string): WebhookAdapter | null {
  return ADAPTERS[platform.toLowerCase()] ?? null
}

export function supportedPlatforms(): string[] {
  return Object.keys(ADAPTERS)
}

/**
 * País (ISO-2) da compra, derivado da moeda da transação — é o que decide o
 * código de discagem do telefone do comprador em `normalizePhone`.
 *
 * A moeda é o sinal confiável que o webhook traz: a geolocalização do
 * visitante erra com viagem e VPN, e um país fixo por deploy erra quando o
 * mesmo cliente vende em mais de uma moeda.
 *
 * EUR -> PT é aproximação: o euro circula em ~20 países. Quando alguma
 * plataforma passar a mandar o país do comprador, ele deve ter precedência.
 */
const PAIS_POR_MOEDA: Record<string, string> = {
  BRL: "BR",
  USD: "US",
  EUR: "PT",
}

export function obterPaisDaMoeda(moeda: string | null | undefined): string {
  const codigo = moeda?.trim().toUpperCase()
  const pais = codigo ? PAIS_POR_MOEDA[codigo] : undefined
  if (pais) return pais

  console.warn(
    `[webhooks] moeda "${moeda ?? ""}" ausente ou não mapeada: telefone ` +
      `normalizado com o país padrão do deploy (${DEFAULT_PHONE_COUNTRY}).`
  )
  return DEFAULT_PHONE_COUNTRY
}
