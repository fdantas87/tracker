import "server-only"

import { createServiceClient } from "@/lib/supabase/service"

/**
 * Origens liberadas pelo painel (Configurações → Geral), somadas à variável
 * TRACKING_ALLOWED_ORIGINS em lib/cors.ts.
 *
 * Consultado em todo preflight e toda resposta de captura, então fica
 * memorizado por 60s no módulo — mesmo desenho de dispatch-config.ts. O memo é
 * por instância da função serverless: uma mudança no painel leva no máximo 60s
 * para valer em todas.
 *
 * Falha de leitura (inclusive a migration ainda não aplicada) devolve lista
 * vazia: não libera nada a mais, e não tira o que a variável já libera.
 */

let cached: { value: string[]; expiresAt: number } | null = null

const TTL_MS = 60_000

export async function getPanelOrigins(): Promise<string[]> {
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.value

  try {
    const { data } = await createServiceClient()
      .from("settings")
      .select("allowed_origins")
      .eq("id", true)
      .maybeSingle()

    const value = Array.isArray(data?.allowed_origins)
      ? (data.allowed_origins as string[])
      : []

    cached = { value, expiresAt: now + TTL_MS }
    return value
  } catch {
    return []
  }
}

/** Usado pela Server Action depois de salvar, pra não esperar o TTL. */
export function invalidatePanelOrigins(): void {
  cached = null
}

/**
 * Texto do formulário → lista de origens, ou a mensagem de erro.
 *
 * Aceita vírgula, espaço ou quebra de linha como separador (quem cola a mesma
 * lista da variável da Vercel não precisa reformatar). Cada item precisa ser
 * só esquema + host (+ porta): exatamente a forma do header `Origin` que o
 * navegador manda, porque a comparação em lib/cors.ts é por igualdade exata.
 * Barra final e maiúscula no host são normalizadas em vez de recusadas.
 */
export function parseOriginsInput(raw: string): string[] | string {
  const origins: string[] = []

  for (const item of raw.split(/[\s,]+/).filter(Boolean)) {
    let url: URL
    try {
      url = new URL(item)
    } catch {
      return `"${item}" não é um endereço válido. Use o formato https://www.exemplo.com`
    }
    if (!/^https?:$/.test(url.protocol) || url.href !== `${url.origin}/`) {
      return `"${item}" precisa ser só o domínio, com https:// e sem caminho — ex.: https://www.exemplo.com`
    }
    origins.push(url.origin)
  }

  return [...new Set(origins)]
}
