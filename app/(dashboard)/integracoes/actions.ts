"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/lib/auth/require-user"
import {
  deleteSecret,
  revealSecret,
  storeSecret,
  updateSecret,
} from "@/lib/crypto/vault"
import {
  testStripeConnection,
  type ConnectionTestResult,
} from "@/lib/connections/test-connection"
import { createServiceClient } from "@/lib/supabase/service"
// ATENÇÃO: este arquivo é "use server" — só pode EXPORTAR funções assíncronas.
// Tipo e constante de estado vivem em lib/settings/action-state.ts (o mesmo
// módulo usado pelas actions de Configurações). Ver scripts/check-server-actions.mjs.
import type { ActionState } from "@/lib/settings/action-state"

/**
 * Formatos das duas credenciais do Stripe.
 *
 * Validar o formato aqui não é firula: a secret key vai no header de uma
 * chamada à API do Stripe, e o signing secret vira chave de HMAC. Um valor
 * colado pela metade falharia depois, longe daqui, como "assinatura inválida"
 * em todo webhook — sintoma que não aponta para a causa.
 */
const SECRET_KEY_PATTERN = /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/
const WEBHOOK_SECRET_PATTERN = /^whsec_[A-Za-z0-9+/=_-]+$/
const MAX_SECRET_LENGTH = 300

function fail(message: string): ActionState {
  return { ok: false, message }
}

function succeed(message: string): ActionState {
  return { ok: true, message }
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

type StripeRow = {
  is_active: boolean
  secret_key_vault_id: string | null
  webhook_secret_vault_id: string | null
}

async function readStripeRow(): Promise<StripeRow | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("stripe_accounts")
    .select("is_active, secret_key_vault_id, webhook_secret_vault_id")
    .eq("id", true)
    .maybeSingle()

  return (data as StripeRow | null) ?? null
}

/**
 * Salva (ou substitui) as credenciais do Stripe.
 *
 * Campo em branco significa "manter o atual", igual ao formulário de contas de
 * Configurações — o valor salvo nunca volta pra tela, então não há como
 * pré-preencher, e exigir redigitar os dois para trocar um só seria um convite
 * a colar a chave errada.
 */
export async function saveStripeCredentials(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireUser()

    const secretKey = String(formData.get("secret_key") ?? "").trim()
    const webhookSecret = String(formData.get("webhook_secret") ?? "").trim()

    if (secretKey.length > MAX_SECRET_LENGTH || webhookSecret.length > MAX_SECRET_LENGTH) {
      return fail("Credencial longa demais — confira se colou o valor certo.")
    }
    if (secretKey && !SECRET_KEY_PATTERN.test(secretKey)) {
      return fail("Secret key fora do formato (sk_test_... ou sk_live_...).")
    }
    if (webhookSecret && !WEBHOOK_SECRET_PATTERN.test(webhookSecret)) {
      return fail("Signing secret fora do formato (começa com whsec_).")
    }

    const existing = await readStripeRow()

    if (!existing?.secret_key_vault_id && !secretKey) {
      return fail("Informe a secret key do Stripe.")
    }
    if (!existing?.webhook_secret_vault_id && !webhookSecret) {
      return fail("Informe o signing secret do webhook.")
    }

    const supabase = createServiceClient()
    // Só o que foi gravado AGORA entra nesta lista: se a escrita da linha
    // falhar, é isso que precisa ser desfeito para não deixar segredo órfão
    // cifrado no Vault. Um segredo já existente e apenas atualizado não entra —
    // apagá-lo quebraria a integração que estava de pé.
    const criados: string[] = []

    try {
      let secretKeyVaultId = existing?.secret_key_vault_id ?? null
      if (secretKey) {
        if (secretKeyVaultId) {
          await updateSecret(secretKeyVaultId, secretKey)
        } else {
          secretKeyVaultId = await storeSecret(secretKey, "stripe:secret_key")
          criados.push(secretKeyVaultId)
        }
      }

      let webhookSecretVaultId = existing?.webhook_secret_vault_id ?? null
      if (webhookSecret) {
        if (webhookSecretVaultId) {
          await updateSecret(webhookSecretVaultId, webhookSecret)
        } else {
          webhookSecretVaultId = await storeSecret(
            webhookSecret,
            "stripe:webhook_secret"
          )
          criados.push(webhookSecretVaultId)
        }
      }

      const { error } = await supabase.from("stripe_accounts").upsert(
        {
          id: true,
          secret_key_vault_id: secretKeyVaultId,
          webhook_secret_vault_id: webhookSecretVaultId,
          // Conectar pela primeira vez já deixa ativo — pedir um segundo clique
          // depois de colar as credenciais seria só atrito. Mas trocar a
          // credencial de uma integração que o operador marcou como inativa
          // NÃO a reativa: isso mudaria um estado que ele escolheu, calado.
          is_active: existing ? existing.is_active : true,
        },
        { onConflict: "id" }
      )

      if (error) throw new Error(error.message)
    } catch (error) {
      for (const vaultId of criados) {
        await deleteSecret(vaultId).catch(() => {})
      }
      throw error
    }

    revalidatePath("/integracoes")
    return succeed("Stripe conectado. Cadastre a URL do webhook no painel do Stripe.")
  } catch (error) {
    return fail(toMessage(error, "Falha ao salvar as credenciais."))
  }
}

