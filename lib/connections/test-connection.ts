import "server-only"

import { randomUUID } from "node:crypto"

import {
  META_GRAPH_API_BASE,
  META_REQUEST_TIMEOUT_MS,
} from "@/lib/meta/constants"

/**
 * Resultado de um teste de conexão.
 *
 * `status` distingue três coisas de propósito:
 * - "ok": funcionou de verdade, ponta a ponta
 * - "erro": a API respondeu que não funciona
 * - "parcial": o que dava pra checar passou, mas a API não permite confirmar
 *   as credenciais (caso do GA4 — ver abaixo). Nunca pintar isso de verde:
 *   um "conectado" que mente é pior do que nenhum teste.
 */
export type ConnectionTestResult = {
  status: "ok" | "erro" | "parcial"
  message: string
  detail?: string
}

const GA4_DEBUG_ENDPOINT = "https://www.google-analytics.com/debug/mp/collect"

/** Os IDs vão interpolados em URL: só aceita o formato exato, nunca texto livre (anti-SSRF). */
const PIXEL_ID_PATTERN = /^[0-9]+$/
const AD_ACCOUNT_ID_PATTERN = /^act_[0-9]+$/
const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/

async function fetchWithTimeout(url: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
    cache: "no-store",
  })
}

/**
 * Testa um pixel do Meta enviando um evento de TESTE pela Conversions API.
 *
 * Por que enviar evento em vez de só ler os dados do pixel: um token de CAPI
 * (system user) normalmente NÃO tem permissão de ler os metadados do pixid —
 * verificado na prática, devolve "(#100) Missing Permission" mesmo com um
 * token perfeitamente válido. Ou seja, o teste por leitura dá falso negativo.
 * O único teste fiel é exercitar o endpoint que o sistema realmente usa.
 *
 * O evento vai com `test_event_code`, então aparece só na aba Test Events do
 * Events Manager e não entra nos dados de produção nem na atribuição.
 */
