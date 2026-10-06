"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/lib/auth/require-user"
import { MANUAL_VIEWS } from "@/lib/clarity/constants"
import { extrairProjectId, MENSAGEM_PROJECT_ID } from "@/lib/clarity/project-id"
import { syncClarity } from "@/lib/clarity/sync"
import type { ConnectionTestResult } from "@/lib/connections/test-connection"
import { deleteSecret, storeSecret } from "@/lib/crypto/vault"
import {
  generateWebhookToken,
  hashWebhookToken,
} from "@/lib/crypto/webhook-token"
import { invalidateClarityConfig } from "@/lib/settings/clarity-config"
import { createServiceClient } from "@/lib/supabase/service"
// ATENÇÃO: este arquivo é "use server" — só pode EXPORTAR funções assíncronas.
// Tipo e constante de estado vivem em lib/settings/action-state.ts. Ver
// scripts/check-server-actions.mjs.
import type { ActionState } from "@/lib/settings/action-state"

/**
 * Tudo que configura o Clarity mora AQUI, na tela Mapa de Calor — e só aqui.
 *
 * A primeira versão pôs a conexão em Integrações e deixou nesta tela só um
 * botão que levava para lá. Quem clicava caía numa tela sem nenhum sinal do
 * Clarity e não sabia o que fazer. A tela do Clarity é dona do Clarity.
 */

/** O token da Data Export API é um JWT: três partes base64url. */
const CLARITY_TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const MAX_CLARITY_TOKEN_LENGTH = 4000

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

type ClarityRow = {
  is_active: boolean
  project_id: string
  api_token_vault_id: string | null
}

async function readClarityRow(): Promise<ClarityRow | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("clarity_accounts")
    .select("is_active, project_id, api_token_vault_id")
    .eq("id", true)
    .maybeSingle()

  return (data as ClarityRow | null) ?? null
}

function revalidateClarity() {
  invalidateClarityConfig()
  revalidatePath("/mapa-de-calor")
}

/**
 * Passo 2 do assistente (e "Configurar" depois): o Project ID.
 *
 * Aceita o ID, a URL do projeto ou o código de rastreamento inteiro — quem
 * abre o Clarity tem esses dois à mão, não um campo chamado "Project ID".
 */
export async function saveClarityProjectId(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireUser()

    const projectId = extrairProjectId(String(formData.get("project_id") ?? ""))
    if (!projectId) return fail(MENSAGEM_PROJECT_ID)

    const existing = await readClarityRow()
    const supabase = createServiceClient()
    const { error } = await supabase.from("clarity_accounts").upsert(
      {
        id: true,
        project_id: projectId,
        api_token_vault_id: existing?.api_token_vault_id ?? null,
        // Conectar já liga; trocar o ID de um Clarity que o operador desligou
        // NÃO o religa — isso mudaria um estado que ele escolheu, calado.
        is_active: existing ? existing.is_active : true,
      },
      { onConflict: "id" }
    )
    if (error) return fail(`Não foi possível salvar: ${error.message}`)

    revalidateClarity()
    return succeed(
      existing
        ? "Project ID atualizado. O script novo vale nos sites em até 1 minuto."
        : "Clarity conectado. O script começa a gravar nos seus sites em até 1 minuto."
    )
  } catch (error) {
    return fail(toMessage(error, "Falha ao salvar o Clarity."))
  }
}

/**
 * Passo 3: o token da Data Export API. Salva E sincroniza na hora.
 *
 * Sincronizar já aqui faz duas coisas: a tela nasce preenchida (em vez de um
 * painel vazio até a madrugada) e o token é validado contra o Clarity no ato.
 * Se o Clarity recusar, o token novo é desfeito e o anterior (se havia) volta
 * — guardar um token ruim só adiaria o erro para a sincronização das 03:00,
 * onde ninguém está olhando.
 *
 * O token novo vai para um segredo NOVO no Vault e só substitui o antigo
 * depois de aceito. Sobrescrever no lugar perderia o token bom que estava lá.
 */
export async function saveClarityToken(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireUser()

    const apiToken = String(formData.get("api_token") ?? "").trim()
    if (!apiToken) return fail("Cole o token gerado no Clarity.")
    if (apiToken.length > MAX_CLARITY_TOKEN_LENGTH) {
      return fail("Token longo demais — confira se colou o valor certo.")
    }
    if (!CLARITY_TOKEN_PATTERN.test(apiToken)) {
      return fail(
        "Isso não parece o token do Clarity. Ele é um texto longo que começa com “eyJ” e aparece uma vez só, ao gerar em Settings → Data Export."
      )
    }

    const existing = await readClarityRow()
    if (!existing) return fail("Cole o Project ID antes do token.")

    const supabase = createServiceClient()
    const anterior = existing.api_token_vault_id
    const novo = await storeSecret(apiToken, "clarity:api_token")

    const { error } = await supabase
      .from("clarity_accounts")
      .update({ api_token_vault_id: novo })
      .eq("id", true)
    if (error) {
      await deleteSecret(novo).catch(() => {})
      return fail(`Não foi possível salvar o token: ${error.message}`)
    }

    const sync = await syncClarity({ origin: "manual", inicial: true })

    if (sync.motivo === "token") {
      await supabase
        .from("clarity_accounts")
        .update({
          api_token_vault_id: anterior,
          last_sync_status: null,
          last_sync_error: null,
        })
        .eq("id", true)
      await deleteSecret(novo).catch(() => {})
      revalidateClarity()
      return fail(
        "O Clarity recusou este token. Confira se ele é do mesmo projeto e se foi gerado por um admin, em Settings → Data Export."
      )
    }

    // Aceito (ou falha que não é do token): o antigo sai do Vault.
    if (anterior) await deleteSecret(anterior).catch(() => {})

    revalidateClarity()
    if (sync.status === "ok" || sync.status === "parcial") {
      return succeed("Token aceito. Seus dados do Clarity já estão aqui.")
    }
    return succeed(
      `Token salvo, mas a primeira busca não trouxe dados: ${sync.message} A sincronização tenta de novo todo dia às 03:00.`
    )
  } catch (error) {
    return fail(toMessage(error, "Falha ao salvar o token."))
  }
}

