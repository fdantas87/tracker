import "server-only"

import { createServiceClient } from "@/lib/supabase/service"
import { ACCOUNT_CONFIG, type AccountKind } from "./config"

/**
 * Leitura das tabelas de configuração.
 *
 * Passa por `service_role` porque essas 4 tabelas não têm política de SELECT
 * nem para usuário autenticado (decisão da fase 2). Só o servidor lê, e o que
 * sai daqui NUNCA inclui segredo — só o id do Vault fica no servidor, e nem
 * ele é exposto pra UI.
 */

export type AccountRow = {
  id: string
  label: string
  publicId: string
  isActive: boolean
  updatedAt: string
}

export type SettingsRow = {
  currency: string
  testEventCode: string | null
  hasWebhookToken: boolean
  updatedAt: string
}

export async function listAccounts(kind: AccountKind): Promise<AccountRow[]> {
  const config = ACCOUNT_CONFIG[kind]
  const supabase = createServiceClient()

  // `select("*")` em vez da lista de colunas porque o cliente do Supabase
  // valida a string de select em tempo de compilação e não aceita nome de
  // coluna montado dinamicamente. Não há risco: isto roda no servidor, e o
  // mapeamento abaixo descarta tudo que não deve sair daqui (inclusive o
  // *_vault_id).
  const { data, error } = await supabase
    .from(config.table)
    .select("*")
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(`Falha ao listar ${config.title}: ${error.message}`)
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    label: String(row.label),
    publicId: String(row[config.publicIdColumn]),
    isActive: Boolean(row.is_active),
    updatedAt: String(row.updated_at),
  }))
}

export async function getSettings(): Promise<SettingsRow | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from("settings")
    .select("currency, test_event_code, webhook_token_hash, updated_at")
    .eq("id", true)
    .maybeSingle()

  if (error) {
    throw new Error(`Falha ao ler configurações: ${error.message}`)
  }
  if (!data) return null

  return {
    currency: data.currency,
    testEventCode: data.test_event_code,
    // Só informa SE existe um token. O hash nunca sai do servidor, e o valor
    // bruto não existe em lugar nenhum depois de gerado.
    hasWebhookToken: Boolean(data.webhook_token_hash),
    updatedAt: data.updated_at,
  }
}