export async function testMetaPixelConnection(params: {
  pixelId: string
  capiToken: string
  testEventCode?: string | null
}): Promise<ConnectionTestResult> {
  const { pixelId, capiToken } = params

  if (!PIXEL_ID_PATTERN.test(pixelId)) {
    return {
      status: "erro",
      message: "ID do pixel inválido (só dígitos).",
    }
  }

  // Sem código de teste configurado, usa um marcador nosso — o importante é
  // que o evento NUNCA saia sem test_event_code, pra não sujar produção.
  const testEventCode = params.testEventCode?.trim() || "NEGOU_TESTE"

  const payload = {
    data: [
      {
        event_name: "PageView",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: "https://negou.net/",
        event_id: `teste-conexao-${randomUUID()}`,
        user_data: {
          client_ip_address: "200.147.0.1",
          client_user_agent: "NegouTracking/1.0 (teste de conexao)",
        },
      },
    ],
    test_event_code: testEventCode,
    access_token: capiToken,
  }

  try {
    const response = await fetchWithTimeout(
      `${META_GRAPH_API_BASE}/${pixelId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )

    const body = (await response.json()) as {
      events_received?: number
      messages?: unknown[]
      error?: { message?: string; code?: number }
    }

    if (body.error) {
      return {
        status: "erro",
        message: metaErrorMessage(body.error),
        detail: body.error.message,
      }
    }

    if (body.events_received && body.events_received > 0) {
      return {
        status: "ok",
        message: `Evento de teste aceito pelo pixel (${body.events_received} recebido).`,
        detail: `Aparece em Events Manager → Test Events com o código ${testEventCode}. Não entra em produção.`,
      }
    }

    return {
      status: "erro",
      message: "O Meta respondeu, mas não confirmou o recebimento do evento.",
      detail: JSON.stringify(body).slice(0, 300),
    }
  } catch (error) {
    return { status: "erro", message: networkErrorMessage(error) }
  }
}

/**
 * Testa uma conta de anúncio lendo nome, status e moeda.
 *
 * Aqui a leitura funciona mesmo (diferente do pixel), porque o token de Ads
 * tem escopo `ads_read`/`ads_management`. É exatamente a chamada que a tela de
 * Campanhas (fase 9) vai usar, então o teste cobre o caso real.
 */
export async function testMetaAdAccountConnection(params: {
  adAccountId: string
  adsToken: string
}): Promise<ConnectionTestResult> {
  const { adAccountId, adsToken } = params

  if (!AD_ACCOUNT_ID_PATTERN.test(adAccountId)) {
    return {
      status: "erro",
      message: "ID da conta inválido (formato act_123456789).",
    }
  }

  try {
    const url = new URL(`${META_GRAPH_API_BASE}/${adAccountId}`)
    url.searchParams.set("fields", "name,account_status,currency")
    url.searchParams.set("access_token", adsToken)

    const response = await fetchWithTimeout(url.toString())
    const body = (await response.json()) as {
      name?: string
      account_status?: number
      currency?: string
      error?: { message?: string; code?: number }
    }

    if (body.error) {
      return {
        status: "erro",
        message: metaErrorMessage(body.error),
        detail: body.error.message,
      }
    }

    // 1 = ativa. Os outros valores (2 = desabilitada, 3 = não paga, etc.) são
    // conexão OK mas conta com problema — vale avisar sem alarmar.
    const active = body.account_status === 1

    return {
      status: active ? "ok" : "parcial",
      message: active
        ? `Conectado a "${body.name}" (${body.currency}).`
        : `Conectado a "${body.name}", mas a conta não está ativa (status ${body.account_status}).`,
      detail: active
        ? undefined
        : "O token funciona; o problema é o estado da conta no Gerenciador de Anúncios.",
    }
  } catch (error) {
    return { status: "erro", message: networkErrorMessage(error) }
  }
}

/**
 * Testa uma propriedade GA4 no endpoint de validação do Measurement Protocol.
 *
 * LIMITAÇÃO IMPORTANTE, verificada na prática: esse endpoint valida só o
 * FORMATO do evento — não as credenciais. Testei com api_secret inválido e com
 * measurement_id inexistente: os dois devolvem HTTP 200 e zero mensagens de
 * validação. Ou seja, é impossível confirmar por API que a credencial do GA4
 * está certa.
 *
 * Por isso o melhor resultado possível aqui é "parcial", nunca "ok": o que dá
 * pra afirmar é que o endpoint respondeu e o payload é válido. A confirmação
 * real é ver o evento chegando no DebugView/Tempo real do GA4.
 */
export async function testGa4Connection(params: {
  measurementId: string
  apiSecret: string
}): Promise<ConnectionTestResult> {
  const { measurementId, apiSecret } = params

  if (!MEASUREMENT_ID_PATTERN.test(measurementId)) {
    return {
      status: "erro",
      message: "Measurement ID inválido (formato G-XXXXXXX).",
    }
  }

  const payload = {
    client_id: `${Math.floor(Math.random() * 1e10)}.${Math.floor(Date.now() / 1000)}`,
    events: [
      {
        name: "page_view",
        params: { page_location: "https://negou.net/", debug_mode: 1 },
      },
    ],
  }

  try {
    const url = new URL(GA4_DEBUG_ENDPOINT)
    url.searchParams.set("measurement_id", measurementId)
    url.searchParams.set("api_secret", apiSecret)

    const response = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      return {
        status: "erro",
        message: `O GA4 respondeu HTTP ${response.status}.`,
      }
    }

    const body = (await response.json()) as {
      validationMessages?: { description?: string; validationCode?: string }[]
    }

    const problems = body.validationMessages ?? []

    if (problems.length > 0) {
      return {
        status: "erro",
        message: "O GA4 recusou o formato do evento.",
        detail: problems.map((p) => p.description).join(" · "),
      }
    }

    return {
      status: "parcial",
      message: "Endpoint respondeu e o formato do evento é válido.",
      detail:
        "A API do GA4 não valida credenciais: measurement_id e api_secret errados também passam por aqui. " +
        "Para confirmar de verdade, veja o evento chegando em Administrador → DebugView no GA4.",
    }
  } catch (error) {
    return { status: "erro", message: networkErrorMessage(error) }
  }
}

function metaErrorMessage(error: { message?: string; code?: number }): string {
  switch (error.code) {
    case 190:
      return "Token inválido ou expirado."
    case 100:
      return "O token não tem permissão para este recurso."
    case 200:
      return "Permissão insuficiente para esta conta."
    case 2500:
      return "Recurso não encontrado — confira o ID."
    case 4:
    case 17:
      return "Limite de requisições do Meta atingido. Tente de novo em alguns minutos."
    default:
      return error.message ?? "O Meta recusou a requisição."
  }
}

function networkErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "A API não respondeu a tempo (timeout)."
  }
  return "Não foi possível falar com a API."
}
