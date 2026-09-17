import "server-only"

import { createHash } from "node:crypto"

/**
 * Normalização + SHA-256 dos dados pessoais, conforme a documentação da
 * Conversions API do Meta:
 * https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 *
 * A normalização importa tanto quanto o hash: o Meta compara hashes, então
 * "  Joao@Email.com " e "joao@email.com" só batem se os dois forem
 * normalizados do mesmo jeito antes de hashear. Errar aqui não dá erro em
 * lugar nenhum — só derruba silenciosamente a taxa de correspondência.
 *
 * NÃO hashear: fbp, fbc, client_ip_address, client_user_agent. O Meta espera
 * esses em texto puro (ver lib/meta/capi.ts, fase 6).
 */

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

/** Retorna null pra entrada vazia, pra nunca gravar o hash de string vazia. */
function hashNormalized(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed ? sha256(trimmed) : null
}

export function hashEmail(email: string | null | undefined): string | null {
  if (!email) return null
  return hashNormalized(email.trim().toLowerCase())
}

/**
 * Telefone: só dígitos, em formato internacional, sem "+", espaços ou traços.
 *
 * O CÓDIGO DO PAÍS NÃO É OPCIONAL. O Meta compara o hash do número completo,
 * então um celular digitado como "(11) 98765-4321" vira "11987654321" e nunca
 * bate com o "5511987654321" que o Meta espera. Isso não gera erro nenhum —
 * só zera a correspondência, em silêncio. Era o comportamento daqui antes
 * desta função existir, e todo phone_hash gravado até então é inútil pro Meta.
 *
 * Como o tamanho decide (números brasileiros):
 * - 10 ou 11 dígitos = número nacional (DDD + assinante) -> recebe o país.
 *   Isso resolve certo até o caso ambíguo do DDD 55 (Santa Maria/RS):
 *   "55987654321" tem 11 dígitos, logo é nacional, e vira "5555987654321".
 * - 12 ou 13 dígitos começando com o código do país = já é internacional.
 * - Qualquer outro tamanho fica como veio: é um número de outro país, e
 *   chutar um prefixo estragaria o que já estava certo.
 */
export function normalizePhone(
  phone: string | null | undefined,
  defaultCountry = "55"
): string | null {
  if (!phone) return null

  // O zero à esquerda é prefixo de discagem interurbana, não faz parte do
  // número.
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "")
  if (!digits) return null

  const cc = defaultCountry.replace(/\D/g, "")
  if (!cc) return digits

  const national = cc.length + 10
  const nationalLong = cc.length + 11

  if (digits.length === 10 || digits.length === 11) {
    return cc + digits
  }
  if (
    (digits.length === national || digits.length === nationalLong) &&
    digits.startsWith(cc)
  ) {
    return digits
  }

  return digits
}

export function hashPhone(
  phone: string | null | undefined,
  defaultCountry = "55"
): string | null {
  const normalized = normalizePhone(phone, defaultCountry)
  return normalized ? sha256(normalized) : null
}

/** Nome e sobrenome: minúsculo, sem espaços nas pontas. */
export function hashName(name: string | null | undefined): string | null {
  if (!name) return null
  return hashNormalized(name.trim().toLowerCase())
}

/** Cidade: minúsculo, sem espaços nem pontuação ("São Paulo" -> "sãopaulo"). */
export function hashCity(city: string | null | undefined): string | null {
  if (!city) return null
  const normalized = city.toLowerCase().replace(/[\s\p{P}]/gu, "")
  return normalized ? sha256(normalized) : null
}

/** Estado: sigla de 2 letras, minúscula. */
export function hashState(state: string | null | undefined): string | null {
  if (!state) return null
  const normalized = state.trim().toLowerCase().replace(/[^a-z]/g, "")
  return normalized ? sha256(normalized) : null
}

/** País: código ISO de 2 letras, minúsculo. */
export function hashCountry(country: string | null | undefined): string | null {
  if (!country) return null
  const normalized = country.trim().toLowerCase().slice(0, 2)
  return normalized ? sha256(normalized) : null
}

/** external_id (nosso trck_user_id): hasheado como está, só sem espaços. */
export function hashExternalId(id: string | null | undefined): string | null {
  return hashNormalized(id)
}
