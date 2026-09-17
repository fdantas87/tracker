/**
 * CORS dos endpoints públicos de captura.
 *
 * Allowlist FECHADA e comparada por igualdade exata. Nunca usar `*` e nunca
 * checar com `endsWith(".negou.net")`: um domínio como
 * `negou.net.site-do-atacante.com` passaria no endsWith e ganharia acesso.
 *
 * Não usamos `Access-Control-Allow-Credentials` porque a captura não depende
 * de cookie nenhum entre domínios: o track.js lê o que precisa (trck_user_id,
 * cookies do GA) no próprio site e manda tudo explicitamente no corpo. Menos
 * superfície, menos coisa pra dar errado.
 */

const ALLOWED_ORIGINS = new Set([
  "https://negou.net",
  "https://www.negou.net",
  "https://lp.negou.net",
  "https://blog.negou.net",
  "https://quiz.negou.net",
  "https://tracking.negou.net",
])

/** Em desenvolvimento, libera localhost pra dar pra testar o track.js local. */
function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true

  if (process.env.NODE_ENV !== "production") {
    return /^http:\/\/localhost(:\d+)?$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
  }

  return false
}

export function corsHeaders(request: Request): Record<string, string> {
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
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
  }

  return headers
}

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(request),
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  })
}

export function preflightResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}
