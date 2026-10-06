import "server-only"

import { revealSecret } from "@/lib/crypto/vault"
import { createServiceClient } from "@/lib/supabase/service"
import { fetchLiveInsights } from "./client"
import {
  CLARITY_DAILY_LIMIT,
  CLARITY_VIEWS,
  CRON_VIEWS,
  type ClarityViewKey,
} from "./constants"

/**
 * Sincronização com o Clarity: o ÚNICO lugar que gasta a cota da Data Export
 * API. A tela e o MCP leem `clarity_snapshots`; nenhum dos dois chama o
 * Clarity. Com 10 chamadas por dia por projeto, deixar cada abertura de tela
 * (ou cada pergunta ao Claude) bater na API esgotaria a cota antes do almoço.
 *
 * Cada chamada é reservada ANTES de sair (`clarity_reserve_call`, um UPDATE
 * atômico): o cron e um "Atualizar agora" simultâneos não conseguem passar do
 * teto juntos.
 *
 * O manual não pode comer a cota do cron. Enquanto o cron do dia (UTC) não
 * rodou, o manual só usa o que sobra depois de reservar as chamadas dele. A
 * exceção é a primeira sincronização da vida do deploy: sem nenhum dado, a
 * tela ficaria vazia até a madrugada seguinte, e isso é pior do que o cron do
 * dia rodar incompleto uma vez.
 */

export type SyncOrigin = "cron" | "manual"

export type SyncResult = {
  status: "ok" | "parcial" | "erro" | "sem_cota"
  /** Visões gravadas nesta rodada. */
  gravadas: ClarityViewKey[]
  message: string
  /**
   * Por que parou, quando parou por causa do Clarity. `token` é o que importa
   * para quem acabou de colar um: o Clarity recusou, e o token não deve ficar
   * salvo para falhar de madrugada.
   */
  motivo?: "token" | "cota" | "rede"
}

type AccountRow = {
  is_active: boolean
  api_token_vault_id: string | null
  calls_day: string | null
  calls_count: number
}

function hojeUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function syncClarity(params: {
  origin: SyncOrigin
  views?: ClarityViewKey[]
  /**
   * Sincronização logo depois de colar o token: todas as visões, com a cota
   * que sobrar, sem reservar a do cron. É o que faz a tela nascer preenchida
   * em vez de mostrar um painel vazio até a madrugada.
   */
  inicial?: boolean
}): Promise<SyncResult> {
  const supabase = createServiceClient()

  const { data: account, error: accountError } = await supabase
    .from("clarity_accounts")
    .select("is_active, api_token_vault_id, calls_day, calls_count")
    .eq("id", true)
    .maybeSingle<AccountRow>()

  if (accountError) {
    return { status: "erro", gravadas: [], message: "Não foi possível ler a integração do Clarity." }
  }
  if (!account?.api_token_vault_id) {
    return { status: "erro", gravadas: [], message: "Salve o token da Data Export API antes de sincronizar." }
  }
  if (params.origin === "cron" && !account.is_active) {
    return { status: "erro", gravadas: [], message: "Integração do Clarity desativada." }
  }

  let views = params.views ?? CRON_VIEWS

  if (params.origin === "manual") {
    const usadasHoje = account.calls_day === hojeUtc() ? account.calls_count : 0

    const [{ count: totalSnapshots }, { count: cronHoje }] = await Promise.all([
      supabase.from("clarity_snapshots").select("id", { count: "exact", head: true }),
      supabase
        .from("clarity_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("origin", "cron")
        .gte("captured_at", `${hojeUtc()}T00:00:00Z`),
    ])

    const primeiraVez = (totalSnapshots ?? 0) === 0
    // Primeira sincronização: tudo, para a tela nascer completa.
    if ((primeiraVez || params.inicial) && !params.views) views = CRON_VIEWS

    const reservaDoCron =
      primeiraVez || params.inicial || (cronHoje ?? 0) > 0 ? 0 : CRON_VIEWS.length
    const disponivel = CLARITY_DAILY_LIMIT - reservaDoCron - usadasHoje

    if (disponivel < 1) {
      return {
        status: "sem_cota",
        gravadas: [],
        motivo: "cota",
        message:
          reservaDoCron > 0
            ? "As chamadas que sobram hoje estão reservadas para a sincronização da madrugada."
            : "As chamadas do Clarity de hoje acabaram. A próxima sincronização é a da madrugada.",
      }
    }
    views = views.slice(0, disponivel)
  }

  let token: string
  try {
    token = await revealSecret(account.api_token_vault_id)
  } catch {
    return { status: "erro", gravadas: [], message: "Não foi possível ler o token no Vault." }
  }

  const gravadas: ClarityViewKey[] = []
  const erros: string[] = []
  let semCota = false
  let motivo: SyncResult["motivo"]

  for (const key of views) {
    const view = CLARITY_VIEWS.find((v) => v.key === key)
    if (!view) continue

    const { data: reservada } = await supabase.rpc("clarity_reserve_call", {
      p_limit: CLARITY_DAILY_LIMIT,
    })
    if (typeof reservada !== "number") {
      semCota = true
      motivo = "cota"
      break
    }

    const result = await fetchLiveInsights({
      token,
      numOfDays: 1,
      dimension: view.dimension,
    })

    if (!result.ok) {
      erros.push(result.message)
      // Token recusado ou cota da API esgotada: as próximas falhariam igual e
      // só queimariam reserva.
      if (result.kind === "cota") semCota = true
      motivo = result.kind === "token" ? "token" : result.kind === "cota" ? "cota" : "rede"
      if (result.kind === "token" || result.kind === "cota") break
      continue
    }

    const { error } = await supabase.from("clarity_snapshots").insert({
      num_days: 1,
      dimension_key: key,
      origin: params.origin,
      payload: result.payload,
    })
    if (error) {
      erros.push(`Falha ao gravar a visão ${view.label}.`)
      continue
    }
    gravadas.push(key)
  }

  const status: SyncResult["status"] =
    gravadas.length === views.length
      ? "ok"
      : gravadas.length > 0
        ? "parcial"
        : semCota
          ? "sem_cota"
          : "erro"

  const message =
    status === "ok"
      ? `Clarity sincronizado (${gravadas.length} ${gravadas.length === 1 ? "visão" : "visões"}).`
      : status === "sem_cota"
        ? erros[0] ?? "As chamadas do Clarity de hoje acabaram."
        : erros[0] ?? "Sincronização incompleta."

  await supabase
    .from("clarity_accounts")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
      last_sync_error: status === "ok" ? null : message,
    })
    .eq("id", true)

  return { status, gravadas, message, motivo }
}
