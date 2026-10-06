/**
 * Leitura da resposta da Data Export API do Clarity.
 *
 * O FORMATO SÓ ESTÁ PARCIALMENTE DOCUMENTADO, e isto foi escrito sabendo disso.
 * A doc mostra o envelope (uma lista de `{ metricName, information: [...] }`)
 * e os campos de UMA métrica, Traffic: `totalSessionCount`,
 * `totalBotSessionCount`, `distantUserCount`, `PagesPerSessionPercentage` — com
 * os contadores vindo como STRING ("9554"). Os campos das outras métricas não
 * estão na doc. Por isso cada leitor aceita vários nomes, ignora maiúsculas e
 * separadores, e devolve `null` (nunca 0) quando não acha nada: "sem dado" e
 * "zero" são coisas diferentes, e confundir os dois é o defeito que este painel
 * já evitou em Vendas.
 *
 * Mesma postura de `readPaymentMethod()` do PerfectPay. Quando a primeira
 * resposta real for conferida, os nomes podem ser apertados — o jsonb cru fica
 * guardado em `clarity_snapshots`, então nada se perde até lá.
 *
 * Funções puras, SEM `server-only`: não há segredo aqui, e isso permite testar
 * de mesa sem subir servidor.
 */

import type { SinalAtrito } from "./constants"

export type LinhaClarity = {
  /** Valor da dimensão (ex.: "Mobile", "/checkout"). `""` na visão geral. */
  chave: string
  sessoes: number | null
  bots: number | null
  usuarios: number | null
  paginasPorSessao: number | null
  /** Profundidade média de rolagem, em %. */
  scroll: number | null
  /** Tempo médio por sessão, em segundos. */
  tempoTotal: number | null
  tempoAtivo: number | null
  /** % das sessões com cada sinal. */
  atrito: Record<SinalAtrito, number | null>
}

export type PaginaPopular = { url: string; visitas: number }

export type SnapshotNormalizado = {
  linhas: LinhaClarity[]
  paginasPopulares: PaginaPopular[]
  /** Alguma métrica voltou com 1.000 linhas: a visão foi truncada pela API. */
  truncado: boolean
}

type Info = Record<string, unknown>

/** "Rage Click Count" / "RageClickCount" / "rage_click_count" -> "rageclickcount" */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Aceita número ou string numérica; qualquer outra coisa vira null. */
export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."))
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** O primeiro campo cujo nome normalizado bate com algum dos candidatos. */
function ler(info: Info, candidatos: string[]): number | null {
  const alvo = candidatos.map(norm)
  for (const [k, v] of Object.entries(info)) {
    if (alvo.includes(norm(k))) {
      const n = numero(v)
      if (n !== null) return n
    }
  }
  return null
}

/** Qual métrica é esta, a partir do `metricName` (tolerante a espaço e caixa). */
const METRICAS: Record<string, string[]> = {
  traffic: ["traffic"],
  engagement: ["engagementtime", "engagement"],
  scroll: ["scrolldepth"],
  popular: ["popularpages"],
  rage: ["rageclickcount", "rageclicks", "rageclick"],
  dead: ["deadclickcount", "deadclicks", "deadclick"],
  quickback: ["quickbackclick", "quickbackclicks", "quickbacks", "quickback"],
  excessiveScroll: ["excessivescroll", "excessivescrolling"],
  scriptError: ["scripterrorcount", "scripterrors", "scripterror", "jserrors"],
  errorClick: ["errorclickcount", "errorclicks", "errorclick"],
}

function tipoDaMetrica(metricName: unknown): string | null {
  if (typeof metricName !== "string") return null
  const n = norm(metricName)
  for (const [tipo, nomes] of Object.entries(METRICAS)) {
    if (nomes.includes(n)) return tipo
  }
  return null
}

/**
 * Valor da dimensão numa linha. Procura o nome pedido (e variações: a doc
 * escreve "Country/Region", a resposta pode trazer "Country"); se nada bater,
 * fica com o único campo de texto não numérico da linha.
 */
function chaveDaLinha(info: Info, dimensao: string | null): string {
  if (!dimensao) return ""

  const candidatos = [dimensao, ...dimensao.split("/")].map(norm)
  for (const [k, v] of Object.entries(info)) {
    if (candidatos.includes(norm(k)) && typeof v === "string") return v
  }

  const textos = Object.values(info).filter(
    (v): v is string => typeof v === "string" && numero(v) === null
  )
  return textos.length === 1 ? textos[0] : "(desconhecido)"
}

function linhaVazia(chave: string): LinhaClarity {
  return {
    chave,
    sessoes: null,
    bots: null,
    usuarios: null,
    paginasPorSessao: null,
    scroll: null,
    tempoTotal: null,
    tempoAtivo: null,
    atrito: {
      rage: null,
      dead: null,
      quickback: null,
      excessiveScroll: null,
      scriptError: null,
      errorClick: null,
    },
  }
}

/**
 * % de sessões com o sinal. Preferência: o percentual pronto; senão, a razão
 * entre sessões afetadas e o total da própria linha.
 */
function percentualDoSinal(info: Info): number | null {
  const pct = ler(info, [
    "sessionsWithMetricPercentage",
    "sessionsWithMetricPercent",
    "percentage",
    "percent",
  ])
  if (pct !== null) return pct

  const afetadas = ler(info, ["sessionsWithMetric", "subTotal", "affectedSessions"])
  const total = ler(info, ["sessionsCount", "totalSessionCount", "sessions"])
  if (afetadas !== null && total) return (afetadas / total) * 100
  return null
}

