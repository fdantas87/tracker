"use server"

import { requireUser } from "@/lib/auth/require-user"
import { getVendaDetail } from "@/lib/dashboard/vendas"

/**
 * Carrega o detalhe de uma venda — chamado quando o painel lateral abre, não na
 * listagem (evita trazer visitante, geo, UTM e histórico de 50 compras por
 * página).
 *
 * `requireUser()` primeiro, sempre: uma Server Action é na prática um endpoint
 * HTTP público, e quem descobrir o id dela pode chamá-la sem passar por página
 * nenhuma. Este arquivo só pode exportar função assíncrona
 * (`scripts/check-server-actions.mjs` falha o build se não).
 */
export async function carregarVenda(purchaseId: string) {
  await requireUser()
  return getVendaDetail(purchaseId)
}
