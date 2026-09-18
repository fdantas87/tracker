/**
 * Formatação de data/hora do painel.
 *
 * O fuso é FIXO em America/Sao_Paulo, de propósito. Estas telas são
 * renderizadas no servidor, que na Vercel roda em UTC: sem fixar o fuso, um
 * evento das 21h apareceria como meia-noite do dia seguinte, e a data no
 * servidor divergiria da data no navegador (hydration mismatch). O negócio é
 * brasileiro, então fixar é mais correto do que adivinhar.
 *
 * A constante vem de `./timezone`, que é quem também recorta os períodos e monta
 * os baldes do gráfico. Ter duas cópias do fuso foi exatamente o que permitiu a
 * tela renderizar em Brasília e agregar em UTC ao mesmo tempo.
 */

import { FUSO_PAINEL } from "./timezone"

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_PAINEL,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

const dataHoraCompleta = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_PAINEL,
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

/**
 * O mesmo instante, mas no relógio de quem gerou o evento — o fuso que veio do
 * header `x-vercel-ip-timezone` e está em `events_log.geo_timezone`.
 *
 * Existe para responder "que horas eram PARA O USUÁRIO", que é diferente de
 * "que horas eram aqui": um evento de Manaus às 23h de lá aparece como meia-
 * noite do dia seguinte em Brasília, e ler isso como "compra de madrugada"
 * levaria a conclusões erradas sobre horário de campanha.
 *
 * Devolve null quando não há fuso gravado ou quando ele é o mesmo do painel —
 * repetir o horário já exibido só ocuparia espaço. Um fuso inválido no banco
 * faz o `Intl` lançar; aí também devolvemos null, porque um dado sujo não pode
 * derrubar a tela inteira.
 */
export function formatarHoraNoFuso(
  iso: string,
  fuso: string | null
): { horario: string; fuso: string } | null {
  if (!fuso || fuso === FUSO_PAINEL) return null

  try {
    const horario = new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(iso))

    return { horario, fuso }
  } catch {
    return null
  }
}
