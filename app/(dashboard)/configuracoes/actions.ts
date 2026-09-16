"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/lib/auth/require-user"
import {
  generateWebhookToken,
  hashWebhookToken,
} from "@/lib/crypto/webhook-token"
import {
  deleteSecret,
  revealSecret,
  storeSecret,
  updateSecret,
} from "@/lib/crypto/vault"
import {
  testGa4Connection,
  testMetaAdAccountConnection,
  testMetaPixelConnection,
  type ConnectionTestResult,
} from "@/lib/connections/test-connection"
import { createServiceClient } from "@/lib/supabase/service"
import {
  ACCOUNT_CONFIG,
  MAX_LABEL_LENGTH,
  MAX_PUBLIC_ID_LENGTH,
  MAX_SECRET_LENGTH,
  isAccountKind,
  type AccountKind,
} from "@/lib/settings/config"

export type ActionState = {
  ok: boolean
  message: string | null
  /** Token do webhook em texto puro — devolvido UMA única vez, nunca persistido. */
  revealedToken?: string | null
}

export const IDLE_STATE: ActionState = { ok: false, message: null }

const CURRENCIES = ["BRL", "USD", "EUR"] as const

function fail(message: string): ActionState {
  return { ok: false, message }
}

function succeed(message: string, revealedToken?: string): ActionState {
  return { ok: true, message, revealedToken }
}

/** Erro de action nunca deve vazar stack trace ou detalhe de banco pra UI. */
function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

// ---------------------------------------------------------------------------
// Geral (settings)
// ---------------------------------------------------------------------------

export async function createInitialSettings(): Promise<ActionState> {
  try {
    await requireUser()

    const supabase = createServiceClient()
    const { data: existing } = await supabase
      .from("settings")
      .select("id")
      .eq("id", true)
      .maybeSingle()

    if (existing) {
      return fail("A configuração já existe.")
    }

    const token = generateWebhookToken()
    const { error } = await supabase.from("settings").insert({
      id: true,
      webhook_token_hash: hashWebhookToken(token),
      currency: "BRL",
    })

    if (error) return fail(`Não foi possível criar: ${error.message}`)

    revalidatePath("/configuracoes")
    return succeed(
      "Configuração criada. Copie o token agora — ele não aparece de novo.",
      token
    )
  } catch (error) {
    return fail(toMessage(error, "Falha ao criar a configuração."))
  }
}

export async function saveGeneralSettings(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireUser()

    const currency = String(formData.get("currency") ?? "").trim()
    const testEventCode = String(formData.get("test_event_code") ?? "").trim()

    if (!(CURRENCIES as readonly string[]).includes(currency)) {
      return fail("Moeda inválida.")
    }
    if (testEventCode.length > 60) {
      return fail("Código de teste muito longo.")
    }

    const supabase = createServiceClient()
    const { error } = await supabase
      .from("settings")
      .update({
        currency,
        test_event_code: testEventCode || null,
      })
      .eq("id", true)

    if (error) return fail(`Não foi possível salvar: ${error.message}`)

    revalidatePath("/configuracoes")
    return succeed("Configurações salvas.")
  } catch (error) {
    return fail(toMessage(error, "Falha ao salvar."))
  }
}

export async function regenerateWebhookToken(): Promise<ActionState> {
  try {
    await requireUser()

    const token = generateWebhookToken()
    const supabase = createServiceClient()

    const { error } = await supabase
      .from("settings")
      .update({ webhook_token_hash: hashWebhookToken(token) })
      .eq("id", true)

    if (error) return fail(`Não foi possível gerar: ${error.message}`)

    revalidatePath("/configuracoes")
    return succeed(
      "Token novo gerado. O anterior parou de funcionar — atualize a URL na plataforma de venda.",
      token
    )
  } catch (error) {
    return fail(toMessage(error, "Falha ao gerar o token."))
  }
}

// ---------------------------------------------------------------------------
// Contas de destino (pixels, GA4, contas de anúncio)
// ---------------------------------------------------------------------------

type ParsedAccountForm = {
  kind: AccountKind
  id: string | null
  label: string
  publicId: string
  secret: string
}

function parseAccountForm(formData: FormData): ParsedAccountForm | string {
  const kind = formData.get("kind")
  if (!isAccountKind(kind)) return "Tipo de conta inválido."

  const config = ACCOUNT_CONFIG[kind]
  const id = String(formData.get("id") ?? "").trim() || null
  const label = String(formData.get("label") ?? "").trim()
  const publicId = String(formData.get("public_id") ?? "").trim()
  const secret = String(formData.get("secret") ?? "").trim()

  if (!label) return "Dê um nome para identificar esta conta."
  if (label.length > MAX_LABEL_LENGTH) return "Nome muito longo."

  if (!publicId) return `Informe o ${config.publicIdLabel}.`
  if (publicId.length > MAX_PUBLIC_ID_LENGTH)
    return `${config.publicIdLabel} muito longo.`
  if (!config.publicIdPattern.test(publicId)) {
    return `${config.publicIdLabel} fora do formato esperado. ${config.publicIdHint}`
  }

  if (secret.length > MAX_SECRET_LENGTH) return "Segredo muito longo."

  return { kind, id, label, publicId, secret }
}

