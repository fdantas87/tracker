/**
 * Formatação dos números do Clarity. SEM `server-only`: a tela e o MCP usam.
 *
 * `null` vira zero na tela ("0", "0%", "0s"), nunca um traço — diretriz de UI
 * do painel inteiro (2026-10-05). O `null` continua existindo nos dados
 * (`normalize.ts`): só a exibição o trata como zero.
 */

const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })

export function fmtInteiro(v: number | null): string {
  return inteiro.format(v ?? 0)
}

export function fmtDecimal(v: number | null): string {
  return decimal.format(v ?? 0)
}

export function fmtPct(v: number | null): string {
  return `${decimal.format(v ?? 0)}%`
}

/** 75 -> "1m 15s"; 42 -> "42s". */
export function fmtDuracao(segundos: number | null): string {
  const s = Math.round(segundos ?? 0)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const resto = s % 60
  return resto ? `${m}m ${resto}s` : `${m}m`
}

/** "https://site.com/oferta?x=1" -> "/oferta". Para caber na tabela. */
export function caminhoDaUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname || "/"
  } catch {
    return url
  }
}
