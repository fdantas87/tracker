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

import type { PeriodoKey } from "./periodo"

export {
  PERIODOS,
  lerPeriodo,
  periodoIntervalo,
  diasDoPeriodo,
  type PeriodoKey,
} from "./periodo"

export const DISPATCH_STATUSES = [
  "pending",
  "sending",
  "sent",
  "failed",
  "skipped",
] as const

export type DispatchStatus = (typeof DISPATCH_STATUSES)[number]

/** Período, recorte e baldes vivem em `./periodo`; aqui só o padrão da tela. */
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
