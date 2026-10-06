import "server-only"

import { CLARITY_DAILY_LIMIT, SINAIS_ATRITO } from "./constants"
import { clarityDashboardUrl, clarityHeatmapUrl, claritySessionRange } from "./deeplinks"
import type { LinhaClarity } from "./normalize"
import { getClarityAccount, getClarityPanorama } from "./queries"

/**
 * As ferramentas do MCP do deploy. Todas leem o que a sincronização já gravou
 * (via `./queries`, a mesma camada da tela) — nenhuma fala com o Clarity, então
 * perguntar ao Claude não gasta a cota de 10 consultas por dia.
 *
 * Só Clarity, de propósito: o token do MCP não dá leitura de vendas nem de
 * visitantes. Ferramenta nova entra acrescentando uma entrada em `TOOLS`.
 */

type JsonSchema = Record<string, unknown>

type Tool = {
  name: string
  description: string
  inputSchema: JsonSchema
  run: (args: Record<string, unknown>) => Promise<unknown>
}

const PERIODO_SCHEMA = {
  type: "string",
  enum: ["hoje", "7d", "30d"],
  description: "hoje = últimas 24 h sincronizadas; 7d e 30d somam as janelas diárias.",
  default: "7d",
}

function periodoDe(args: Record<string, unknown>): string {
  const p = args.periodo
  return p === "hoje" || p === "7d" || p === "30d" ? p : "7d"
}

/** Números crus com a unidade no nome — o modelo formata melhor do que nós. */
function linhaJson(l: LinhaClarity) {
  return {
    sessoes: l.sessoes,
    sessoes_de_bot: l.bots,
    usuarios: l.usuarios,
    paginas_por_sessao: l.paginasPorSessao,
    scroll_medio_pct: l.scroll,
    tempo_total_seg: l.tempoTotal,
    tempo_ativo_seg: l.tempoAtivo,
    atrito_pct_das_sessoes: Object.fromEntries(
      SINAIS_ATRITO.map((s) => [s.key, l.atrito[s.key]])
    ),
  }
}

async function contaOuErro() {
  const account = await getClarityAccount()
  if (!account) throw new Error("O Clarity não está conectado neste painel.")
  return account
}

const NOTA_PERIODO =
  "Cada janela é de 24 h (UTC), sincronizada uma vez por dia. 'usuarios' em períodos de vários dias é soma diária: quem volta conta de novo. null = o Clarity não informou (não é zero)."

