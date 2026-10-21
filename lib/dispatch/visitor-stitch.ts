import "server-only"

import type { createServiceClient } from "@/lib/supabase/service"

/**
 * Costura de identidade: o mesmo navegador com dois `trck_user_id`.
 *
 * Acontece quando o cookie de identidade não atravessa um subdomínio (cookie
 * bloqueado, host-only antigo, tag do GTM carregando antes do cookie) — a LP
 * fica com um id e o questionário com outro. O disparo lê a PII só pelo id do
 * evento, então os eventos de um lado saíam anônimos mesmo com a pessoa
 * identificada do outro.
 *
 * O elo é o `_fbp` e o `_ga`: cookies de domínio amplo, por navegador, que os
 * dois lados enviam no identify. Quando um lado tem PII e o outro não, ela é
 * copiada por `fill_visitor_pii` (só preenche buraco, nunca sobrescreve).
 * Não une as linhas nem troca o id de evento nenhum: só completa o que falta.
 */

type Supabase = ReturnType<typeof createServiceClient>

export type StitchSource = {
  trck_user_id: string
  email: string | null
  email_hash: string | null
  phone_hash: string | null
  first_name_hash: string | null
  last_name_hash: string | null
  fbp: string | null
  ga_client_id: string | null
}

const COLUNAS =
  "trck_user_id,email,email_hash,phone_hash,first_name_hash,last_name_hash,fbp,ga_client_id"

/** Teto de irmãos: um `_fbp` compartilhado por centenas de linhas é sinal de dado ruim. */
const MAX_IRMAOS = 10

function temPii(v: StitchSource): boolean {
  return Boolean(v.email_hash || v.phone_hash)
}

async function irmaos(supabase: Supabase, v: StitchSource): Promise<StitchSource[]> {
  const consultas = []
  if (v.fbp) {
    consultas.push(
      supabase.from("visitors").select(COLUNAS).eq("fbp", v.fbp)
        .neq("trck_user_id", v.trck_user_id).limit(MAX_IRMAOS + 1)
    )
  }
  if (v.ga_client_id) {
    consultas.push(
      supabase.from("visitors").select(COLUNAS).eq("ga_client_id", v.ga_client_id)
        .neq("trck_user_id", v.trck_user_id).limit(MAX_IRMAOS + 1)
    )
  }

  const porId = new Map<string, StitchSource>()
  for (const { data } of await Promise.all(consultas)) {
    for (const row of (data ?? []) as StitchSource[]) porId.set(row.trck_user_id, row)
  }
  return porId.size > MAX_IRMAOS ? [] : Array.from(porId.values())
}

async function preencher(supabase: Supabase, alvo: string, de: StitchSource): Promise<boolean> {
  const { data, error } = await supabase.rpc("fill_visitor_pii", {
    p_trck_user_id: alvo,
    p_email: de.email,
    p_email_hash: de.email_hash,
    p_phone_hash: de.phone_hash,
    p_first_name_hash: de.first_name_hash,
    p_last_name_hash: de.last_name_hash,
    p_postal_code: null,
  })
  return !error && Array.isArray(data) && data.length > 0
}

/**
 * Devolve os ids que ganharam PII agora (cuja fila vale adiantar). Falha
 * silenciosa: a costura é ganho, nunca pode derrubar o identify.
 */
export async function stitchVisitor(
  supabase: Supabase,
  visitante: StitchSource
): Promise<string[]> {
  try {
    if (!visitante.fbp && !visitante.ga_client_id) return []
    const lista = await irmaos(supabase, visitante)
    if (lista.length === 0) return []

    if (temPii(visitante)) {
      const alvos = lista.filter(
        (irmao) =>
          !irmao.email_hash || !irmao.phone_hash ||
          !irmao.first_name_hash || !irmao.last_name_hash
      )
      const feitos = await Promise.all(
        alvos.map(async (irmao) =>
          (await preencher(supabase, irmao.trck_user_id, visitante)) ? irmao.trck_user_id : null
        )
      )
      return feitos.filter((id): id is string => id !== null)
    }

    const fonte = lista.find(temPii)
    if (!fonte) return []
    return (await preencher(supabase, visitante.trck_user_id, fonte))
      ? [visitante.trck_user_id]
      : []
  } catch {
    return []
  }
}
