/**
 * Links para dentro do painel do Clarity.
 *
 * Mapa de calor e gravação NÃO têm API nem podem ser embutidos (o Clarity
 * recusa iframe de outra origem). O que o tracker pode fazer é levar o usuário
 * direto ao mapa certo — da página certa — em um clique.
 *
 * O formato dos parâmetros (`date_h`, `url_h` no heatmap; `date_d` no
 * dashboard) foi tirado do link público de demonstração da própria Microsoft
 * (`clarity.microsoft.com/demo/projects/view/<id>/heatmaps?date_h=...&url_h=...`).
 * Não é documentado como contrato: se o Clarity mudar, o link continua abrindo
 * o projeto certo, só sem o filtro.
 *
 * SEM `server-only`: os botões da tela são Client Components.
 */

import { CLARITY_APP_URL } from "./constants"

/** O Clarity usa rótulos em inglês nos parâmetros de data. */
export type ClarityRange = "Last 3 days" | "Last 7 days" | "Last 30 days"

function base(projectId: string): string {
  return `${CLARITY_APP_URL}/projects/view/${encodeURIComponent(projectId)}`
}

export function claritySessionRange(dias: number): ClarityRange {
  if (dias <= 3) return "Last 3 days"
  if (dias <= 7) return "Last 7 days"
  return "Last 30 days"
}

export function clarityDashboardUrl(projectId: string, range: ClarityRange = "Last 7 days"): string {
  const url = new URL(`${base(projectId)}/dashboard`)
  url.searchParams.set("date_d", range)
  return url.toString()
}

/**
 * Mapa de calor de uma página. Sem `pageUrl`, abre a lista de páginas mais
 * visitadas do Clarity, que é o ponto de partida natural.
 */
export function clarityHeatmapUrl(
  projectId: string,
  pageUrl?: string | null,
  range: ClarityRange = "Last 30 days"
): string {
  const url = new URL(`${base(projectId)}/heatmaps`)
  url.searchParams.set("date_h", range)
  if (pageUrl) url.searchParams.set("url_h", pageUrl)
  return url.toString()
}

export function clarityRecordingsUrl(projectId: string): string {
  return `${base(projectId)}/impressions`
}

export function claritySettingsUrl(projectId: string): string {
  return `${base(projectId)}/settings`
}
