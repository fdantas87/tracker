/**
 * CORS dos endpoints públicos de captura.
 *
 * Allowlist FECHADA e comparada por igualdade exata. Nunca usar `*` e nunca
 * checar com `endsWith(".exemplo.com")`: um domínio como
 * `exemplo.com.site-do-atacante.com` passaria no endsWith e ganharia acesso.
 *
 * A lista é a SOMA de duas fontes: `TRACKING_ALLOWED_ORIGINS` (uma origem por
 * item, separadas por vírgula; NÃO é `NEXT_PUBLIC_`, publicá-la no bundle
 * entregaria de graça o mapa de domínios do cliente) e as origens salvas no
 * painel, em Configurações → Geral (lib/settings/origins-config.ts). A
 * variável só vale depois de um deploy novo; o painel vale em até 60s. A
 * variável fica como rede de segurança: se a leitura do banco falhar, o que ela
 * libera continua liberado.
 *
 * POR QUE NÃO FICA MAIS HARDCODED: o mesmo repositório é implantado uma vez por
 * cliente. Com a lista fixa no código, o site do cliente novo nunca entra nela
 * e o navegador bloqueia a captura INTEIRA — e em silêncio, porque o `post()`
 * do track.js engole a falha e o endpoint chega a responder 200; quem recusa é
 * o navegador, no preflight (o POST vai com `Content-Type: application/json`,
 * o que torna a requisição não-simples e obriga um OPTIONS antes).
 *
 * Não usamos `Access-Control-Allow-Credentials` porque a captura não depende
 * de cookie nenhum entre domínios: o track.js lê o que precisa (trck_user_id,
 * cookies do GA) no próprio site e manda tudo explicitamente no corpo. Menos
 * superfície, menos coisa pra dar errado.
 */

import { getPanelOrigins } from "@/lib/settings/origins-config"

function parseOrigins(bruto: string | undefined): string[] {
  return (bruto ?? "")
    .split(",")
    .map((valor) => valor.trim().replace(/\/+$/, ""))
    .filter(Boolean)
}

/**
 * A própria origem de produção do deploy.
 *
 * A Vercel expõe o host sem esquema em `VERCEL_PROJECT_PRODUCTION_URL`. Incluí-la
 * automaticamente evita o pé-na-porta mais comum do onboarding: esquecer o
 * próprio domínio do tracker na lista e não conseguir testar o track.js a partir
 * dele.
 */
function ownOrigin(): string[] {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  return host ? [`https://${host.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`] : []
}

const CONFIGURADAS = parseOrigins(process.env.TRACKING_ALLOWED_ORIGINS)
const ALLOWED_ORIGINS = new Set([...CONFIGURADAS, ...ownOrigin()])

/**
 * Variável vazia em produção deixa a captura dependendo só do painel — e, se o
 * painel também estiver vazio, o sintoma (zero eventos) não aponta para a
 * causa. O aviso sai uma vez por processo no log da função.
 */
if (process.env.NODE_ENV === "production" && CONFIGURADAS.length === 0) {
  console.warn(
    "[cors] TRACKING_ALLOWED_ORIGINS vazia: só as origens salvas em " +
      "Configurações → Geral podem capturar."
  )
}

/** Em desenvolvimento, libera localhost pra dar pra testar o track.js local. */
async function isAllowedOrigin(origin: string): Promise<boolean> {
  if (ALLOWED_ORIGINS.has(origin)) return true
  if ((await getPanelOrigins()).includes(origin)) return true

  if (process.env.NODE_ENV !== "production") {
    return /^http:\/\/localhost(:\d+)?$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
  }

  return false
}

export async function corsHeaders(
  request: Request
): Promise<Record<string, string>> {
  const origin = request.headers.get("origin")

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }

  // Sem origem permitida, simplesmente não devolvemos o header — o navegador
  // bloqueia a leitura da resposta. Requisições sem Origin (server-to-server,
  // curl) não são afetadas por CORS e seguem normalmente.
  if (origin && (await isAllowedOrigin(origin))) {
    headers["Access-Control-Allow-Origin"] = origin
  }

  return headers
}

export async function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Promise<Response> {
  const headers = await corsHeaders(request)
  return Response.json(body, {
    status,
    headers: {
      ...headers,
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  })
}

export async function preflightResponse(request: Request): Promise<Response> {
  const headers = await corsHeaders(request)
  return new Response(null, { status: 204, headers })
}
