/**
 * Vocabulário dos filtros da tela de Leads — valores e tipos, sem acesso a
 * dados.
 *
 * Módulo próprio, não importado de `./filters` (o de Eventos): cada tela
 * mantém seu filtro autocontido, mesmo padrão de `lib/settings/dispatch-modes.ts`.
 * Continua valendo o motivo original — `lib/dashboard/leads.ts` importa
 * `server-only`, e a barra de filtros é Client Component; se ela importasse
 * uma constante de lá, o bundler arrastaria o módulo inteiro para o cliente.
 */

import type { PeriodoKey } from "./periodo"

export { PERIODOS, lerPeriodo, periodoIntervalo, type PeriodoKey } from "./periodo"

export const PERIODO_PADRAO: PeriodoKey = "7d"

export const PAGE_SIZE = 50

export const IDENTIFICADO_VALORES = ["todos", "sim", "nao"] as const
export type IdentificadoFiltro = (typeof IDENTIFICADO_VALORES)[number]

export const CONVERTEU_VALORES = ["todos", "sim", "nao"] as const
export type ConverteuFiltro = (typeof CONVERTEU_VALORES)[number]

export type LeadFilters = {
  /** Busca por e-mail ou trck_user_id. */
  q?: string
  identificado: IdentificadoFiltro
  converteu: ConverteuFiltro
  /** Sobre visitors.created_at. */
  periodo: PeriodoKey
  pagina: number
}
