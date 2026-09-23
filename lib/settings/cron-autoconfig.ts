import "server-only"

import { deleteSecret, storeSecret } from "@/lib/crypto/vault"
import { generateWebhookToken } from "@/lib/crypto/webhook-token"
import { createServiceClient } from "@/lib/supabase/service"
import { invalidateDispatchConfig } from "./dispatch-config"

/**
 * Garante que o pg_cron tem o endereço e o token certos para o domínio que o
 * admin está usando agora — sem pedir nada a ele. `url` já vem pronta de quem
 * chamou (o header Host lido em `app/(dashboard)/layout.tsx`, antes do
 * `after()`). Só escreve quando algo difere do que já está salvo, então na
 * maioria das requisições isto é um único `select` barato.
 *
 * O token NUNCA é revelado nem devolvido daqui: diferente do webhook_token
 * (que precisa ser colado na plataforma de pagamento), o token do cron só é
 * lido internamente por `tick_event_queue()` via `reveal_secret` — nenhum
 * humano precisa copiá-lo pra lugar nenhum.
 */
export async function ensureCronDispatchConfigured(url: string): Promise<void> {
  const supabase = createServiceClient()
  const { data: current, error } = await supabase
    .from("settings")
    .select("dispatch_cron_url, dispatch_cron_token_vault_id")
    .eq("id", true)
    .maybeSingle()

  // Sem settings ainda (setup inicial não rodou) ou erro de leitura: nada a
  // fazer agora — a próxima visita autenticada tenta de novo.
  if (error || !current) return

  if (current.dispatch_cron_url !== url) {
    await supabase.from("settings").update({ dispatch_cron_url: url }).eq("id", true)
    invalidateDispatchConfig()
  }

  if (!current.dispatch_cron_token_vault_id) {
    const token = generateWebhookToken()
    const vaultId = await storeSecret(token, `cron_dispatch_${Date.now()}`)
    const { error: tokenError } = await supabase
      .from("settings")
      .update({ dispatch_cron_token_vault_id: vaultId })
      .eq("id", true)

    // Endereço já está salvo; só o token ficaria órfão no Vault.
    if (tokenError) await deleteSecret(vaultId).catch(() => {})
  }
}
