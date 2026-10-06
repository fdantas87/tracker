import "server-only"

import {
  CLARITY_EXPORT_URL,
  CLARITY_REQUEST_TIMEOUT_MS,
} from "./constants"

/**
 * Chamada única à Data Export API do Clarity.
 *
 * O token vai SÓ no header e nunca aparece em mensagem de erro, log ou
 * `last_sync_error` — quem chama recebe um texto pronto para a tela, sem nada
 * da requisição dentro.
 */

export type ClarityFetchResult =
  | { ok: true; payload: unknown }
  | {
      ok: false
      /** 401/403 = token; 429 = cota; outros = indisponibilidade. */
      kind: "token" | "cota" | "parametro" | "indisponivel"
      message: string
    }

export async function fetchLiveInsights(params: {
  token: string
  numOfDays: 1 | 2 | 3
  dimension: string | null
}): Promise<ClarityFetchResult> {
  const url = new URL(CLARITY_EXPORT_URL)
  url.searchParams.set("numOfDays", String(params.numOfDays))
  if (params.dimension) url.searchParams.set("dimension1", params.dimension)

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${params.token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(CLARITY_REQUEST_TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError"
    return {
      ok: false,
      kind: "indisponivel",
      message: timeout
        ? "O Clarity não respondeu a tempo."
        : "Não foi possível falar com o Clarity (rede).",
    }
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      kind: "token",
      message:
        "O Clarity recusou o token. Gere um novo em Settings → Data Export e substitua em Mapa de Calor → Configurar.",
    }
  }
  if (response.status === 429) {
    return {
      ok: false,
      kind: "cota",
      message:
        "Cota diária do Clarity esgotada (10 chamadas por dia por projeto). Se outra ferramenta usa o mesmo token, ela divide essa cota.",
    }
  }
  if (response.status === 400) {
    return {
      ok: false,
      kind: "parametro",
      message: "O Clarity recusou os parâmetros da consulta.",
    }
  }
  if (!response.ok) {
    return {
      ok: false,
      kind: "indisponivel",
      message: `O Clarity respondeu HTTP ${response.status}.`,
    }
  }

  try {
    return { ok: true, payload: await response.json() }
  } catch {
    return {
      ok: false,
      kind: "indisponivel",
      message: "O Clarity respondeu algo que não é JSON.",
    }
  }
}