export async function toggleClarityActive(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireUser()

    const nextActive = String(formData.get("next_active") ?? "") === "true"
    const supabase = createServiceClient()
    const { error } = await supabase
      .from("clarity_accounts")
      .update({ is_active: nextActive })
      .eq("id", true)

    if (error) return fail(`Não foi possível atualizar: ${error.message}`)

    revalidateClarity()
    return succeed(
      nextActive
        ? "Clarity ligado: o script volta a carregar nos sites."
        : "Clarity pausado: o script deixa de carregar nos sites em até 1 minuto, e a sincronização para."
    )
  } catch (error) {
    return fail(toMessage(error, "Falha ao atualizar o Clarity."))
  }
}

/**
 * Desconecta. Linha primeiro, segredo depois (mesma ordem do Stripe). Os
 * snapshots ficam: são histórico que a API não devolve mais (ela só olha 3
 * dias para trás), e quem desconecta não está pedindo para perdê-lo.
 */
export async function removeClarityIntegration(): Promise<ActionState> {
  try {
    await requireUser()

    const existing = await readClarityRow()
    if (!existing) return fail("Não há Clarity conectado.")

    const supabase = createServiceClient()
    const { error } = await supabase.from("clarity_accounts").delete().eq("id", true)
    if (error) return fail(`Não foi possível desconectar: ${error.message}`)

    if (existing.api_token_vault_id) {
      await deleteSecret(existing.api_token_vault_id).catch(() => {})
    }

    revalidateClarity()
    return succeed("Clarity desconectado. O histórico já sincronizado continua guardado.")
  } catch (error) {
    return fail(toMessage(error, "Falha ao desconectar o Clarity."))
  }
}

/**
 * Teste que NÃO desperdiça cota: é uma chamada real (visão geral das últimas
 * 24 h) e o resultado é gravado como snapshot.
 */
export async function testClarityConnection(): Promise<ConnectionTestResult> {
  try {
    await requireUser()

    const result = await syncClarity({ origin: "manual", views: ["none"] })
    revalidatePath("/mapa-de-calor")

    if (result.status === "ok") {
      return {
        status: "ok",
        message: "Token aceito pelo Clarity. Os KPIs das últimas 24 h foram atualizados.",
        detail: "Cada teste usa 1 das 10 consultas diárias que o Clarity permite.",
      }
    }
    return { status: "erro", message: result.message }
  } catch (error) {
    return { status: "erro", message: toMessage(error, "Falha ao testar o Clarity.") }
  }
}

/** "Atualizar agora". */
export async function refreshClarityNow(): Promise<ActionState> {
  try {
    await requireUser()

    const result = await syncClarity({ origin: "manual", views: MANUAL_VIEWS })
    revalidatePath("/mapa-de-calor")
    return result.status === "ok" || result.status === "parcial"
      ? succeed(result.message)
      : fail(result.message)
  } catch (error) {
    return fail(toMessage(error, "Falha ao atualizar o Clarity."))
  }
}

/**
 * Gera (ou gira) o token do MCP deste deploy. Mostrado uma vez; o banco guarda
 * só o SHA-256, como o token de webhook. Gerar de novo invalida o anterior na
 * hora — é o jeito de cortar o acesso de um cliente MCP vazado.
 */
export async function generateClarityMcpToken(): Promise<ActionState> {
  try {
    await requireUser()

    const existing = await readClarityRow()
    if (!existing) return fail("Conecte o Clarity antes de gerar o token do MCP.")

    const token = generateWebhookToken()
    const supabase = createServiceClient()
    const { error } = await supabase
      .from("clarity_accounts")
      .update({ mcp_token_hash: hashWebhookToken(token) })
      .eq("id", true)

    if (error) return fail(`Não foi possível gerar o token: ${error.message}`)

    revalidatePath("/mapa-de-calor")
    return { ok: true, message: "Token do MCP gerado.", revealedToken: token }
  } catch (error) {
    return fail(toMessage(error, "Falha ao gerar o token do MCP."))
  }
}
