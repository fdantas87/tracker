import "server-only"

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * Token do webhook de compra.
 *
 * O valor bruto NUNCA é persistido — nem em texto puro, nem cifrado no Vault.
 * O banco guarda só o SHA-256 (`settings.webhook_token_hash`). Isso significa
 * que o token é mostrado uma única vez, na hora em que é gerado; depois disso
 * nem o painel nem o banco conseguem recuperá-lo. Se for perdido, gera outro
 * (e recadastra a URL na plataforma de venda).
 *
 * Hash simples (sem bcrypt/argon) é adequado aqui porque o token é um valor
 * aleatório de 256 bits gerado por nós — não tem entropia baixa como senha de
 * gente, então não há o que um ataque de dicionário faça.
 */

/** Gera um token novo, aleatório e sem ambiguidade visual (base64url). */
export function generateWebhookToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashWebhookToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

/**
 * Compara o token recebido no webhook com o hash guardado, em tempo constante.
 *
 * Comparar com `===` vazaria informação pelo tempo de resposta: quanto mais
 * caracteres iniciais o atacante acerta, mais demora a comparação falhar, o
 * que permite descobrir o token byte a byte.
 */
export function verifyWebhookToken(
  receivedToken: string,
  storedHash: string
): boolean {
  if (!receivedToken || !storedHash) return false

  const receivedHash = Buffer.from(hashWebhookToken(receivedToken), "hex")
  const expectedHash = Buffer.from(storedHash, "hex")

  // timingSafeEqual exige buffers do mesmo tamanho. Como os dois lados são
  // sempre SHA-256 (32 bytes), tamanho diferente só acontece se o hash
  // guardado estiver corrompido — aí é falha mesmo.
  if (receivedHash.length !== expectedHash.length) return false

  return timingSafeEqual(receivedHash, expectedHash)
}
