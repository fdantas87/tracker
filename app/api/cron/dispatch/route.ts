import { after } from "next/server"

import { revealSecret } from "@/lib/crypto/vault"
import {
  hashWebhookToken,
  verifyWebhookToken,
} from "@/lib/crypto/webhook-token"
import { drainEventQueue } from "@/lib/dispatch/event-dispatch"
import { CRON_RULE, checkRateLimit } from "@/lib/rate-limit"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * POST /api/cron/dispatch
 *
 * Drena a fila de eventos atrasados (fase 7.5). Quem chama é o pg_cron do
 * próprio Supabase, de minuto em minuto, via pg_net — ver a função
 * `tick_event_queue()` na migration `..._event_queue.sql`.
 *
 * POR QUE NO POSTGRES E NÃO NO CRON DA VERCEL:
 * o cron da Vercel exige um `vercel.json` (que este projeto não tem, por
 * decisão de manter toda a configuração na dashboard) e, no plano Hobby, roda
 * no máximo uma vez por dia — inútil pra uma fila de 15 minutos. O pg_cron já
 * existe aqui desde a fase 2 e resolve sem serviço novo, mesmo raciocínio que
 * tirou o Redis do rate limit.
 *
 * RESPONDE 202 ANTES DE TRABALHAR, de propósito: o pg_net é fire-and-forget e
 * derruba a conexão no timeout dele. O `after()` é justamente o que mantém a
 * função viva até o envio terminar, mesmo com o cliente já desconectado (a
 * doc do Next: "after will run for the platform's default or configured max
 * duration of your route").
 *
 * Sem CORS: é servidor-pra-servidor, como o webhook de compra.
 */

/**
 * Um lote de 150 eventos vira no máximo 3 requisições ao Meta (50 por
 * requisição), cada uma com timeout de 10s. 60s cobre o pior caso com folga;
 * o que sobrar da fila sai no tique do minuto seguinte.
 */
export const maxDuration = 60

const BATCH_LIMIT = 150

export async function POST(request: Request) {
  const limit = await checkRateLimit("cron", "dispatch", CRON_RULE)
  if (!limit.allowed) {
    return Response.json({ error: "rate_limited" }, { status: 429 })
  }

  // A URL nunca é logada: diferente do webhook de compra, aqui o token só
  // viaja no header, mas a regra de não logar URL de endpoint autenticado
  // vale igual.
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

    // O token bruto vive só no Vault: uma representação, uma fonte de verdade.
    // O pg_cron lê o mesmo valor pra mandar no header, então trocar o token no
    // painel já vale no próximo tique, sem editar SQL nenhum.
    const expected = await revealSecret(String(vaultId))
    if (!verifyWebhookToken(token, hashWebhookToken(expected))) {
      return Response.json({ error: "nao_autorizado" }, { status: 401 })
    }

    after(async () => {
      await drainEventQueue(BATCH_LIMIT)
    })

    return Response.json({ ok: true, accepted: true }, { status: 202 })
  } catch {
    return Response.json({ error: "erro_interno" }, { status: 500 })
  }
}
