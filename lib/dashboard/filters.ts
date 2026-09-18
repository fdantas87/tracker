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

export const DISPATCH_STATUSES = [
  "pending",
  "sending",
  "sent",
  "failed",
  "skipped",
] as const

export type DispatchStatus = (typeof DISPATCH_STATUSES)[number]

export const PERIODOS = {
  hoje: { label: "Hoje", dias: 0 },
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

/** Início do recorte de tempo, ou null para "tudo". */
export function periodoInicio(periodo: PeriodoKey): Date | null {
  const cfg = PERIODOS[periodo] ?? PERIODOS[PERIODO_PADRAO]
  if (cfg.dias === null) return null

  const inicio = new Date()
  if (cfg.dias === 0) {
    inicio.setHours(0, 0, 0, 0)
  } else {
    inicio.setDate(inicio.getDate() - cfg.dias)
  }
  return inicio
}
