/**
 * Estado compartilhado das Server Actions de configuração.
 *
 * Mora AQUI, e não junto das actions, por uma regra do Next: um arquivo
 * `"use server"` só pode exportar funções assíncronas. Exportar uma constante
 * de lá (como `IDLE_STATE`) derruba a página em tempo de execução com
 * "A use server file can only export async functions, found object" — e o
 * `next build` NÃO pega isso, porque o erro só aparece quando o módulo é
 * avaliado. Tipos podem ficar no arquivo de actions (somem na compilação),
 * mas valores, não.
 */
export type ActionState = {
  ok: boolean
  message: string | null
  /** Token do webhook em texto puro — devolvido UMA única vez, nunca persistido. */
  revealedToken?: string | null
}

export const IDLE_STATE: ActionState = { ok: false, message: null }
