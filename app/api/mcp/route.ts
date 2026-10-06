import { callTool, listTools, MCP_INSTRUCTIONS } from "@/lib/clarity/mcp"
import { verifyWebhookToken } from "@/lib/crypto/webhook-token"
import { checkRateLimit, type RateLimitRule } from "@/lib/rate-limit"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * /api/mcp — servidor MCP deste deploy (Streamable HTTP, sem sessão).
 *
 * JSON-RPC à mão, sem o SDK: o servidor só precisa de 4 métodos
 * (initialize, ping, tools/list, tools/call), todos de requisição e resposta,
 * sem streaming nem estado. O SDK traria zod e um transporte inteiro para
 * isso, num projeto que até hoje não puxou SDK nem para o Stripe.
 *
 * AUTENTICAÇÃO: token próprio do MCP, guardado só como SHA-256 em
 * `clarity_accounts.mcp_token_hash` e comparado em tempo constante. Aceito no
 * header `Authorization: Bearer` OU em `?token=` — o conector personalizado do
 * Claude no navegador não deixa configurar header, mesma situação já tratada
 * no webhook de compra. Por isso a URL nunca é logada.
 *
 * O proxy.ts não passa por /api, então esta rota se autentica sozinha.
 */

const MCP_RULE: RateLimitRule = { limit: 60, windowSeconds: 60 }

const PROTOCOLOS = ["2025-06-18", "2025-03-26", "2024-11-05"]

type RpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

function rpcResult(id: RpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result }
}

function rpcError(id: RpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } }
}

async function autorizado(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") ?? ""
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : ""
  const token = bearer || new URL(request.url).searchParams.get("token") || ""
  if (!token) return false

  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from("clarity_accounts")
      .select("mcp_token_hash")
      .eq("id", true)
      .maybeSingle()
    const hash = data?.mcp_token_hash
    return typeof hash === "string" && verifyWebhookToken(token, hash)
  } catch {
    return false
  }
}

async function handle(msg: RpcRequest): Promise<object | null> {
  // Notificação (sem id): não tem resposta.
  const isNotification = msg.id === undefined

  switch (msg.method) {
    case "initialize": {
      const pedido = typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : ""
      return rpcResult(msg.id, {
        protocolVersion: PROTOCOLOS.includes(pedido) ? pedido : PROTOCOLOS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "thetrack-clarity", version: "1.0.0" },
        instructions: MCP_INSTRUCTIONS,
      })
    }
    case "ping":
      return rpcResult(msg.id, {})
    case "tools/list":
      return rpcResult(msg.id, { tools: listTools() })
    case "tools/call": {
      const name = typeof msg.params?.name === "string" ? msg.params.name : ""
      const args =
        msg.params?.arguments && typeof msg.params.arguments === "object"
          ? (msg.params.arguments as Record<string, unknown>)
          : {}
      return rpcResult(msg.id, await callTool(name, args))
    }
    default:
      if (isNotification || msg.method?.startsWith("notifications/")) return null
      return rpcError(msg.id, -32601, `Método não suportado: ${msg.method ?? "(vazio)"}`)
  }
}

export async function POST(request: Request) {
  const limit = await checkRateLimit("mcp", "clarity", MCP_RULE)
  if (!limit.allowed) {
    return Response.json(rpcError(null, -32000, "Muitas requisições. Tente em um minuto."), {
      status: 429,
      headers: { "Retry-After": String(limit.resetInSeconds) },
    })
  }

  if (!(await autorizado(request))) {
    return Response.json(rpcError(null, -32001, "Token do MCP ausente ou inválido."), {
      status: 401,
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(rpcError(null, -32700, "JSON inválido."), { status: 400 })
  }

  const mensagens = Array.isArray(body) ? body : [body]
  const respostas: object[] = []
  for (const m of mensagens) {
    if (!m || typeof m !== "object") {
      respostas.push(rpcError(null, -32600, "Requisição inválida."))
      continue
    }
    const r = await handle(m as RpcRequest)
    if (r) respostas.push(r)
  }

  // Só notificações: 202 sem corpo, como o transporte Streamable HTTP pede.
  if (respostas.length === 0) return new Response(null, { status: 202 })

  return Response.json(Array.isArray(body) ? respostas : respostas[0], {
    headers: { "Cache-Control": "no-store" },
  })
}

/** Sem stream do servidor: este MCP só responde a requisições. */
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}