export async function toggleStripeActive(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireUser()

    const nextActive = String(formData.get("next_active") ?? "") === "true"
    const supabase = createServiceClient()

    const { error } = await supabase
      .from("stripe_accounts")
      .update({ is_active: nextActive })
      .eq("id", true)

    if (error) return fail(`Não foi possível atualizar: ${error.message}`)

    revalidatePath("/integracoes")
    return succeed(
      nextActive
        ? "Integração marcada como ativa."
        : "Integração marcada como inativa. Os webhooks continuam sendo recebidos e as vendas, registradas."
    )
  } catch (error) {
    return fail(toMessage(error, "Falha ao atualizar a integração."))
  }
}

/**
 * Remove as credenciais.
 *
 * Apaga a linha primeiro e os segredos depois — mesma ordem do
 * `deleteAccount` de Configurações, pelo mesmo motivo: o contrário deixaria
 * uma linha apontando para um segredo que não existe mais.
 *
 * As VENDAS já registradas não são tocadas. Quem desconecta o Stripe não está
 * pedindo para apagar o faturamento dele.
 */
export async function removeStripeIntegration(): Promise<ActionState> {
  try {
    await requireUser()

    const existing = await readStripeRow()
    if (!existing) return fail("Não há integração do Stripe configurada.")

    const supabase = createServiceClient()
    const { error } = await supabase
      .from("stripe_accounts")
      .delete()
      .eq("id", true)

    if (error) return fail(`Não foi possível remover: ${error.message}`)

    for (const vaultId of [
      existing.secret_key_vault_id,
      existing.webhook_secret_vault_id,
    ]) {
      if (vaultId) {
        await deleteSecret(vaultId).catch(() => {
          // A linha já saiu; segredo órfão no Vault não expõe nada e não
          // justifica falhar a operação na cara do usuário.
        })
      }
    }

    revalidatePath("/integracoes")
    return succeed("Stripe desconectado. As vendas já registradas continuam no painel.")
  } catch (error) {
    return fail(toMessage(error, "Falha ao remover a integração."))
  }
}

/**
 * Testa a secret key salva.
 *
 * O segredo é revelado aqui, usado na chamada e descartado — nunca volta pra
 * UI, mesma regra de `testAccountConnection`.
 */
export async function testStripeCredentials(): Promise<ConnectionTestResult> {
  try {
    await requireUser()

    const existing = await readStripeRow()
    if (!existing?.secret_key_vault_id) {
      return { status: "erro", message: "Salve a secret key antes de testar." }
    }

    const secretKey = await revealSecret(existing.secret_key_vault_id)
    return await testStripeConnection({ secretKey })
  } catch (error) {
    return {
      status: "erro",
      message: toMessage(error, "Falha ao testar a conexão."),
    }
  }
}
