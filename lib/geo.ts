import "server-only"

/**
 * IP real e geolocalização a partir dos headers da requisição.
 *
 * O geo vem dos headers que a Vercel injeta na borda (`x-vercel-ip-*`) — sem
 * custo, sem API externa, sem outra credencial pra guardar. Fora da Vercel
 * (localhost, outro host) esses headers não existem e o geo fica nulo, o que
 * é tratado como normal: geo é enriquecimento, nunca requisito.
 *
 * SÃO OITO HEADERS, e por muito tempo só três eram lidos. Todos são gratuitos
 * em TODOS os planos (Hobby, Pro e Enterprise) desde o changelog "IP
 * Geolocation now available for all plans", e resolvidos na borda antes da
 * função rodar — nenhum custo por requisição, nenhuma cota.
 *
 * POR QUE NÃO `geolocation()` DO @vercel/functions: o helper oficial devolve
 * city/country/countryRegion/latitude/longitude/postalCode, mas NÃO expõe o
 * timezone, e o `region` que ele devolve é a região da Vercel que atendeu a
 * requisição (ex.: "gru1"), não a do usuário. Seria uma dependência a mais para
 * ler os mesmos headers com menos informação.
 *
 * `x-vercel-ip-continent` fica de fora de propósito: não há uso para ele num
 * negócio de um país só.
 */

export type GeoInfo = {
  ip: string | null
  country: string | null
  region: string | null
  city: string | null
  /** Aproximado: é a área do provedor, não o endereço da pessoa. */
  postalCode: string | null
  latitude: number | null
  longitude: number | null
  /** Fuso IANA, ex.: "America/Manaus". */
  timezone: string | null
}

/**
 * O IP real fica no primeiro item de `x-forwarded-for` — os seguintes são os
 * proxies pelo caminho. Nunca confie no header inteiro como se fosse um IP só.
 */
export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }

  return headers.get("x-real-ip")?.trim() || null
}

export function getGeo(headers: Headers): GeoInfo {
  return {
    ip: getClientIp(headers),
    country: headers.get("x-vercel-ip-country") || null,
    region: headers.get("x-vercel-ip-country-region") || null,
    // A Vercel manda a cidade percent-encoded ("S%C3%A3o%20Paulo"). O CEP passa
    // pelo mesmo tratamento por garantia: custa nada e cobre formatos com
    // espaço em países que usam.
    city: decodeHeader(headers.get("x-vercel-ip-city")),
    postalCode: decodeHeader(headers.get("x-vercel-ip-postal-code")),
    latitude: toCoordinate(headers.get("x-vercel-ip-latitude")),
    longitude: toCoordinate(headers.get("x-vercel-ip-longitude")),
    timezone: headers.get("x-vercel-ip-timezone") || null,
  }
}

function decodeHeader(value: string | null): string | null {
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * `geo_latitude`/`geo_longitude` são `double precision` no Postgres. Um header
 * malformado não pode derrubar a captura — mesma postura de `toInetOrNull`.
 */
function toCoordinate(value: string | null): number | null {
  if (!value) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * `visitors.ip` e `events_log.ip` são do tipo `inet` no Postgres, que rejeita
 * texto que não seja IP válido. Um valor estranho num header não pode derrubar
 * a captura inteira, então filtramos antes de gravar.
 */
export function toInetOrNull(ip: string | null): string | null {
  if (!ip) return null

  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6 = /^[0-9a-fA-F:]+$/

  if (ipv4.test(ip)) {
    const parts = ip.split(".").map(Number)
    return parts.every((p) => p >= 0 && p <= 255) ? ip : null
  }

  // IPv6 só precisa ter os caracteres válidos e ao menos um ":" — o Postgres
  // faz a validação fina e, se recusar, o insert trata o erro.
  if (ip.includes(":") && ipv6.test(ip)) return ip

  return null
}