export async function saveAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireUser()

    const parsed = parseAccountForm(formData)
    if (typeof parsed === "string") return fail(parsed)

    const { kind, id, label, publicId, secret } = parsed
    const config = ACCOUNT_CONFIG[kind]
    const supabase = createServiceClient()

    if (!id) {
      // Criação: segredo é obrigatório.
      if (!secret) return fail(`Informe o ${config.secretLabel}.`)

      const vaultId = await storeSecret(secret, `${config.table}:${publicId}`)

      const { error } = await supabase.from(config.table).insert({
        label,
        [config.publicIdColumn]: publicId,
        [config.vaultColumn]: vaultId,
      })

      if (error) {
        // Não deixa segredo órfão no Vault se a linha não entrou.
        await deleteSecret(vaultId).catch(() => {})
        if (error.code === "23505") {
          return fail(`Já existe uma conta com este ${config.publicIdLabel}.`)
        }
        return fail(`Não foi possível salvar: ${error.message}`)
      }

      revalidatePath("/configuracoes")
      return succeed("Conta adicionada.")
    }

    // Edição: segredo em branco significa "manter o atual".
    // `select("*")` porque o cliente do Supabase valida a string de select em
    // tempo de compilação e não aceita coluna dinâmica (idem nas outras).
    const { data: current, error: readError } = await supabase
      .from(config.table)
      .select("*")
      .eq("id", id)
      .maybeSingle()

    if (readError) return fail(`Não foi possível ler a conta: ${readError.message}`)
    if (!current) return fail("Conta não encontrada.")

    if (secret) {
      const vaultId = String(
        (current as Record<string, unknown>)[config.vaultColumn]
      )
      await updateSecret(vaultId, secret)
    }

    const { error } = await supabase
      .from(config.table)
      .update({ label, [config.publicIdColumn]: publicId })
      .eq("id", id)

    if (error) {
      if (error.code === "23505") {
        return fail(`Já existe uma conta com este ${config.publicIdLabel}.`)
      }
      return fail(`Não foi possível salvar: ${error.message}`)
    }

    revalidatePath("/configuracoes")
    return succeed(
      secret ? "Conta atualizada e segredo substituído." : "Conta atualizada."
    )
  } catch (error) {
    return fail(toMessage(error, "Falha ao salvar a conta."))
  }
}

export async function deleteAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireUser()

    const kind = formData.get("kind")
    const id = String(formData.get("id") ?? "").trim()
    if (!isAccountKind(kind)) return fail("Tipo de conta inválido.")
    if (!id) return fail("Conta não informada.")

    const config = ACCOUNT_CONFIG[kind]
    const supabase = createServiceClient()

    const { data: current, error: readError } = await supabase
      .from(config.table)
      .select("*")
      .eq("id", id)
      .maybeSingle()

    if (readError) return fail(`Não foi possível ler a conta: ${readError.message}`)
    if (!current) return fail("Conta não encontrada.")

    // Ordem importa: apaga a linha primeiro, depois o segredo. O contrário
    // deixaria uma linha apontando pra um segredo que não existe mais.
    const { error } = await supabase.from(config.table).delete().eq("id", id)
    if (error) return fail(`Não foi possível remover: ${error.message}`)

    const vaultId = (current as Record<string, unknown>)[config.vaultColumn]
    if (vaultId) {
      await deleteSecret(String(vaultId)).catch(() => {
        // A linha já saiu; um segredo órfão no Vault não expõe nada e não
        // justifica falhar a operação na cara do usuário.
      })
    }

    revalidatePath("/configuracoes")
    return succeed("Conta removida.")
  } catch (error) {
    return fail(toMessage(error, "Falha ao remover a conta."))
  }
}

export async function toggleAccountActive(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireUser()

    const kind = formData.get("kind")
    const id = String(formData.get("id") ?? "").trim()
    const nextActive = String(formData.get("next_active") ?? "") === "true"

    if (!isAccountKind(kind)) return fail("Tipo de conta inválido.")
    if (!id) return fail("Conta não informada.")

    const config = ACCOUNT_CONFIG[kind]
    const supabase = createServiceClient()

    const { error } = await supabase
      .from(config.table)
      .update({ is_active: nextActive })
      .eq("id", id)

    if (error) return fail(`Não foi possível atualizar: ${error.message}`)

    revalidatePath("/configuracoes")
    return succeed(nextActive ? "Conta ativada." : "Conta desativada.")
  } catch (error) {
    return fail(toMessage(error, "Falha ao atualizar a conta."))
  }
}

// ---------------------------------------------------------------------------
// Testar conexão
// ---------------------------------------------------------------------------

export async function testAccountConnection(
  kind: AccountKind,
  accountId: string
): Promise<ConnectionTestResult> {
  try {
    await requireUser()

    if (!isAccountKind(kind)) {
      return { status: "erro", message: "Tipo de conta inválido." }
    }

    const config = ACCOUNT_CONFIG[kind]
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      .eq("id", accountId)
      .maybeSingle()

    if (error || !data) {
      return { status: "erro", message: "Conta não encontrada." }
    }

    const row = data as Record<string, unknown>
    const publicId = String(row[config.publicIdColumn])

    // Segredo é lido aqui, usado na chamada e descartado. Nunca volta pra UI.
    const secret = await revealSecret(String(row[config.vaultColumn]))

    if (kind === "pixel") {
      const { data: settings } = await supabase
        .from("settings")
        .select("test_event_code")
        .eq("id", true)
        .maybeSingle()

      return await testMetaPixelConnection({
        pixelId: publicId,
        capiToken: secret,
        testEventCode: settings?.test_event_code ?? null,
      })
    }

    if (kind === "adaccount") {
      return await testMetaAdAccountConnection({
        adAccountId: publicId,
        adsToken: secret,
      })
    }

    return await testGa4Connection({
      measurementId: publicId,
      apiSecret: secret,
    })
  } catch (error) {
    return {
      status: "erro",
      message: toMessage(error, "Falha ao testar a conexão."),
    }
  }
}
