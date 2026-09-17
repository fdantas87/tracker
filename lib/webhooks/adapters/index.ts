import { perfectPayAdapter } from "./perfectpay"
import type { WebhookAdapter } from "./types"

/**
 * Registro de plataformas suportadas.
 *
 * A URL do webhook carrega a plataforma (`/api/webhook/compra/perfectpay`), e
 * é esta tabela que decide quem sabe ler aquele payload. Para adicionar
 * Hotmart, Kiwify ou Eduzz: escrever o adaptador, registrar aqui, e incluir o
 * nome no CHECK de `purchases.platform` (a migration da fase 2 já deixou os
 * quatro previstos).
 */
const ADAPTERS: Record<string, WebhookAdapter> = {
  perfectpay: perfectPayAdapter,
}

export function getAdapter(platform: string): WebhookAdapter | null {
  return ADAPTERS[platform.toLowerCase()] ?? null
}

export function supportedPlatforms(): string[] {
  return Object.keys(ADAPTERS)
}