const TOOLS: Tool[] = [
  {
    name: "clarity_overview",
    description:
      "KPIs gerais de comportamento do site no Microsoft Clarity: sessões, usuários, scroll médio, tempo ativo e o percentual de sessões com cada sinal de atrito (rage click, dead click, quick back, scroll excessivo, erro de script, clique com erro).",
    inputSchema: {
      type: "object",
      properties: { periodo: PERIODO_SCHEMA },
      additionalProperties: false,
    },
    run: async (args) => {
      await contaOuErro()
      const d = await getClarityPanorama(periodoDe(args))
      if (d.error) throw new Error(d.error)
      return {
        periodo_dias: d.dias,
        janelas_coletadas: d.janelas,
        ultima_sincronizacao: d.ultimaCaptura,
        geral: d.geral ? linhaJson(d.geral) : null,
        nota: NOTA_PERIODO,
      }
    },
  },
  {
    name: "clarity_breakdown",
    description:
      "Os mesmos KPIs quebrados por dispositivo, canal de aquisição ou país (até 15 linhas, ordenadas por sessões).",
    inputSchema: {
      type: "object",
      properties: {
        dimensao: { type: "string", enum: ["device", "channel", "country"] },
        periodo: PERIODO_SCHEMA,
      },
      required: ["dimensao"],
      additionalProperties: false,
    },
    run: async (args) => {
      await contaOuErro()
      const dim = args.dimensao
      if (dim !== "device" && dim !== "channel" && dim !== "country") {
        throw new Error("dimensao deve ser device, channel ou country.")
      }
      const d = await getClarityPanorama(periodoDe(args))
      if (d.error) throw new Error(d.error)
      return {
        periodo_dias: d.dias,
        janelas_coletadas: d.janelas,
        linhas: d.quebras[dim].map((l) => ({ valor: l.chave, ...linhaJson(l) })),
        nota: NOTA_PERIODO,
      }
    },
  },
  {
    name: "clarity_friction_pages",
    description:
      "Páginas ordenadas por atrito (rage, dead e erro pesam mais), com os KPIs de cada uma e o link do mapa de calor daquela página no Clarity. É o ponto de partida para 'onde o site está atrapalhando a conversão'.",
    inputSchema: {
      type: "object",
      properties: {
        periodo: PERIODO_SCHEMA,
        limite: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
      additionalProperties: false,
    },
    run: async (args) => {
      const account = await contaOuErro()
      const d = await getClarityPanorama(periodoDe(args))
      if (d.error) throw new Error(d.error)
      const limite =
        typeof args.limite === "number" ? Math.min(25, Math.max(1, Math.floor(args.limite))) : 10
      const range = claritySessionRange(d.dias)
      return {
        periodo_dias: d.dias,
        janelas_coletadas: d.janelas,
        truncado_pelo_clarity: d.truncado,
        paginas: d.paginas.slice(0, limite).map((p) => ({
          url: p.chave,
          pontuacao_de_atrito: Number(p.pontuacao.toFixed(2)),
          ...linhaJson(p),
          mapa_de_calor: clarityHeatmapUrl(account.projectId, p.chave, range),
        })),
        nota: NOTA_PERIODO,
      }
    },
  },
  {
    name: "clarity_trend",
    description: "Série diária de sessões e das taxas de rage click, dead click e quick back.",
    inputSchema: {
      type: "object",
      properties: { periodo: { ...PERIODO_SCHEMA, default: "30d" } },
      additionalProperties: false,
    },
    run: async (args) => {
      await contaOuErro()
      const d = await getClarityPanorama(args.periodo ? periodoDe(args) : "30d")
      if (d.error) throw new Error(d.error)
      return {
        dias: d.tendencia.map((t) => ({
          dia: t.dia,
          sessoes: t.sessoes,
          rage_pct: t.rage,
          dead_pct: t.dead,
          quickback_pct: t.quickback,
        })),
        nota: "O dia é o calendário em America/Sao_Paulo a que a janela de 24 h se refere.",
      }
    },
  },
  {
    name: "clarity_heatmap_link",
    description:
      "Link para o mapa de calor de uma página no Clarity (cliques, scroll, atenção). Mapas de calor e gravações só existem dentro do Clarity; este link abre direto na página pedida. Requer login no Clarity com acesso ao projeto.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL completa da página. Sem ela, abre a lista de páginas." },
        dias: { type: "integer", enum: [3, 7, 30], default: 30 },
      },
      additionalProperties: false,
    },
    run: async (args) => {
      const account = await contaOuErro()
      const url = typeof args.url === "string" && /^https?:\/\//.test(args.url) ? args.url : null
      const dias = typeof args.dias === "number" ? args.dias : 30
      return {
        mapa_de_calor: clarityHeatmapUrl(account.projectId, url, claritySessionRange(dias)),
        painel: clarityDashboardUrl(account.projectId),
      }
    },
  },
  {
    name: "clarity_status",
    description:
      "Estado da integração: projeto, última sincronização e quantas das consultas diárias ao Clarity já foram usadas.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      const a = await contaOuErro()
      return {
        project_id: a.projectId,
        ativo: a.isActive,
        tem_token_da_api: a.hasApiToken,
        ultima_sincronizacao: a.lastSyncAt,
        status_da_ultima: a.lastSyncStatus,
        erro_da_ultima: a.lastSyncError,
        consultas_hoje: a.chamadasHoje,
        limite_diario: CLARITY_DAILY_LIMIT,
      }
    },
  },
]

export function listTools() {
  return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
}

export async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) {
    return { content: [{ type: "text", text: `Ferramenta desconhecida: ${name}` }], isError: true }
  }
  try {
    const result = await tool.run(args)
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao executar a ferramenta."
    return { content: [{ type: "text", text: message }], isError: true }
  }
}

export const MCP_INSTRUCTIONS =
  "Dados de comportamento do Microsoft Clarity deste site (sessões, rolagem, tempo ativo e sinais de atrito por página, dispositivo, canal e país), sincronizados uma vez por dia. Mapas de calor e gravações não vêm por aqui: use clarity_heatmap_link para levar a pessoa à página certa no Clarity."
