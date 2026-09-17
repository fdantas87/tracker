import "server-only"

import {
  hashCity,
  hashCountry,
  hashExternalId,
  hashState,
} from "@/lib/crypto/hash"
import { META_MAX_EVENTS_PER_REQUEST } from "@/lib/meta/constants"
import { sendBatchToAllPixels, type MetaEventInput } from "@/lib/meta/capi"
import { toMetaCustomData } from "@/lib/meta/custom-data"
import { getDispatchConfig } from "@/lib/settings/dispatch-config"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * Fila de disparo dos eventos de navegador para a Conversions API (fase 7.5).
 *
 * POR QUE EXISTE UMA FILA:
 * no instante do PageView o sistema só conhece cookie, IP e geo. O email, o
 * telefone e o nome só aparecem quando a pessoa converte — e aí o evento já
 * teria sido enviado. O Meta não deixa atualizar evento recebido, então o dado
 * se perderia pra sempre. Segurando o evento por alguns minutos, a conversão
 * grava a PII no visitante e o disparo (que lê `visitors` na hora do envio)
 * sai enriquecido sozinho, sem reescrever payload nenhum.
 *
 * UM CAMINHO SÓ ATÉ O META, de propósito. Tanto o envio imediato quanto o do
 * cron passam por uma reivindicação atômica da linha
 * (`dispatch_status = 'pending'` -> `'sending'`). É isso que torna impossível
 * o mesmo evento ser enviado duas vezes, mesmo se o cron e a requisição
 * original correrem ao mesmo tempo.
 *
 * GA4 continua FORA daqui, como na fase 6: os eventos do navegador já vão pela
 * gtag, e repetir pelo Measurement Protocol contaria em dobro. O MP é só pra
 * compra do webhook. Ver lib/ga4/mp.ts.
 */

type EventRow = {
  id: string
  trck_user_id: string
  event_name: string
  event_id: string
  event_time: string
  event_source_url: string | null
  custom_data: Record<string, unknown> | null
  action_source: string | null
  dispatch_attempts: number
}

export type DrainResult = {
  claimed: number
  sent: number
  failed: number
  skipped: number
}

/**
 * Espera entre tentativas, em segundos. A primeira falha quase sempre é um
 * soluço de rede; a quinta já é problema de configuração, e insistir só
 * enche o log.
 */
const RETRY_BACKOFF_SECONDS = [60, 300, 900, 3600]
const MAX_ATTEMPTS = 5

const EMPTY: DrainResult = { claimed: 0, sent: 0, failed: 0, skipped: 0 }

/**
 * Envia UM evento agora (caminho imediato: visitante já identificado, evento
 * na lista de "nunca atrasar", ou atraso desligado).
 *
 * A reivindicação condicional é a trava: se o cron pegou esta linha primeiro,
 * o update não casa com nada e a função sai sem fazer nada.
 */
export async function dispatchEventNow(eventId: string): Promise<DrainResult> {
  try {
    const supabase = createServiceClient()

    const { data } = await supabase
      .from("events_log")
      .update({
        dispatch_status: "sending",
        dispatch_claimed_at: new Date().toISOString(),
      })
      .eq("event_id", eventId)
      .eq("dispatch_status", "pending")
      .select("*")

    const rows = (data ?? []) as EventRow[]
    if (rows.length === 0) return EMPTY

    return await dispatchClaimed(rows)
  } catch {
    // Nada aqui pode escapar: indisponibilidade do Meta ou do banco não pode
    // derrubar a captura. A linha volta pro 'pending' pelo reaper da fila.
    return EMPTY
  }
}

/**
 * Drena a fila: reivindica um lote vencido e envia.
 *
 * Chamado pelo endpoint que o pg_cron acorda de minuto em minuto, e também
 * logo depois de uma conversão liberar a fila de um visitante.
 */
export async function drainEventQueue(
  limit = 150
): Promise<DrainResult> {
  try {
    const supabase = createServiceClient()

    const { data, error } = await supabase.rpc("claim_pending_events", {
      p_limit: limit,
    })

    if (error) return EMPTY

    const rows = (data ?? []) as EventRow[]
    if (rows.length === 0) return EMPTY

    return await dispatchClaimed(rows)
  } catch {
    return EMPTY
  }
}

async function dispatchClaimed(rows: EventRow[]): Promise<DrainResult> {
  const supabase = createServiceClient()
  const config = await getDispatchConfig()

  // Uma query pra todos os visitantes do lote, não uma por evento. É aqui que
  // a retroalimentação acontece: a linha lida AGORA já tem o email/telefone
  // que a conversão gravou enquanto o evento esperava.
  const visitorIds = Array.from(new Set(rows.map((row) => row.trck_user_id)))
  const { data: visitorRows } = await supabase
    .from("visitors")
    .select("*")
    .in("trck_user_id", visitorIds)

  const visitors = new Map<string, Record<string, unknown>>()
  for (const visitor of visitorRows ?? []) {
    visitors.set(String(visitor.trck_user_id), visitor)
  }

  const result: DrainResult = { claimed: rows.length, sent: 0, failed: 0, skipped: 0 }

  for (let index = 0; index < rows.length; index += META_MAX_EVENTS_PER_REQUEST) {
    const chunk = rows.slice(index, index + META_MAX_EVENTS_PER_REQUEST)
    const inputs = chunk.map((row) => toMetaEventInput(row, visitors.get(row.trck_user_id)))

    let dispatch
    try {
      dispatch = await sendBatchToAllPixels(inputs, config.testEventCode)
    } catch (error) {
      await markFailure(chunk, error instanceof Error ? error.message : "falha inesperada")
      result.failed += chunk.length
      continue
    }

    if (dispatch.results.length === 0) {
      // Nenhum pixel ativo. Não é falha e não adianta tentar de novo: fica
      // registrado pra não parecer que o envio sumiu.
      await markSkipped(chunk, "nenhum pixel ativo configurado")
      result.skipped += chunk.length
      continue
    }

    // Só volta pra fila quando TODOS os destinos falharam — aí é indisponi-
    // bilidade de verdade. Falha parcial fica registrada em response_meta e a
    // linha é dada por enviada: reenviar mandaria o evento de novo também pros
    // pixels que deram certo.
    const everyFailed = dispatch.results.every((entry) => !entry.ok)
    if (everyFailed) {
      await markFailure(chunk, summarizeFailure(dispatch.results))
      result.failed += chunk.length
      continue
    }

    await markSent(chunk, dispatch)
    result.sent += chunk.length
  }

  return result
}

