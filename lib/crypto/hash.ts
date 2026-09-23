import "server-only"

import { createHash } from "node:crypto"

import { DEFAULT_PHONE_COUNTRY } from "@/lib/phone-country"

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

type DialPlan = {
  /** Código de discagem E.164, sem "+". */
  cc: string
  /** Tamanhos do número nacional, já sem o zero de discagem interurbana. */
  national: number[]
}

/**
 * Plano de discagem por país (ISO-2). Adicionar um país é uma linha.
 *
 * O tamanho nacional importa tanto quanto o código: é ele que distingue
 * "número local, precisa do prefixo" de "já veio com o prefixo". Usar o
 * tamanho brasileiro para todo país prefixaria duas vezes um número americano
 * que já veio como "15551234567".
 *
 * Itália: o fixo mantém o 0 no formato internacional (+39 06...), e o 0 é
 * removido abaixo — só o celular (que começa com 3) sai certo.
 */
const DIAL_PLANS: Record<string, DialPlan> = {
  BR: { cc: "55", national: [10, 11] },
  US: { cc: "1", national: [10] },
  CA: { cc: "1", national: [10] },
  DO: { cc: "1", national: [10] },
  PR: { cc: "1", national: [10] },
  MX: { cc: "52", national: [10] },
  AR: { cc: "54", national: [10, 11] },
  CO: { cc: "57", national: [10] },
  CL: { cc: "56", national: [9] },
  PE: { cc: "51", national: [9] },
  UY: { cc: "598", national: [8] },
  PY: { cc: "595", national: [9] },
  BO: { cc: "591", national: [8] },
  EC: { cc: "593", national: [9] },
  VE: { cc: "58", national: [10] },
  PA: { cc: "507", national: [7, 8] },
  CR: { cc: "506", national: [8] },
  GT: { cc: "502", national: [8] },
  HN: { cc: "504", national: [8] },
  SV: { cc: "503", national: [8] },
  NI: { cc: "505", national: [8] },
  PT: { cc: "351", national: [9] },
  ES: { cc: "34", national: [9] },
  FR: { cc: "33", national: [9] },
  DE: { cc: "49", national: [10, 11] },
  IT: { cc: "39", national: [9, 10] },
  GB: { cc: "44", national: [10] },
  IE: { cc: "353", national: [9] },
  NL: { cc: "31", national: [9] },
  BE: { cc: "32", national: [8, 9] },
  CH: { cc: "41", national: [9] },
  AT: { cc: "43", national: [10, 11] },
  SE: { cc: "46", national: [9] },
  NO: { cc: "47", national: [8] },
  DK: { cc: "45", national: [8] },
  FI: { cc: "358", national: [9, 10] },
  PL: { cc: "48", national: [9] },
  GR: { cc: "30", national: [10] },
  RO: { cc: "40", national: [9] },
  CZ: { cc: "420", national: [9] },
  AO: { cc: "244", national: [9] },
  MZ: { cc: "258", national: [9] },
  ZA: { cc: "27", national: [9] },
  AU: { cc: "61", national: [9] },
  NZ: { cc: "64", national: [8, 9, 10] },
  JP: { cc: "81", national: [9, 10] },
  CN: { cc: "86", national: [11] },
  IN: { cc: "91", national: [10] },
  SG: { cc: "65", national: [8] },
  PH: { cc: "63", national: [10] },
  KR: { cc: "82", national: [9, 10] },
  AE: { cc: "971", national: [8, 9] },
  IL: { cc: "972", national: [8, 9] },
}

function dialPlanFor(country: string): DialPlan {
  const iso = country.trim().toUpperCase()
  const plan = DIAL_PLANS[iso]
  if (plan) return plan

  // Nunca sem prefixo: número sem código do país é o pior caso, porque não
  // casa com nada e não avisa. Um prefixo possivelmente errado, com aviso no
  // log, pelo menos deixa rastro.
  console.warn(
    `[hash] país "${iso}" sem plano de discagem em DIAL_PLANS: usando ` +
      `${DEFAULT_PHONE_COUNTRY}. Acrescente o país em lib/crypto/hash.ts.`
  )
  return DIAL_PLANS[DEFAULT_PHONE_COUNTRY] ?? DIAL_PLANS.BR
}

/**
 * Telefone: só dígitos, em formato internacional, sem "+", espaços ou traços.
 *
 * O CÓDIGO DO PAÍS NÃO É OPCIONAL. O Meta compara o hash do número completo,
 * então um celular digitado como "(11) 98765-4321" vira "11987654321" e nunca
 * bate com o "5511987654321" que o Meta espera. Isso não gera erro nenhum —
 * só zera a correspondência, em silêncio.
 *
 * `country` é um ISO-2 ("BR", "US"). Numa compra ele vem da moeda da transação
 * (`obterPaisDaMoeda`); sem compra, do padrão do deploy
 * (`TRACKING_DEFAULT_PHONE_COUNTRY`). Nunca da geolocalização do visitante.
 *
 * Como o tamanho decide, na ordem:
 * - Começou com "+": a pessoa já digitou o formato internacional, vale como
 *   veio — inclusive um número de país diferente do da compra.
 * - Começa com o código do país e o resto tem tamanho nacional = já é
 *   internacional ("5511987654321").
 * - Tem tamanho nacional = recebe o prefixo. Isso resolve certo o caso
 *   ambíguo do DDD 55 (Santa Maria/RS): "55987654321" tem 11 dígitos, o resto
 *   depois do "55" tem 9 (não é nacional), então vira "5555987654321".
 * - Qualquer outro tamanho fica como veio: chutar um prefixo estragaria o que
 *   já estava certo.
 */
export function normalizePhone(
  phone: string | null | undefined,
  country: string = DEFAULT_PHONE_COUNTRY
): string | null {
  if (!phone) return null

  // O zero à esquerda é prefixo de discagem interurbana, não faz parte do
  // número.
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "")
  if (!digits) return null

  if (phone.trim().startsWith("+")) return digits

  const { cc, national } = dialPlanFor(country)

  if (digits.startsWith(cc) && national.includes(digits.length - cc.length)) {
    return digits
  }
  if (national.includes(digits.length)) {
    return cc + digits
  }

  return digits
}

export function hashPhone(
  phone: string | null | undefined,
  country: string = DEFAULT_PHONE_COUNTRY
): string | null {
  const normalized = normalizePhone(phone, country)
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

/**
 * CEP / zip: minúsculo, sem espaço e sem traço.
 *
 * A doc do Meta abre exceção só pros Estados Unidos ("Use only the first 5
 * digits for U.S. zip codes"), onde o sufixo ZIP+4 é ruído. Fora dos EUA o
 * código vai inteiro — um CEP brasileiro são 8 dígitos ("01310-100" ->
 * "01310100"), e cortar em 5 deixaria só o prefixo do bairro, destruindo a
 * precisão justamente onde ela existe.
 *
 * O país vem separado porque é `visitors.geo_country` (ISO-2) que decide, e não
 * o formato do próprio CEP: "94035" é um zip americano e também o começo de um
 * CEP brasileiro.
 */
export function hashZip(
  zip: string | null | undefined,
  country: string | null | undefined
): string | null {
  if (!zip) return null

  const normalized = zip.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (!normalized) return null

  const isUS = country?.trim().toLowerCase().slice(0, 2) === "us"
  const final = isUS ? normalized.slice(0, 5) : normalized

  return final ? sha256(final) : null
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
