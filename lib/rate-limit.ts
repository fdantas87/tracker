import "server-only"

/**
 * Rate limiting dos endpoints públicos (janela fixa).
 *
 * Dois modos, escolhidos sozinho pela presença das variáveis de ambiente:
 *
 * 1. **Upstash Redis** (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`).
 *    É o modo correto em produção. Falado por HTTP puro, sem SDK: são duas
 *    chamadas de Redis, não vale uma dependência a mais.
 *
 * 2. **Memória do processo** (quando as variáveis não estão configuradas).
 *    ATENÇÃO: cada função serverless da Vercel é um processo efêmero e
 *    isolado, então o contador NÃO é compartilhado entre instâncias. Isso
 *    segura rajada de um cliente só contra uma instância, mas não é proteção
 *    real contra abuso distribuído. Serve pra desenvolvimento e como rede de
 *    segurança; antes de ir pra produção, configure o Upstash (tem plano
 *    gratuito) — está anotado nas pendências do CLAUDE.md.
 *
 * Em qualquer falha do Redis a decisão é DEIXAR PASSAR: um problema no
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

/** Webhook tem volume legítimo baixo (fase 7). */
export const WEBHOOK_RULE: RateLimitRule = { limit: 30, windowSeconds: 60 }

const memoryCounters = new Map<string, { count: number; expiresAt: number }>()

function upstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

export async function checkRateLimit(
  scope: string,
  identifier: string,
  rule: RateLimitRule = CAPTURE_RULE
): Promise<RateLimitResult> {
  const windowStart =
    Math.floor(Date.now() / 1000 / rule.windowSeconds) * rule.windowSeconds
  const key = `rl:${scope}:${identifier}:${windowStart}`
  const resetInSeconds = windowStart + rule.windowSeconds - Math.floor(Date.now() / 1000)

  const config = upstashConfig()
  const count = config
    ? await incrementUpstash(config, key, rule.windowSeconds)
    : incrementMemory(key, rule.windowSeconds)

  // null = o Redis falhou. Deixa passar, de propósito.
  if (count === null) {
    return { allowed: true, remaining: rule.limit, limit: rule.limit, resetInSeconds }
  }

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    limit: rule.limit,
    resetInSeconds,
  }
}

async function incrementUpstash(
  config: { url: string; token: string },
  key: string,
  windowSeconds: number
): Promise<number | null> {
  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        // NX: só define a expiração na primeira vez, pra janela não escorregar
        // pra frente a cada requisição.
        ["EXPIRE", key, String(windowSeconds), "NX"],
      ]),
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    })

    if (!response.ok) return null

    const results = (await response.json()) as { result?: unknown }[]
    const count = results?.[0]?.result
    return typeof count === "number" ? count : null
  } catch {
    return null
  }
}

function incrementMemory(key: string, windowSeconds: number): number {
  const now = Date.now()

  // Limpeza preguiçosa: sem isso o Map cresceria sem parar em processo longo.
  if (memoryCounters.size > 10_000) {
    for (const [existingKey, entry] of memoryCounters) {
      if (entry.expiresAt <= now) memoryCounters.delete(existingKey)
    }
  }

  const current = memoryCounters.get(key)
  if (!current || current.expiresAt <= now) {
    memoryCounters.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 })
    return 1
  }

  current.count += 1
  return current.count
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    ...(result.allowed ? {} : { "Retry-After": String(result.resetInSeconds) }),
  }
}

/** Só pra diagnóstico no painel/auditoria: diz se o modo robusto está ligado. */
export function isDistributedRateLimitEnabled(): boolean {
  return upstashConfig() !== null
}
