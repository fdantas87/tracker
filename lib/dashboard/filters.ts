/**
 * Vocabulário dos filtros do painel — valores e tipos, sem nenhum acesso a
 * dados.
 *
 * Mora num módulo separado de propósito: `lib/dashboard/events.ts` importa
 * `server-only`, e a barra de filtros é um Client Component. Se ela importasse
 * uma constante de lá, o bundler arrastaria o módulo inteiro para o cliente e
 * o build quebraria com "'server-only' cannot be imported from a Client
 * Component module". Mesma razão de `lib/settings/dispatch-modes.ts` e
 * `lib/settings/action-state.ts` existirem.
 */

import { inicioDoDiaLocal } from "./timezone"

export const DISPATCH_STATUSES = [
  "pending",
  "sending",
  "sent",
  "failed",
  "skipped",
] as const

export type DispatchStatus = (typeof DISPATCH_STATUSES)[number]

/**
 * `dias` é a quantidade de DIAS DE CALENDÁRIO incluindo o de hoje — não uma
 * janela deslizante de N×24h. "7 dias" abre em 00:00 de seis dias atrás, no
 * fuso do painel.
 *
 * Antes era janela deslizante, e isso desalinhava o gráfico da tabela: o
 * primeiro balde do gráfico sempre nascia parcial, porque ele já agrupava por
 * dia enquanto o filtro cortava no meio do dia mais antigo.
 */
export const PERIODOS = {
  hoje: { label: "Hoje", dias: 1 },
  "7d": { label: "7 dias", dias: 7 },
  "30d": { label: "30 dias", dias: 30 },
  tudo: { label: "Tudo", dias: null },
} as const

export type PeriodoKey = keyof typeof PERIODOS

export const PERIODO_PADRAO: PeriodoKey = "7d"

export const PAGE_SIZE = 50

export type EventFilters = {
  evento?: string
  status?: DispatchStatus
  periodo: PeriodoKey
  q?: string
  pagina: number
}

export type SeriePonto = { dia: string; enviados: number; outros: number }

/**
 * Início do recorte de tempo, ou null para "tudo".
 *
 * Sempre a meia-noite no fuso do painel. A versão anterior usava
 * `setHours(0,0,0,0)`, que opera no fuso do PROCESSO — UTC na Vercel —, então
 * "Hoje" na verdade começava às 21h de ontem no horário de Brasília e trazia
 * eventos que a própria tabela exibia com a data de ontem.
 */
export function periodoInicio(periodo: PeriodoKey): Date | null {
  const cfg = PERIODOS[periodo] ?? PERIODOS[PERIODO_PADRAO]
  if (cfg.dias === null) return null

  return inicioDoDiaLocal(cfg.dias - 1)
}
