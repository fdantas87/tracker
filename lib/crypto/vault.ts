import "server-only"

import { createServiceClient } from "@/lib/supabase/service"

/**
 * Porta de entrada única para os segredos cifrados no Supabase Vault.
 *
 * As 4 funções abaixo batem nas funções SECURITY DEFINER criadas na fase 2
 * (migration `..._vault_functions.sql`), cujo EXECUTE só foi concedido a
 * `service_role`. O schema `vault` não é exposto via PostgREST, então este é
 * o único caminho possível — e ele só existe no servidor.
 *
 * REGRA: o valor decifrado nunca sai daqui pra UI, pra log ou pra resposta de
 * Server Action. Ele é lido no instante do disparo pro Meta/GA4 e descartado.
 */

/** Grava um segredo novo no Vault e devolve o uuid pra guardar na tabela. */
export async function storeSecret(
  secret: string,
  name?: string
): Promise<string> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc("store_secret", {
    p_secret: secret,
    p_name: name ?? null,
  })

  if (error) {
    throw new Error(`Falha ao gravar segredo no Vault: ${error.message}`)
  }
  if (!data) {
    throw new Error("Vault não devolveu o id do segredo gravado.")
  }

  return data as string
}

/**
 * Lê um segredo decifrado. Só chame no momento exato de usar o valor
 * (disparo pro Meta/GA4, teste de conexão) — nunca para exibir na tela.
 */
export async function revealSecret(vaultId: string): Promise<string> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc("reveal_secret", {
    p_secret_id: vaultId,
  })

  if (error) {
    throw new Error(`Falha ao ler segredo do Vault: ${error.message}`)
  }
  if (!data) {
    throw new Error("Segredo não encontrado no Vault.")
  }

  return data as string
}

/** Troca o valor de um segredo existente, mantendo o mesmo uuid. */
export async function updateSecret(
  vaultId: string,
  newSecret: string
): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.rpc("update_secret", {
    p_secret_id: vaultId,
    p_new_secret: newSecret,
  })

  if (error) {
    throw new Error(`Falha ao atualizar segredo no Vault: ${error.message}`)
  }
}

/**
 * Remove um segredo. Apague a linha da tabela ANTES de chamar isto — não há
 * foreign key entre as duas, então a ordem é responsabilidade daqui.
 */
export async function deleteSecret(vaultId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.rpc("delete_secret", {
    p_secret_id: vaultId,
  })

  if (error) {
    throw new Error(`Falha ao remover segredo do Vault: ${error.message}`)
  }
}