function toMetaEventInput(
  row: EventRow,
  visitor: Record<string, unknown> | undefined
): MetaEventInput {
  return {
    eventName: row.event_name,
    eventId: row.event_id,
    // O momento REAL do evento, não o do envio. Usar Date.now() aqui faria um
    // evento atrasado parecer ter acontecido 15 minutos depois, jogando a
    // atribuição pra frente. O Meta aceita até 7 dias de defasagem.
    eventTime: Math.floor(new Date(row.event_time).getTime() / 1000),
    eventSourceUrl: row.event_source_url,
    actionSource: row.action_source ?? "website",
    testEventCode: null, // vai uma vez por requisição, não por evento
    customData: toMetaCustomData(row.custom_data),
    userData: {
      // Hashes já calculados na captura ou no enriquecimento da conversão.
      emailHash: asString(visitor?.email_hash),
      phoneHash: asString(visitor?.phone_hash),
      firstNameHash: asString(visitor?.first_name_hash),
      lastNameHash: asString(visitor?.last_name_hash),
      // Geo é guardado em texto e hasheado só na hora do envio.
      cityHash: hashCity(asString(visitor?.geo_city)),
      stateHash: hashState(asString(visitor?.geo_region)),
      countryHash: hashCountry(asString(visitor?.geo_country)),
      externalIdHash: hashExternalId(row.trck_user_id),
      // Texto puro por exigência do Meta: hashear estes quatro não dá erro,
      // só zera a correspondência.
      fbp: asString(visitor?.fbp),
      fbc: asString(visitor?.fbc),
      clientIpAddress: asString(visitor?.ip),
      clientUserAgent: asString(visitor?.user_agent),
    },
  }
}

/**
 * Guarda o payload enviado e a resposta de cada destino, linha a linha.
 *
 * É esse par que responde "esse evento chegou no Meta?" sem depender do Events
 * Manager, e é o que a tela de Eventos (fase 8) mostra. Cada evento guarda o
 * SEU objeto, não o lote inteiro — o lote pode ter 50 eventos de visitantes
 * diferentes.
 */
async function markSent(
  rows: EventRow[],
  dispatch: Awaited<ReturnType<typeof sendBatchToAllPixels>>
): Promise<void> {
  const supabase = createServiceClient()
  const payloads = new Map(
    dispatch.perEvent.map((entry) => [entry.eventId, entry.payload])
  )
  const dispatchedAt = new Date().toISOString()

  await Promise.allSettled(
    rows.map((row) =>
      supabase
        .from("events_log")
        .update({
          dispatch_status: "sent",
          dispatched_at: dispatchedAt,
          dispatch_error: null,
          payload_meta: payloads.get(row.event_id) ?? null,
          response_meta: dispatch.results,
        })
        .eq("id", row.id)
    )
  )
}

async function markSkipped(rows: EventRow[], note: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase
    .from("events_log")
    .update({
      dispatch_status: "skipped",
      dispatched_at: new Date().toISOString(),
      response_meta: { note },
    })
    .in(
      "id",
      rows.map((row) => row.id)
    )
}

/**
 * Devolve as linhas pra fila com espera crescente, ou desiste depois da quinta
 * tentativa. `dispatch_attempts` já foi incrementado na reivindicação.
 */
async function markFailure(rows: EventRow[], message: string): Promise<void> {
  const supabase = createServiceClient()
  const error = message.slice(0, 300)

  await Promise.allSettled(
    rows.map((row) => {
      const attempts = row.dispatch_attempts ?? 1
      if (attempts >= MAX_ATTEMPTS) {
        return supabase
          .from("events_log")
          .update({ dispatch_status: "failed", dispatch_error: error })
          .eq("id", row.id)
      }

      const waitSeconds =
        RETRY_BACKOFF_SECONDS[
          Math.min(attempts - 1, RETRY_BACKOFF_SECONDS.length - 1)
        ]

      return supabase
        .from("events_log")
        .update({
          dispatch_status: "pending",
          dispatch_after: new Date(Date.now() + waitSeconds * 1000).toISOString(),
          dispatch_error: error,
        })
        .eq("id", row.id)
    })
  )
}

function summarizeFailure(
  results: Awaited<ReturnType<typeof sendBatchToAllPixels>>["results"]
): string {
  const first = results[0]
  if (!first) return "nenhum destino respondeu"
  return `${first.label}: ${JSON.stringify(first.response)}`
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null
}
