import "server-only"

import { createServiceClient } from "@/lib/supabase/service"
import { ACCOUNT_CONFIG, type AccountKind } from "./config"
import { isDispatchMode, type DispatchMode } from "./dispatch-modes"

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
  // Fase 7.5 — disparo atrasado
  dispatchMode: DispatchMode
  dispatchDelaySeconds: number
  dispatchImmediateEvents: string[]
  formCaptureEnabled: boolean
  defaultPhoneCountry: string
  dispatchCronUrl: string | null
  hasCronToken: boolean
  // Origens CORS editáveis no painel (Configurações → Geral)
  allowedOrigins: string[]
}

export type StripeAccountRow = {
  isActive: boolean
  /** Só informa que existe. O valor nunca sai do Vault para a UI. */
  hasSecretKey: boolean
  hasWebhookSecret: boolean
  updatedAt: string | null
}

export type QueueDepth = {
  /** Eventos esperando a janela de atraso. */
  pending: number
  /** Já venceram e ainda não saíram — se isto cresce, o cron parou. */
  due: number
  /** Desistimos depois de 5 tentativas. */
  failed: number
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
    .select("*")
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
    dispatchMode: isDispatchMode(data.dispatch_mode)
      ? data.dispatch_mode
      : "adaptive",
    dispatchDelaySeconds: Number(data.dispatch_delay_seconds ?? 900),
    dispatchImmediateEvents: Array.isArray(data.dispatch_immediate_events)
      ? (data.dispatch_immediate_events as string[])
      : [],
    formCaptureEnabled: Boolean(data.form_capture_enabled),
    defaultPhoneCountry: String(data.default_phone_country ?? "55"),
    dispatchCronUrl: data.dispatch_cron_url ?? null,
    // Mesma regra do token do webhook: informa que existe, nunca o valor.
    hasCronToken: Boolean(data.dispatch_cron_token_vault_id),
    allowedOrigins: Array.isArray(data.allowed_origins)
      ? (data.allowed_origins as string[])
      : [],
  }
}

/**
 * Credenciais do Stripe (linha singleton).
 *
 * Nunca devolve os `*_vault_id` nem os segredos — só se cada um existe, mesma
 * regra do `hasWebhookToken` acima. `null` = nunca foi configurado.
 */
export async function getStripeAccount(): Promise<StripeAccountRow | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from("stripe_accounts")
    .select("*")
    .eq("id", true)
    .maybeSingle()

  if (error) {
    throw new Error(`Falha ao ler a integração do Stripe: ${error.message}`)
  }
  if (!data) return null

  return {
    isActive: Boolean(data.is_active),
    hasSecretKey: Boolean(data.secret_key_vault_id),
    hasWebhookSecret: Boolean(data.webhook_secret_vault_id),
    updatedAt: data.updated_at ?? null,
  }
}

/**
 * Profundidade da fila de disparo.
 *
 * `due` é o número que importa: são eventos que já deviam ter saído. Se ele
 * cresce, o pg_cron parou de chamar o endpoint — e sem este indicador essa
 * falha seria completamente silenciosa.
 */
export async function getQueueDepth(): Promise<QueueDepth | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc("event_queue_depth")

  if (error || !data) return null

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null

  return {
    pending: Number(row.pending ?? 0),
    due: Number(row.due ?? 0),
    failed: Number(row.failed ?? 0),
  }
}
