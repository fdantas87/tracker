import "server-only"

import { createServiceClient } from "@/lib/supabase/service"

/**
 * Rate limiting dos endpoints públicos (janela fixa), no próprio Postgres.
 *
 * O contador PRECISA ser compartilhado entre instâncias: cada requisição pode
 * cair numa função serverless diferente, e um contador em memória nunca soma —
 * o atacante simplesmente bate em instâncias distintas.
 *
 * A escolha clássica seria Redis, mas isso é mais um serviço, mais uma conta e
 * mais duas credenciais pra guardar. O Postgres do Supabase já existe, já é
 * compartilhado por todas as instâncias e já é consultado nesses mesmos
 * endpoints — resolve o problema sem nenhuma peça nova. Para o volume de um
 * negócio, a diferença de desempenho não paga a complexidade operacional.
 *
 * A contagem é uma chamada só, atômica, via `bump_rate_limit` (ver a migration
 * `..._rate_limits.sql`).
 *
 * Em qualquer falha do banco a decisão é DEIXAR PASSAR: um problema no
 * limitador não pode derrubar a captura de eventos do site inteiro.
 */

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  limit: number
  /** Segundos até a janela virar — vai no header Retry-After. */
  resetInSeconds: number
}

export type RateLimitRule = {
  /** Quantas requisições por janela. */
  limit: number
  /** Tamanho da janela em segundos. */
  windowSeconds: number
}

/** Captura é chamada a cada pageview: generoso, mas com teto. */
export const CAPTURE_RULE: RateLimitRule = { limit: 60, windowSeconds: 60 }

/** Webhook tem volume legítimo baixo. */
export const WEBHOOK_RULE: RateLimitRule = { limit: 30, windowSeconds: 60 }

/**
 * Tique da fila: o pg_cron chama uma vez por minuto. O teto de 10 existe só
 * pra um token vazado não conseguir multiplicar invocações da função — a
 * reivindicação atômica já garante que nada é enviado duas vezes.
 */
export const CRON_RULE: RateLimitRule = { limit: 10, windowSeconds: 60 }

export async function checkRateLimit(
  scope: string,
  identifier: string,
  rule: RateLimitRule = CAPTURE_RULE
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000)
  const windowStart =
    Math.floor(now / rule.windowSeconds) * rule.windowSeconds
  const resetInSeconds = windowStart + rule.windowSeconds - now

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc("bump_rate_limit", {
      p_key: `${scope}:${identifier}`,
      p_window_seconds: rule.windowSeconds,
    })

    if (error || typeof data !== "number") {
      return permitir(rule, resetInSeconds)
    }

    return {
      allowed: data <= rule.limit,
      remaining: Math.max(0, rule.limit - data),
      limit: rule.limit,
      resetInSeconds,
    }
  } catch {
    return permitir(rule, resetInSeconds)
  }
}

/** Falha do limitador não pode virar falha da captura. */
function permitir(rule: RateLimitRule, resetInSeconds: number): RateLimitResult {
  return {
    allowed: true,
    remaining: rule.limit,
    limit: rule.limit,
    resetInSeconds,
  }
}

export function rateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    ...(result.allowed ? {} : { "Retry-After": String(result.resetInSeconds) }),
  }
}
