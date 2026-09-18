"use server"

import { requireUser } from "@/lib/auth/require-user"
import { getEventDetail } from "@/lib/dashboard/events"

/**
 * Carrega os jsonb pesados de um evento — chamada quando o modal abre, não na
 * listagem.
 *
 * `requireUser()` primeiro, sempre: uma Server Action é um endpoint HTTP
 * público, e sem esta linha qualquer um que descobrisse o id dela leria
 * payloads de eventos sem login. Lembrar que este arquivo só pode exportar
 * função assíncrona (`scripts/check-server-actions.mjs` falha o build se não).
 */
export async function carregarDetalhe(id: string) {
  await requireUser()
  return getEventDetail(id)
}
