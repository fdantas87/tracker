"use server"

import { requireUser } from "@/lib/auth/require-user"
import { getLeadDetail } from "@/lib/dashboard/leads"

/**
 * Carrega a ficha completa de um lead — chamada quando a aba abre, não na
 * listagem (evita trazer compras/geo/UTM de 50 visitantes por página).
 *
 * `requireUser()` primeiro, sempre: ver a mesma nota em `eventos/actions.ts`.
 * Este arquivo só pode exportar função assíncrona
 * (`scripts/check-server-actions.mjs` falha o build se não).
 */
export async function carregarFicha(trckUserId: string) {
  await requireUser()
  return getLeadDetail(trckUserId)
}
