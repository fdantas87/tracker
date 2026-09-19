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
 * - "verificar": o envio deu certo, mas quem confirma é você, olhando do outro
 *   lado (caso do GA4 — ver abaixo). NÃO é erro, e a UI não deve pintar como
 *   se fosse; mas também não pode virar verde, porque um "conectado" que
 *   mente é pior do que nenhum teste.
 */
export type ConnectionTestResult = {
  status: "ok" | "erro" | "verificar"
  message: string
  detail?: string
}

const GA4_DEBUG_ENDPOINT = "https://www.google-analytics.com/debug/mp/collect"
const GA4_COLLECT_ENDPOINT = "https://www.google-analytics.com/mp/collect"

/**
 * Nome próprio em vez de `page_view`: assim o evento de teste não entra nas
 * métricas padrão do GA4 (sessões, page views) e é fácil de reconhecer e
 * ignorar em qualquer relatório.
 */
const GA4_TEST_EVENT_NAME = "tracking_teste_conexao"

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
 * (system user) normalmente NÃO tem permissão de ler os metadados do pixel —
 * verificado na prática, devolve "(#100) Missing Permission" mesmo com um
 * token perfeitamente válido. Ou seja, o teste por leitura dá falso negativo.
 * O único teste fiel é exercitar o endpoint que o sistema realmente usa.
 *
 * SOBRE O ISOLAMENTO DE PRODUÇÃO — corrigido depois de ver na prática:
 * o `test_event_code` só isola o evento de verdade quando é um código REAL,
 * gerado pela aba "Eventos de teste" do Events Manager daquele pixel. Um
 * código inventado não corresponde a nenhuma sessão de teste e o evento
 * aparece na atividade de produção. Por isso o resultado avisa, quando não há
 * código configurado, que o evento pode contar como real.
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

  const configuredCode = params.testEventCode?.trim() || null
  const testEventCode = configuredCode ?? "TESTE_CONEXAO"

  const payload = {
    data: [
      {
        event_name: "PageView",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: "https://exemplo.com/",
        event_id: `teste-conexao-${randomUUID()}`,
        user_data: {
          client_ip_address: "200.147.0.1",
          client_user_agent: "TrackingPanel/1.0 (teste de conexao)",
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
        detail: configuredCode
          ? `Para vê-lo, abra Events Manager → Eventos de teste com o código ${configuredCode} ANTES de testar: aquela tela é um monitor ao vivo e não mostra o que chegou antes de ela abrir.`
          : "Atenção: não há código de teste configurado em Geral, então este evento provavelmente contou como produção. " +
            "Para testar sem afetar seus dados, pegue o código na aba Eventos de teste do Events Manager e salve em Configurações → Geral.",
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
      status: active ? "ok" : "verificar",
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
 * Testa uma propriedade GA4 em dois passos.
 *
 * 1. Valida o formato no endpoint de debug (pega nome reservado, client_id
 *    faltando, etc.).
 * 2. ENVIA de verdade um evento `tracking_teste_conexao` com `debug_mode`, pelo
 *    endpoint normal do Measurement Protocol, pra ele aparecer no DebugView.
 *
 * Por que o passo 2 existe: verificado na prática, o endpoint de validação
 * NÃO confere credenciais — com api_secret inválido e com measurement_id
 * inexistente, os dois devolvem HTTP 200 e zero mensagens. E o endpoint de
 * coleta devolve 204 sempre, dando certo ou errado. Não existe, em nenhum dos
 * dois, uma resposta que prove que a credencial está certa.
 *
 * O que dá pra fazer é entregar o evento e deixar a confirmação a um passo de
 * distância: se as credenciais estiverem certas, ele aparece no DebugView em
 * segundos; se estiverem erradas, nunca aparece. Daí o status "verificar" —
 * não é falha, é a última milha que só o GA4 pode responder.
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
        name: GA4_TEST_EVENT_NAME,
        params: { debug_mode: 1, origem: "painel_tracking" },
      },
    ],
  }

  try {
    // Passo 1: validação de formato.
    const debugUrl = new URL(GA4_DEBUG_ENDPOINT)
    debugUrl.searchParams.set("measurement_id", measurementId)
    debugUrl.searchParams.set("api_secret", apiSecret)

    const debugResponse = await fetchWithTimeout(debugUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!debugResponse.ok) {
      return {
        status: "erro",
        message: `O GA4 respondeu HTTP ${debugResponse.status}.`,
      }
    }

    const debugBody = (await debugResponse.json()) as {
      validationMessages?: { description?: string; validationCode?: string }[]
    }
    const problems = debugBody.validationMessages ?? []

    if (problems.length > 0) {
      return {
        status: "erro",
        message: "O GA4 recusou o formato do evento.",
        detail: problems.map((p) => p.description).join(" · "),
      }
    }

    // Passo 2: envio real, pra dar o que olhar no DebugView.
    const collectUrl = new URL(GA4_COLLECT_ENDPOINT)
    collectUrl.searchParams.set("measurement_id", measurementId)
    collectUrl.searchParams.set("api_secret", apiSecret)

    const collectResponse = await fetchWithTimeout(collectUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (collectResponse.status >= 400) {
      return {
        status: "erro",
        message: `O GA4 recusou o envio (HTTP ${collectResponse.status}).`,
      }
    }

    return {
      status: "verificar",
      message: `Evento de teste enviado. Confira no DebugView do GA4.`,
      detail:
        `Abra Administrador → DebugView: o evento "${GA4_TEST_EVENT_NAME}" deve aparecer em alguns segundos. ` +
        "Se aparecer, as credenciais estão certas. Se não aparecer, o measurement ID ou o api secret estão errados — " +
        "a API do Google aceita credencial inválida sem reclamar, então essa é a única forma de ter certeza. " +
        "O evento tem nome próprio e não entra nas métricas de páginas ou sessões.",
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
