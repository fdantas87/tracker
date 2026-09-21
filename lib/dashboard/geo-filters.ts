/**
 * Vocabulário da tela de Geo — período e rótulos, sem acesso a dados.
 *
 * Módulo próprio, não importado de `./filters` nem de `./vendas-filters`: cada
 * tela mantém seu filtro autocontido. E o motivo estrutural das outras continua
 * valendo — `lib/dashboard/geo.ts` importa `server-only`, e o mapa e os chips
 * são Client Components; se eles importassem uma constante de lá, o bundler
 * arrastaria o módulo inteiro para o cliente e o build quebraria com
 * "'server-only' cannot be imported from a Client Component module".
 */

import { inicioDoDiaLocal } from "./timezone"

/** Mesma semântica das outras telas: dias de calendário, não janela deslizante. */
export const PERIODOS = {
  hoje: { label: "Hoje", dias: 1 },
  "7d": { label: "7 dias", dias: 7 },
  "30d": { label: "30 dias", dias: 30 },
  tudo: { label: "Tudo", dias: null },
} as const

export type PeriodoKey = keyof typeof PERIODOS

/**
 * Igual ao padrão de `./filters`, que é o módulo de onde o seletor de período
 * da topbar lê o seu. Divergir aqui faria a topbar destacar "7 dias" enquanto a
 * tela mostra outro recorte — a pílula acesa estaria mentindo.
 */
export const PERIODO_PADRAO: PeriodoKey = "7d"

export type GeoFilters = {
  /** Sobre `visitors.created_at` e `purchases.created_at`. */
  periodo: PeriodoKey
  /** Filtro de texto opcional para localização. */
  q?: string
}

/** Início do recorte, ou null para "tudo" — sempre meia-noite no fuso do painel. */
export function periodoInicio(periodo: PeriodoKey): Date | null {
  const cfg = PERIODOS[periodo] ?? PERIODOS[PERIODO_PADRAO]
  if (cfg.dias === null) return null

  return inicioDoDiaLocal(cfg.dias - 1)
}

/**
 * "BR" -> "Brasil". O que chega do header `x-vercel-ip-country` é ISO 3166-1
 * alfa-2, e mostrar a sigla crua num painel em português seria pedir para o
 * leitor decorar código de país.
 *
 * `Intl.DisplayNames` já vem no runtime (Node e navegador), então isto não
 * acrescenta nem dependência nem tabela para manter. Código desconhecido ou
 * runtime sem ICU completo caem no valor original, nunca em erro.
 *
 * Não existe equivalente para `geo_region`: a sigla da UF ("SP", "RJ") é como o
 * brasileiro já lê o dado, e escrever "São Paulo" no chip de estado o deixaria
 * indistinguível do chip de cidade logo ao lado.
 */
const NOMES_DE_PAIS =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["pt-BR"], { type: "region" })
    : null

export function nomeDoPais(codigo: string): string {
  try {
    return NOMES_DE_PAIS?.of(codigo.toUpperCase()) ?? codigo
  } catch {
    return codigo
  }
}
