import { after } from "next/server"

import { syncClarity } from "@/lib/clarity/sync"
import { revealSecret } from "@/lib/crypto/vault"
import {
  hashWebhookToken,
  verifyWebhookToken,
} from "@/lib/crypto/webhook-token"
import { CRON_RULE, checkRateLimit } from "@/lib/rate-limit"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * POST /api/cron/clarity
 *
 * Sincronização diária do Clarity. Quem chama é o pg_cron, uma vez por dia,
 * via `tick_clarity_sync()` (migration `..._clarity_integration.sql`), com o
 * MESMO token do cron de dispatch — nenhuma credencial nova.
 *
 * Mesmo desenho de /api/cron/dispatch: confere o token em tempo constante,
 * responde 202 na hora e trabalha no `after()`, porque o pg_net derruba a
 * conexão no timeout dele. Sem CORS: servidor-pra-servidor.
 */

/** 5 chamadas ao Clarity em sequência, 15 s de teto cada. */
export const maxDuration = 120

export async function POST(request: Request) {
  const limit = await checkRateLimit("cron", "clarity", CRON_RULE)
  if (!limit.allowed) {
    return Response.json({ error: "rate_limited" }, { status: 429 })
  }

  const token = request.headers.get("x-cron-token") ?? ""
  if (!token) {
    return Response.json({ error: "nao_autorizado" }, { status: 401 })
  }

  try {
    const supabase = createServiceClient()
    const { data: settings } = await supabase
      .from("settings")
      .select("dispatch_cron_token_vault_id")
      .eq("id", true)
      .maybeSingle()

    const vaultId = settings?.dispatch_cron_token_vault_id
    if (!vaultId) {
      return Response.json({ error: "cron_nao_configurado" }, { status: 503 })
    }

    const expected = await revealSecret(String(vaultId))
    if (!verifyWebhookToken(token, hashWebhookToken(expected))) {
      return Response.json({ error: "nao_autorizado" }, { status: 401 })
    }

    after(async () => {
      await syncClarity({ origin: "cron" })
    })

    return Response.json({ ok: true, accepted: true }, { status: 202 })
  } catch {
    return Response.json({ error: "erro_interno" }, { status: 500 })
  }
}
