import "server-only"

import { diaLocal } from "@/lib/dashboard/timezone"
import { createServiceClient } from "@/lib/supabase/service"
import {
  CLARITY_DAILY_LIMIT,
  CLARITY_VIEWS,
  SINAIS_ATRITO,
  type ClarityViewKey,
  type SinalAtrito,
} from "./constants"
import {
  agregarLinhas,
  normalizarSnapshot,
  pontuacaoDeAtrito,
  type LinhaClarity,
} from "./normalize"

/**
 * Leitura do que a sincronização guardou. É a ÚNICA camada que a tela "Mapa de
 * Calor" e o /api/mcp usam, e é isso que garante que os dois mostrem os
 * mesmos números. Nada aqui fala com o Clarity — ver `./sync`.
 *
 * `service_role`, e não o cliente sob RLS das outras telas de dado: as duas
 * tabelas do Clarity seguem o padrão das tabelas de credencial (nenhuma policy
 * de SELECT), porque `clarity_accounts` mora junto e a separação não pagaria
 * uma migration de policies.
 */

// ---------------------------------------------------------------------------
// Conexão
// ---------------------------------------------------------------------------

export type ClarityAccountRow = {
  projectId: string
  isActive: boolean
  /** Só informa que existe. O token nunca sai do Vault para a UI. */
  hasApiToken: boolean
  hasMcpToken: boolean
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastSyncError: string | null
  /** Chamadas à Data Export API já feitas hoje (dia em UTC). */
  chamadasHoje: number
  limiteDiario: number
}

export async function getClarityAccount(): Promise<ClarityAccountRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("clarity_accounts")
    .select("*")
    .eq("id", true)
    .maybeSingle()

  if (error) {
    throw new Error(`Falha ao ler a integração do Clarity: ${error.message}`)
  }
  if (!data) return null

  const hoje = new Date().toISOString().slice(0, 10)

  return {
    projectId: String(data.project_id),
    isActive: Boolean(data.is_active),
    hasApiToken: Boolean(data.api_token_vault_id),
    hasMcpToken: Boolean(data.mcp_token_hash),
    lastSyncAt: data.last_sync_at ?? null,
    lastSyncStatus: data.last_sync_status ?? null,
    lastSyncError: data.last_sync_error ?? null,
    chamadasHoje: data.calls_day === hoje ? Number(data.calls_count ?? 0) : 0,
    limiteDiario: CLARITY_DAILY_LIMIT,
  }
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

export type PontoTendencia = {
  /** Dia de calendário no fuso do painel ("2026-10-04"). */
  dia: string
  sessoes: number | null
  usuarios: number | null
  paginasPorSessao: number | null
  scroll: number | null
  tempoAtivo: number | null
  rage: number | null
  dead: number | null
  quickback: number | null
}

export type PaginaComAtrito = LinhaClarity & { pontuacao: number }

/** Uma página no ranking de um sinal de atrito. */
export type PaginaTopSinal = {
  url: string
  /** % das sessões DA PÁGINA com o sinal. */
  pct: number
  sessoes: number
  /** Estimativa de sessões afetadas (sessões × %): é o que ordena o ranking. */
  afetadas: number
}

export type ClarityPanorama = {
  error: string | null
  /** Quantos dias o período pediu. */
  dias: number
  /** Quantas janelas de 24 h existem de fato para esse período. */
  janelas: number
  ultimaCaptura: string | null
  geral: LinhaClarity | null
  tendencia: PontoTendencia[]
  /** `url` = as páginas mais visitadas; as outras, a dimensão do nome. */
  quebras: Record<"url" | "device" | "channel" | "country", LinhaClarity[]>
  /** Páginas ordenadas pela pontuação de atrito — só o MCP usa. */
  paginas: PaginaComAtrito[]
  /** As páginas que mais pesam em cada sinal (top 5, só as que têm o sinal). */
  topPorSinal: Record<SinalAtrito, PaginaTopSinal[]>
  /** Alguma visão voltou com 1.000 linhas: o Clarity cortou o resto. */
  truncado: boolean
  /** Carimbo do servidor, para a tela nunca chamar Date.now() no render. */
  agoraMs: number
}

