/**
 * Formatação de data/hora do painel.
 *
 * O fuso é FIXO em America/Sao_Paulo, de propósito. Estas telas são
 * renderizadas no servidor, que na Vercel roda em UTC: sem fixar o fuso, um
 * evento das 21h apareceria como meia-noite do dia seguinte, e a data no
 * servidor divergiria da data no navegador (hydration mismatch). O negócio é
 * brasileiro, então fixar é mais correto do que adivinhar.
 */

const FUSO = "America/Sao_Paulo"

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

const dataHoraCompleta = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  dateStyle: "short",
  timeStyle: "medium",
})

export function formatarDataHora(iso: string): string {
  return dataHora.format(new Date(iso))
}

export function formatarCompleto(iso: string): string {
  return dataHoraCompleta.format(new Date(iso))
}

const relativo = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" })

const ESCALAS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
]

/** "há 3 minutos" / "em 12 minutos". Sempre relativo a `agora`. */
export function tempoRelativo(iso: string, agora = Date.now()): string {
  const delta = new Date(iso).getTime() - agora

  for (const [unidade, ms] of ESCALAS) {
    if (Math.abs(delta) >= ms) {
      return relativo.format(Math.round(delta / ms), unidade)
    }
  }

  return "agora"
}

/** Só a espera que ainda falta; null quando o momento já passou. */
export function faltaPara(iso: string, agora = Date.now()): string | null {
  const delta = new Date(iso).getTime() - agora
  if (delta <= 0) return null
  return tempoRelativo(iso, agora)
}
