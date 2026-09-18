import "server-only"

import { createClient } from "@/lib/supabase/server"
import {
  PAGE_SIZE,
  periodoInicio,
  type LeadFilters,
} from "@/lib/dashboard/leads-filters"
import { parseUserAgent, type DeviceInfo } from "@/lib/dashboard/user-agent"
import type { PurchaseStatus } from "@/lib/webhooks/adapters/types"

/**
 * Leitura da tela de Leads.
 *
 * Mesma base de Eventos (`lib/dashboard/events.ts`): cliente SSR (anon +
 * cookies), sob RLS — `visitors` e `purchases` têm `select using (true)` para
 * `authenticated` desde a fase 2. NÃO usar `createServiceClient()` aqui.
 *
 * `receita` desta tela NÃO é o total de vendas: uma compra sem visitante
 * casado (`purchases.match_found = false`, `trck_user_id = null`) nunca
 * aparece aqui, porque a consulta parte de `visitors`. O total de verdade é
 * da tela de Faturamento (fase 8b, ainda não construída) — não "conserte"
 * uma divergência entre as duas comparando-as.
 */

// ---------------------------------------------------------------------------
// Condições de filtro como dados — mesmo motivo de `lib/dashboard/events.ts`:
// passar o query builder do Supabase por uma função genérica faz o TypeScript
// estourar em "type instantiation is excessively deep and possibly infinite".
// Aqui, diferente de Eventos, também existe filtro de nulidade e de
// pertencimento a uma lista, então a aplicação é por `if/else` explícito (sem
// acesso indexado `q[c.op]`, que não tipa bem quando os operadores esperam
// argumentos de formatos diferentes).
// ---------------------------------------------------------------------------
type Condicao =
  | { op: "gte"; coluna: string; valor: string }
  | { op: "eq"; coluna: string; valor: string }
  | { op: "or"; filtro: string }
  | { op: "is-null"; coluna: string }
  | { op: "not-null"; coluna: string }
  | { op: "in"; coluna: string; valores: string[] }
  | { op: "not-in"; coluna: string; valores: string[] }

function condicoesDe(filtros: LeadFilters, idsComCompra?: string[]): Condicao[] {
  const cond: Condicao[] = []

  const inicio = periodoInicio(filtros.periodo)
  if (inicio) cond.push({ op: "gte", coluna: "created_at", valor: inicio.toISOString() })

  if (filtros.identificado === "sim") cond.push({ op: "not-null", coluna: "identified_at" })
  if (filtros.identificado === "nao") cond.push({ op: "is-null", coluna: "identified_at" })

  if (filtros.q) {
    // Tira o que o PostgREST usaria como separador dentro do `or(...)`.
    const termo = filtros.q.replace(/[(),*]/g, "")
    if (termo) {
      cond.push({ op: "or", filtro: `email.ilike.*${termo}*,trck_user_id.ilike.*${termo}*` })
    }
  }

  if (filtros.converteu !== "todos" && idsComCompra) {
    cond.push({
      op: filtros.converteu === "sim" ? "in" : "not-in",
      coluna: "trck_user_id",
      valores: idsComCompra.length ? idsComCompra : ["__nenhum__"],
    })
  }

  return cond
}

/**
 * IDs de visitante com pelo menos uma compra — só quando o filtro "converteu"
 * está ativo. Mesmo teto de 20k já aceito em `getStatusCounts`/`getSerieDiaria`
 * de `events.ts`: um scan limitado em vez de uma view/RPC nova.
 */
