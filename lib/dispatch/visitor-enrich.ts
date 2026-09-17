import "server-only"

import { hashEmail, hashName, hashPhone } from "@/lib/crypto/hash"
import { createServiceClient } from "@/lib/supabase/service"
import type { NormalizedPurchase } from "@/lib/webhooks/adapters/types"

/**
 * Grava no VISITANTE os dados pessoais que chegaram pela conversão (fase 7.5).
 *
 * É este passo que faz o disparo atrasado valer a pena. Até aqui a PII do
 * comprador parava em `purchases` e os eventos de navegador continuavam
 * anônimos pra sempre — a compra era rastreada, mas o PageView que levou até
 * ela não. Com a escrita de volta no visitante, todo evento que ainda estiver
 * na fila sai com email/telefone/nome hasheados, porque o disparo lê a linha
 * do visitante no instante do envio.
 *
 * Vale pra QUALQUER status, não só aprovado: um boleto/Pix gerado (status
 * pendente) já carrega o email do comprador, e essa é a PII que interessa —
 * dias antes de a venda ser aprovada.
 */

export type EnrichResult = {
  /** Aprendemos algo que ainda não sabíamos? É o gatilho pra liberar a fila. */
  enriched: boolean
  filled: string[]
}

const NOTHING: EnrichResult = { enriched: false, filled: [] }

export async function enrichVisitorFromPurchase(
  trckUserId: string | null | undefined,
  purchase: NormalizedPurchase,
  defaultPhoneCountry: string
): Promise<EnrichResult> {
  if (!trckUserId) return NOTHING

  const emailHash = hashEmail(purchase.buyerEmail)
  const phoneHash = hashPhone(purchase.buyerPhone, defaultPhoneCountry)
  const firstNameHash = hashName(purchase.buyerFirstName)
  const lastNameHash = hashName(purchase.buyerLastName)

  if (!emailHash && !phoneHash && !firstNameHash && !lastNameHash) {
    return NOTHING
  }

  try {
    const supabase = createServiceClient()

    // `fill_visitor_pii` só preenche buraco e devolve o que preencheu, então a
    // mesma ida ao banco escreve e responde "vale liberar a fila?". Ela trava
    // a linha (`for update`), o que evita corrida com um /api/identify que
    // esteja gravando o mesmo visitante nesse instante.
    const { data, error } = await supabase.rpc("fill_visitor_pii", {
      p_trck_user_id: trckUserId,
      p_email: purchase.buyerEmail,
      p_email_hash: emailHash,
      p_phone_hash: phoneHash,
      p_first_name_hash: firstNameHash,
      p_last_name_hash: lastNameHash,
    })

    if (error) return NOTHING

    const filled = Array.isArray(data) ? (data as string[]) : []
    return { enriched: filled.length > 0, filled }
  } catch {
    // Enriquecimento é ganho, não requisito: uma falha aqui não pode impedir
    // a compra de ser registrada nem o Purchase de ser disparado.
    return NOTHING
  }
}

/**
 * Adianta a fila de um visitante e drena o que venceu.
 *
 * Usado depois do enriquecimento: o motivo do atraso já aconteceu, então não
 * há razão pra esperar o resto da janela.
 */
export async function flushAndDrain(trckUserId: string): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.rpc("flush_visitor_events", { p_trck_user_id: trckUserId })

    const { drainEventQueue } = await import("./event-dispatch")
    await drainEventQueue(50)
  } catch {
    // Sem isto os eventos saem no tique normal do cron, ainda dentro da
    // janela. Nunca pode derrubar o webhook.
  }
}