type SnapshotRow = {
  dimension_key: ClarityViewKey
  captured_at: string
  origin: "cron" | "manual"
  payload: unknown
}

const MIN_SESSOES_PAGINA = 5
const MAX_PAGINAS = 25
const MAX_QUEBRA = 15
const MAX_TOP_SINAL = 5

function topVazio(): Record<SinalAtrito, PaginaTopSinal[]> {
  return Object.fromEntries(SINAIS_ATRITO.map((s) => [s.key, []])) as unknown as Record<
    SinalAtrito,
    PaginaTopSinal[]
  >
}

/**
 * Ranking por sinal, ordenado pelo NÚMERO estimado de sessões afetadas, não
 * pelo percentual: uma página com 6 sessões e 50% de rage tem menos peso na
 * métrica geral do que uma com 2.000 sessões e 4%. Ordenar pelo % encheria o
 * topo de páginas quase sem tráfego. Sai de TODAS as linhas da visão `url`.
 */
function topPorSinal(linhas: LinhaClarity[]): Record<SinalAtrito, PaginaTopSinal[]> {
  const top = topVazio()
  const elegiveis = linhas.filter((l) => l.chave && (l.sessoes ?? 0) >= MIN_SESSOES_PAGINA)
  for (const sinal of SINAIS_ATRITO) {
    top[sinal.key] = elegiveis
      .map((l) => {
        const pct = l.atrito[sinal.key] ?? 0
        const sessoes = l.sessoes ?? 0
        return { url: l.chave, pct, sessoes, afetadas: (sessoes * pct) / 100 }
      })
      .filter((p) => p.pct > 0)
      .sort((a, b) => b.afetadas - a.afetadas || b.pct - a.pct)
      .slice(0, MAX_TOP_SINAL)
      .map((p) => ({ ...p, afetadas: Math.round(p.afetadas) }))
  }
  return top
}

/** "hoje" = a última janela; os outros contam dias. "tudo" vira 30. */
export function diasDoPeriodo(periodo: string): number {
  if (periodo === "hoje") return 1
  if (periodo === "7d") return 7
  return 30
}

/**
 * A janela de 24 h que termina às 06:00 UTC (03:00 em Brasília) cobre quase
 * inteira a véspera. Recuar 12 h antes de tirar o dia põe o ponto no dia que
 * ele de fato descreve.
 */
function diaDaJanela(capturedAt: string): string {
  return diaLocal(new Date(new Date(capturedAt).getTime() - 12 * 3_600_000))
}

/**
 * Escolhe as janelas de uma visão para o período.
 *
 * - 1 dia: a mais recente, de qualquer origem.
 * - N dias: só as do cron, uma por dia (UTC). As manuais se sobrepõem às do
 *   cron — somá-las contaria as mesmas sessões duas vezes. Se ainda não há
 *   nenhuma do cron (deploy recém-conectado), cai para a mais recente, e a
 *   tela mostra "1 de N dias".
 */
function escolherJanelas(rows: SnapshotRow[], dias: number): SnapshotRow[] {
  if (rows.length === 0) return []
  if (dias === 1) return [rows[0]]

  const porDia = new Map<string, SnapshotRow>()
  for (const row of rows) {
    if (row.origin !== "cron") continue
    const dia = row.captured_at.slice(0, 10)
    if (!porDia.has(dia)) porDia.set(dia, row)
  }
  const escolhidas = [...porDia.values()].slice(0, dias)
  return escolhidas.length > 0 ? escolhidas : [rows[0]]
}

function agregarVisao(rows: SnapshotRow[], key: ClarityViewKey) {
  const dimension = CLARITY_VIEWS.find((v) => v.key === key)?.dimension ?? null
  const porChave = new Map<string, LinhaClarity[]>()
  let truncado = false

  for (const row of rows) {
    const snap = normalizarSnapshot(row.payload, dimension)
    if (snap.truncado) truncado = true
    for (const linha of snap.linhas) {
      const lista = porChave.get(linha.chave) ?? []
      lista.push(linha)
      porChave.set(linha.chave, lista)
    }
  }

  const linhas = [...porChave.entries()].map(([chave, lista]) => agregarLinhas(chave, lista))

  return { linhas, truncado }
}