async function idsComCompra(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string[]> {
  const { data, error } = await supabase
    .from("purchases")
    .select("trck_user_id")
    .not("trck_user_id", "is", null)
    .limit(20_000)

  if (error || !data) return []

  return [
    ...new Set((data as { trck_user_id: string | null }[]).map((r) => r.trck_user_id as string)),
  ]
}

export type LeadRow = {
  trckUserId: string
  email: string | null
  identifiedAt: string | null
  utmSource: string | null
  utmCampaign: string | null
  geoCountry: string | null
  geoRegion: string | null
  geoCity: string | null
  createdAt: string
  totalCompras: number
  valorAprovado: number
}

const COLUNAS_LISTA: string =
  "trck_user_id,email,identified_at,utm_source,utm_campaign,geo_country,geo_region,geo_city,created_at,purchases(amount,status)"

type RawListRow = {
  trck_user_id: string
  email: string | null
  identified_at: string | null
  utm_source: string | null
  utm_campaign: string | null
  geo_country: string | null
  geo_region: string | null
  geo_city: string | null
  created_at: string
  purchases: { amount: number; status: PurchaseStatus }[] | null
}

function mapearLinha(row: RawListRow): LeadRow {
  const compras = row.purchases ?? []

  return {
    trckUserId: row.trck_user_id,
    email: row.email,
    identifiedAt: row.identified_at,
    utmSource: row.utm_source,
    utmCampaign: row.utm_campaign,
    geoCountry: row.geo_country,
    geoRegion: row.geo_region,
    geoCity: row.geo_city,
    createdAt: row.created_at,
    totalCompras: compras.length,
    valorAprovado: compras
      .filter((c) => c.status === "approved")
      .reduce((soma, c) => soma + c.amount, 0),
  }
}

export async function listLeads(filtros: LeadFilters): Promise<{
  rows: LeadRow[]
  total: number
  error: string | null
}> {
  const supabase = await createClient()

  const ids = filtros.converteu !== "todos" ? await idsComCompra(supabase) : undefined

  const de = (filtros.pagina - 1) * PAGE_SIZE

  let q = supabase.from("visitors").select(COLUNAS_LISTA, { count: "exact" })
  for (const c of condicoesDe(filtros, ids)) {
    if (c.op === "or") q = q.or(c.filtro)
    else if (c.op === "is-null") q = q.is(c.coluna, null)
    else if (c.op === "not-null") q = q.not(c.coluna, "is", null)
    else if (c.op === "in") q = q.in(c.coluna, c.valores)
    else if (c.op === "not-in") q = q.not(c.coluna, "in", `(${c.valores.join(",")})`)
    else q = q[c.op](c.coluna, c.valor)
  }

  const { data, count, error } = await q
    .order("created_at", { ascending: false })
    .range(de, de + PAGE_SIZE - 1)

  if (error) return { rows: [], total: 0, error: error.message }

  return {
    rows: ((data ?? []) as unknown as RawListRow[]).map(mapearLinha),
    total: count ?? 0,
    error: null,
  }
}

export type LeadPurchaseRow = {
  id: string
  transactionId: string
  productName: string | null
  amount: number
  currency: string
  status: PurchaseStatus
  platform: string
  createdAt: string
}

export type LeadDetail = {
  trckUserId: string
  email: string | null
  identifiedAt: string | null
  createdAt: string
  updatedAt: string
  utm: {
    source: string | null
    medium: string | null
    campaign: string | null
    term: string | null
    content: string | null
    referrer: string | null
  }
  geo: {
    country: string | null
    region: string | null
    city: string | null
    postalCode: string | null
    latitude: number | null
    longitude: number | null
    timezone: string | null
    ip: string | null
  }
  device: DeviceInfo | null
  ga: {
    clientId: string | null
    sessionId: string | null
    sessionNumber: number | null
    sessionStartedAt: string | null
  }
  /** null = não há compra com o dado preenchido; só o hash existe. */
  name: { first: string | null; last: string | null } | null
  phone: string | null
  purchases: LeadPurchaseRow[]
  totals: { count: number; lifetimeValue: number; approvedValue: number; currency: string }
}

const COLUNAS_VISITANTE =
  "trck_user_id,email,identified_at,created_at,updated_at,utm_source,utm_medium,utm_campaign,utm_term,utm_content,referrer,ip,user_agent,geo_country,geo_region,geo_city,geo_postal_code,geo_latitude,geo_longitude,geo_timezone,ga_client_id,ga_session_id,ga_session_number,ga_session_started_at"

const COLUNAS_COMPRAS =
  "id,transaction_id,product_name,amount,currency,status,platform,created_at,buyer_first_name,buyer_last_name,buyer_phone"

type RawCompraRow = {
  id: string
  transaction_id: string
  product_name: string | null
  amount: number
  currency: string
  status: PurchaseStatus
  platform: string
  created_at: string
  buyer_first_name: string | null
  buyer_last_name: string | null
  buyer_phone: string | null
}

export async function getLeadDetail(trckUserId: string): Promise<LeadDetail | null> {
  const supabase = await createClient()

  const [{ data: visitante, error: erroVisitante }, { data: comprasData, error: erroCompras }] =
    await Promise.all([
      supabase.from("visitors").select(COLUNAS_VISITANTE).eq("trck_user_id", trckUserId).maybeSingle(),
      supabase
        .from("purchases")
        .select(COLUNAS_COMPRAS)
        .eq("trck_user_id", trckUserId)
        .order("created_at", { ascending: false }),
    ])

  if (erroVisitante || !visitante) return null

  const comprasRaw = (erroCompras ? [] : (comprasData ?? [])) as unknown as RawCompraRow[]

  // A compra mais recente que efetivamente tem nome ou telefone em texto puro
  // "ganha" — não filtra por status: mesmo uma compra reembolsada pode ter o
  // dado. Compras anteriores à migration ficam sempre null aqui (sem backfill
  // de `raw_webhook`, formato por-plataforma, frágil de reprocessar em massa).
  const comPii = comprasRaw.find((c) => c.buyer_first_name || c.buyer_phone)

  const purchases: LeadPurchaseRow[] = comprasRaw.map((c) => ({
    id: c.id,
    transactionId: c.transaction_id,
    productName: c.product_name,
    amount: c.amount,
    currency: c.currency,
    status: c.status,
    platform: c.platform,
    createdAt: c.created_at,
  }))

  const currency = comprasRaw[0]?.currency ?? "BRL"

  return {
    trckUserId: visitante.trck_user_id as string,
    email: visitante.email as string | null,
    identifiedAt: visitante.identified_at as string | null,
    createdAt: visitante.created_at as string,
    updatedAt: visitante.updated_at as string,
    utm: {
      source: visitante.utm_source as string | null,
      medium: visitante.utm_medium as string | null,
      campaign: visitante.utm_campaign as string | null,
      term: visitante.utm_term as string | null,
      content: visitante.utm_content as string | null,
      referrer: visitante.referrer as string | null,
    },
    geo: {
      country: visitante.geo_country as string | null,
      region: visitante.geo_region as string | null,
      city: visitante.geo_city as string | null,
      postalCode: visitante.geo_postal_code as string | null,
      latitude: visitante.geo_latitude as number | null,
      longitude: visitante.geo_longitude as number | null,
      timezone: visitante.geo_timezone as string | null,
      ip: visitante.ip as string | null,
    },
    device: parseUserAgent(visitante.user_agent as string | null),
    ga: {
      clientId: visitante.ga_client_id as string | null,
      sessionId: visitante.ga_session_id as string | null,
      sessionNumber: visitante.ga_session_number as number | null,
      sessionStartedAt: visitante.ga_session_started_at as string | null,
    },
    name: comPii ? { first: comPii.buyer_first_name, last: comPii.buyer_last_name } : null,
    phone: comPii?.buyer_phone ?? null,
    purchases,
    totals: {
      count: purchases.length,
      lifetimeValue: purchases.reduce((soma, p) => soma + p.amount, 0),
      approvedValue: purchases
        .filter((p) => p.status === "approved")
        .reduce((soma, p) => soma + p.amount, 0),
      currency,
    },
  }
}