export function normalizarSnapshot(
  payload: unknown,
  dimensao: string | null
): SnapshotNormalizado {
  const porChave = new Map<string, LinhaClarity>()
  const paginasPopulares: PaginaPopular[] = []
  let truncado = false

  const linha = (chave: string) => {
    let l = porChave.get(chave)
    if (!l) {
      l = linhaVazia(chave)
      porChave.set(chave, l)
    }
    return l
  }

  const metricas = Array.isArray(payload) ? payload : []

  for (const metrica of metricas) {
    if (!metrica || typeof metrica !== "object") continue
    const { metricName, information } = metrica as {
      metricName?: unknown
      information?: unknown
    }
    if (!Array.isArray(information)) continue
    if (information.length >= 1000) truncado = true

    const tipo = tipoDaMetrica(metricName)
    if (!tipo) continue

    for (const bruto of information) {
      if (!bruto || typeof bruto !== "object") continue
      const info = bruto as Info

      if (tipo === "popular") {
        const url = Object.entries(info).find(
          ([k, v]) => ["url", "page", "pageurl"].includes(norm(k)) && typeof v === "string"
        )?.[1] as string | undefined
        const visitas = ler(info, ["visitsCount", "visits", "sessionsCount", "count"])
        if (url && visitas !== null) paginasPopulares.push({ url, visitas })
        continue
      }

      const l = linha(chaveDaLinha(info, dimensao))

      if (tipo === "traffic") {
        l.sessoes = ler(info, ["totalSessionCount", "sessionsCount", "sessions"])
        l.bots = ler(info, ["totalBotSessionCount", "botSessionCount", "botSessions"])
        l.usuarios = ler(info, ["distantUserCount", "distinctUserCount", "userCount", "users"])
        l.paginasPorSessao = ler(info, [
          "PagesPerSessionPercentage",
          "pagesPerSession",
          "pagesPerSessionCount",
        ])
      } else if (tipo === "engagement") {
        l.tempoTotal = ler(info, ["totalTime", "averageTotalTime", "totalTimeSeconds"])
        l.tempoAtivo = ler(info, ["activeTime", "averageActiveTime", "activeTimeSeconds"])
      } else if (tipo === "scroll") {
        l.scroll = ler(info, ["averageScrollDepth", "scrollDepth", "averageScroll"])
      } else {
        l.atrito[tipo as SinalAtrito] = percentualDoSinal(info)
      }
    }
  }

  paginasPopulares.sort((a, b) => b.visitas - a.visitas)

  return { linhas: [...porChave.values()], paginasPopulares, truncado }
}

// ---------------------------------------------------------------------------
// Agregação de várias janelas (7d, 30d)
// ---------------------------------------------------------------------------

/**
 * Soma várias linhas da mesma chave (uma por janela de 24 h).
 *
 * Contadores somam; médias e percentuais são ponderados por sessões — uma
 * janela com 10 sessões não pode pesar o mesmo que uma com 10.000. Usuários
 * SOMAM, e por isso contam a mesma pessoa uma vez por dia em que voltou: a API
 * não dá como deduplicar entre janelas, e a tela diz isso.
 */
export function agregarLinhas(chave: string, linhas: LinhaClarity[]): LinhaClarity {
  const out = linhaVazia(chave)

  const soma = (get: (l: LinhaClarity) => number | null) => {
    let total: number | null = null
    for (const l of linhas) {
      const v = get(l)
      if (v !== null) total = (total ?? 0) + v
    }
    return total
  }

  const media = (get: (l: LinhaClarity) => number | null) => {
    let peso = 0
    let acumulado = 0
    let algum = false
    for (const l of linhas) {
      const v = get(l)
      if (v === null) continue
      const p = l.sessoes ?? 0
      // Sem sessões conhecidas, cada janela pesa 1 — melhor que descartar.
      const w = p > 0 ? p : 1
      acumulado += v * w
      peso += w
      algum = true
    }
    return algum && peso > 0 ? acumulado / peso : null
  }

  out.sessoes = soma((l) => l.sessoes)
  out.bots = soma((l) => l.bots)
  out.usuarios = soma((l) => l.usuarios)
  out.paginasPorSessao = media((l) => l.paginasPorSessao)
  out.scroll = media((l) => l.scroll)
  out.tempoTotal = media((l) => l.tempoTotal)
  out.tempoAtivo = media((l) => l.tempoAtivo)
  for (const sinal of Object.keys(out.atrito) as SinalAtrito[]) {
    out.atrito[sinal] = media((l) => l.atrito[sinal])
  }

  return out
}

/**
 * Pontuação de atrito de uma página: soma dos percentuais dos sinais que
 * apontam defeito, com rage e dead pesando mais (são os que costumam ter
 * conserto direto no layout). Quick back e scroll excessivo entram com peso
 * menor porque também acontecem em página que funciona.
 */
export function pontuacaoDeAtrito(l: LinhaClarity): number {
  const a = l.atrito
  return (
    (a.rage ?? 0) * 3 +
    (a.dead ?? 0) * 2 +
    (a.errorClick ?? 0) * 2 +
    (a.scriptError ?? 0) +
    (a.quickback ?? 0) +
    (a.excessiveScroll ?? 0) * 0.5
  )
}
