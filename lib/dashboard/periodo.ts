/**
 * O período do painel — o vocabulário único que a topbar e todas as telas leem.
 *
 * Antes eram 4 cópias idênticas (filters, vendas-filters, leads-filters,
 * geo-filters) e só existia INÍCIO: todo período terminava "agora". "Ontem" e o
 * intervalo personalizado precisam de FIM, então a regra passou a morar aqui.
 * Cada tela continua com o seu `PERIODO_PADRAO`.
 *
 * Na URL é um parâmetro só, `?periodo=`: uma chave fixa (`hoje`, `7d`...) ou um
 * intervalo `2026-10-01..2026-10-10` (datas inclusivas, no fuso do painel). Um
 * parâmetro só mantém o link compartilhável e o "zera a paginação" de sempre.
 *
 * SEM `server-only`: a topbar e as barras de filtro são Client Components.
 */

import { diaLocal, inicioDoDiaEm, inicioDoDiaLocal } from "./timezone"

/**
 * `de`/`ate` = quantos dias atrás, inclusivos. Dias de calendário, não janela
 * deslizante: "7 dias" abre em 00:00 de seis dias atrás, no fuso do painel.
 */
export const PERIODOS = {
  hoje: { label: "Hoje", de: 0, ate: 0 },
  ontem: { label: "Ontem", de: 1, ate: 1 },
  "7d": { label: "7 dias", de: 6, ate: 0 },
  "30d": { label: "30 dias", de: 29, ate: 0 },
  tudo: { label: "Tudo", de: null, ate: null },
} as const

export type PeriodoFixo = keyof typeof PERIODOS
export type PeriodoPersonalizado = `${string}..${string}`
export type PeriodoKey = PeriodoFixo | PeriodoPersonalizado

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/

function diaValido(valor: string): boolean {
  if (!DIA_ISO.test(valor)) return false
  const [a, m, d] = valor.split("-").map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** "2026-10-01" + n dias, em aritmética de calendário pura (sem fuso). */
function somarDias(diaIso: string, n: number): string {
  const [a, m, d] = diaIso.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}

export function periodoPersonalizado(de: string, ate: string): PeriodoPersonalizado {
  return de <= ate ? `${de}..${ate}` : `${ate}..${de}`
}

/** As duas datas do intervalo personalizado, ou null se for um período fixo. */
export function datasDoPeriodo(periodo: PeriodoKey): { de: string; ate: string } | null {
  if (periodo in PERIODOS) return null
  const [de, ate] = periodo.split("..")
  return { de, ate }
}

/** Valida o que veio da URL; qualquer coisa estranha cai no padrão da tela. */
export function lerPeriodo(bruto: string | undefined | null, padrao: PeriodoKey): PeriodoKey {
  if (!bruto) return padrao
  if (bruto in PERIODOS) return bruto as PeriodoFixo

  const partes = bruto.split("..")
  if (partes.length === 2 && partes.every(diaValido)) {
    return periodoPersonalizado(partes[0], partes[1])
  }
  return padrao
}

/**
 * O recorte em instantes absolutos: `inicio` inclusivo, `fim` EXCLUSIVO.
 * `null` = sem limite daquele lado. Períodos que terminam hoje não têm fim —
 * cortar em "agora" esconderia o evento que chegou durante o carregamento.
 */
export function periodoIntervalo(periodo: PeriodoKey): { inicio: Date | null; fim: Date | null } {
  const datas = datasDoPeriodo(periodo)
  if (datas) {
    return { inicio: inicioDoDiaEm(datas.de), fim: inicioDoDiaEm(datas.ate, 1) }
  }

  const cfg = PERIODOS[periodo as PeriodoFixo]
  if (cfg.de === null) return { inicio: null, fim: null }

  return {
    inicio: inicioDoDiaLocal(cfg.de),
    fim: cfg.ate === 0 ? null : inicioDoDiaLocal(cfg.ate - 1),
  }
}

/**
 * Os dias de calendário do período ("2026-10-01", ...), em ordem — os baldes
 * do gráfico. `null` para "Tudo", que não tem começo.
 */
export function diasDoPeriodo(periodo: PeriodoKey): string[] | null {
  const datas = datasDoPeriodo(periodo)
  let de: string
  let ate: string

  if (datas) {
    ;({ de, ate } = datas)
  } else {
    const cfg = PERIODOS[periodo as PeriodoFixo]
    if (cfg.de === null) return null
    const hoje = diaLocal(new Date())
    de = somarDias(hoje, -cfg.de)
    ate = somarDias(hoje, -cfg.ate)
  }

  const dias: string[] = []
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d)
  return dias
}

const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
})

export function formatarDia(diaIso: string): string {
  return DATA_CURTA.format(new Date(`${diaIso}T00:00:00Z`))
}

/** "Hoje", "7 dias"... ou "01/10/26 – 10/10/26" para o personalizado. */
export function rotuloDoPeriodo(periodo: PeriodoKey): string {
  const datas = datasDoPeriodo(periodo)
  if (!datas) return PERIODOS[periodo as PeriodoFixo].label
  if (datas.de === datas.ate) return formatarDia(datas.de)
  return `${formatarDia(datas.de)} – ${formatarDia(datas.ate)}`
}
