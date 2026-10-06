/**
 * Constantes da integração com o Microsoft Clarity.
 *
 * SEM `server-only`: a tela (Client Components) importa os rótulos e as
 * visões daqui. Nada aqui é segredo.
 *
 * Os limites abaixo vêm da documentação da Data Export API
 * (learn.microsoft.com/clarity/setup-and-installation/clarity-data-export-api):
 * 10 chamadas por projeto por dia, janela de 1 a 3 dias, até 3 dimensões,
 * 1.000 linhas sem paginação, resposta em UTC.
 */

export const CLARITY_EXPORT_URL =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights"

export const CLARITY_REQUEST_TIMEOUT_MS = 15_000

/**
 * Teto de chamadas por dia que NÓS nos permitimos — um abaixo do da API. A
 * documentação não diz em que fuso a cota vira; a folga absorve a diferença
 * entre o nosso dia (UTC) e o deles.
 */
export const CLARITY_DAILY_LIMIT = 9

/** A API corta em 1.000 linhas. Uma visão que volta com isso foi truncada. */
export const CLARITY_MAX_ROWS = 1000

/**
 * As visões sincronizadas. Uma chamada por visão: pedir duas dimensões juntas
 * multiplicaria as linhas (e bateria no teto de 1.000) sem ganho para a tela,
 * que mostra uma quebra por vez.
 */
export const CLARITY_VIEWS = [
  { key: "none", dimension: null, label: "Geral" },
  { key: "url", dimension: "URL", label: "Página" },
  { key: "device", dimension: "Device", label: "Dispositivo" },
  { key: "channel", dimension: "Channel", label: "Canal" },
  { key: "country", dimension: "Country/Region", label: "País" },
] as const

export type ClarityViewKey = (typeof CLARITY_VIEWS)[number]["key"]

/** O cron diário roda todas. */
export const CRON_VIEWS: ClarityViewKey[] = CLARITY_VIEWS.map((v) => v.key)

/**
 * "Atualizar agora" roda só as duas que a tela mais usa. Com o cron gastando 5
 * e o teto em 9, sobram 4: dá para atualizar duas vezes no dia.
 */
export const MANUAL_VIEWS: ClarityViewKey[] = ["none", "url"]

export function isClarityViewKey(value: string): value is ClarityViewKey {
  return CLARITY_VIEWS.some((v) => v.key === value)
}

/**
 * Os sinais de atrito que o Clarity detecta. A ordem é a de exibição: os três
 * primeiros são os que mais apontam um defeito concreto na página.
 */
export const SINAIS_ATRITO = [
  {
    key: "rage",
    label: "Rage clicks",
    curto: "Rage",
    descricao: "Cliques repetidos e rápidos no mesmo ponto — frustração.",
    mapa: "Rage clicks",
  },
  {
    key: "dead",
    label: "Dead clicks",
    curto: "Dead",
    descricao: "Clique em algo que parece clicável e não responde.",
    mapa: "Dead clicks",
  },
  {
    key: "quickback",
    label: "Quick backs",
    curto: "Quick back",
    descricao: "Saiu da página e voltou em segundos — o destino não serviu.",
    mapa: "Last clicks",
  },
  {
    key: "excessiveScroll",
    label: "Scroll excessivo",
    curto: "Scroll exc.",
    descricao: "Rolou bem mais que a média — procurando algo que não achou.",
    mapa: "Scroll",
  },
  {
    key: "scriptError",
    label: "Erros de script",
    curto: "Erro JS",
    descricao: "Erro de JavaScript durante a sessão.",
    mapa: "Error clicks",
  },
  {
    key: "errorClick",
    label: "Cliques com erro",
    curto: "Clique c/ erro",
    descricao: "Clique seguido imediatamente de um erro de JavaScript.",
    mapa: "Error clicks",
  },
] as const

export type SinalAtrito = (typeof SINAIS_ATRITO)[number]["key"]

/** Link do painel do Clarity para a tela "abrir no Clarity". */
export const CLARITY_APP_URL = "https://clarity.microsoft.com"