function porSessoes(a: LinhaClarity, b: LinhaClarity) {
  return (b.sessoes ?? 0) - (a.sessoes ?? 0)
}

function vazio(dias: number, error: string | null): ClarityPanorama {
  return {
    error,
    dias,
    janelas: 0,
    ultimaCaptura: null,
    geral: null,
    tendencia: [],
    quebras: { url: [], device: [], channel: [], country: [] },
    paginas: [],
    topPorSinal: topVazio(),
    truncado: false,
    agoraMs: Date.now(),
  }
}

export async function getClarityPanorama(periodo: string): Promise<ClarityPanorama> {
  const dias = diasDoPeriodo(periodo)

  // Folga de 1 dia: o cron pode ter rodado minutos depois do horário de ontem.
  const desde = new Date(Date.now() - (dias + 1) * 86_400_000).toISOString()

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("clarity_snapshots")
    .select("dimension_key, captured_at, origin, payload")
    .gte("captured_at", desde)
    .order("captured_at", { ascending: false })
    .limit(500)

  if (error) return vazio(dias, `Falha ao ler os dados do Clarity: ${error.message}`)

  const rows = (data ?? []) as SnapshotRow[]
  if (rows.length === 0) return vazio(dias, null)

  const porVisao = (key: ClarityViewKey) =>
    escolherJanelas(rows.filter((r) => r.dimension_key === key), dias)

  const geralRows = porVisao("none")
  const geral = agregarVisao(geralRows, "none")
  const url = agregarVisao(porVisao("url"), "url")
  const device = agregarVisao(porVisao("device"), "device")
  const channel = agregarVisao(porVisao("channel"), "channel")
  const country = agregarVisao(porVisao("country"), "country")

  const tendencia: PontoTendencia[] = geralRows
    .map((row) => {
      const linha = normalizarSnapshot(row.payload, null).linhas[0] ?? null
      return {
        dia: diaDaJanela(row.captured_at),
        sessoes: linha?.sessoes ?? null,
        usuarios: linha?.usuarios ?? null,
        paginasPorSessao: linha?.paginasPorSessao ?? null,
        scroll: linha?.scroll ?? null,
        tempoAtivo: linha?.tempoAtivo ?? null,
        rage: linha?.atrito.rage ?? null,
        dead: linha?.atrito.dead ?? null,
        quickback: linha?.atrito.quickback ?? null,
      }
    })
    .reverse()

  const paginas = url.linhas
    .filter((l) => l.chave && (l.sessoes ?? 0) >= MIN_SESSOES_PAGINA)
    .map((l) => ({ ...l, pontuacao: pontuacaoDeAtrito(l) }))
    .sort((a, b) => b.pontuacao - a.pontuacao || porSessoes(a, b))
    .slice(0, MAX_PAGINAS)

  return {
    error: null,
    dias,
    janelas: geralRows.length,
    ultimaCaptura: rows[0]?.captured_at ?? null,
    geral: geral.linhas[0] ?? null,
    tendencia,
    quebras: {
      // Linha sem URL é o "(não informado)" do Clarity: numa lista de páginas
      // não leva a mapa nenhum.
      url: url.linhas.filter((l) => l.chave).sort(porSessoes).slice(0, MAX_QUEBRA),
      device: device.linhas.sort(porSessoes).slice(0, MAX_QUEBRA),
      channel: channel.linhas.sort(porSessoes).slice(0, MAX_QUEBRA),
      country: country.linhas.sort(porSessoes).slice(0, MAX_QUEBRA),
    },
    paginas,
    topPorSinal: topPorSinal(url.linhas),
    truncado: [geral, url, device, channel, country].some((v) => v.truncado),
    agoraMs: Date.now(),
  }
}
