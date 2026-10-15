import "server-only"

import { createClient } from "@/lib/supabase/server"
import { lerTudo } from "@/lib/dashboard/ler-tudo"
import {
  PAGE_SIZE,
  diasDoPeriodo,
  periodoIntervalo,
  type DispatchStatus,
  type EventFilters,
  type SeriePonto,
} from "@/lib/dashboard/filters"
import { diaLocal } from "@/lib/dashboard/timezone"

/**
 * Leitura da tela de Eventos.
 *
 * Usa o cliente SSR (anon + cookies), ou seja, passa por RLS com a sessão do
 * usuário. `events_log`, `visitors` e `purchases` têm `select using (true)`
 * para `authenticated` desde a fase 2. NÃO usar `createServiceClient()` aqui:
 * ele existe para a captura (que não tem sessão) e para as tabelas de
 * credencial (que de propósito não têm policy de SELECT nenhuma).
 *
 * As constantes e tipos dos filtros ficam em `./filters`, que não é
 * server-only — é de lá que o Client Component da barra de filtros importa.
 */

export type EventRow = {
  id: string
  eventName: string
  eventId: string
  trckUserId: string | null
  eventTime: string
  dispatchStatus: DispatchStatus
  dispatchAttempts: number
  dispatchAfter: string
  dispatchedAt: string | null
  dispatchError: string | null
  pixelFired: boolean
  utmSource: string | null
  utmCampaign: string | null
  geoCity: string | null
  geoRegion: string | null
  geoCountry: string | null
  sourceUrl: string | null
  visitorEmail: string | null
  visitorIdentifiedAt: string | null
}

/**
 * Recorte comum às três consultas, devolvido como DADOS — não como uma função
 * que transforma o query builder.
 *
 * Isso não é preciosismo. A primeira versão era um helper genérico sobre o
 * builder (`function aplicar<T extends {gte,eq,or}>(q: T)`), e o TypeScript
 * estourava com "type instantiation is excessively deep and possibly
 * infinite": casar o tipo enorme do PostgrestFilterBuilder contra o constraint
 * recursa sem fim. O erro aponta para a linha do `.select()`, o que faz
 * parecer que o problema é a string de colunas — não é; com `select("*")`
 * acontece igual. Devolvendo condições simples e aplicando-as com um `for` no
 * lugar de uso, o builder nunca passa por um genérico nosso e o checker fica
 * quieto, sem `any` e sem repetir a regra de filtro em três lugares.
 */
type Condicao =
  | { op: "gte" | "lt" | "eq"; coluna: string; valor: string }
  | { op: "or"; filtro: string }

function condicoesDe(
  filtros: EventFilters,
  { ignorarStatus = false } = {}
): Condicao[] {
  const cond: Condicao[] = []

  const { inicio, fim } = periodoIntervalo(filtros.periodo)
  if (inicio) cond.push({ op: "gte", coluna: "event_time", valor: inicio.toISOString() })
  if (fim) cond.push({ op: "lt", coluna: "event_time", valor: fim.toISOString() })

  if (filtros.evento) cond.push({ op: "eq", coluna: "event_name", valor: filtros.evento })
  if (filtros.status && !ignorarStatus) {
    cond.push({ op: "eq", coluna: "dispatch_status", valor: filtros.status })
  }

  if (filtros.q) {
    // Tira o que o PostgREST usaria como separador dentro do `or(...)`.
    const termo = filtros.q.replace(/[(),*]/g, "")
    if (termo) {
      cond.push({ op: "or", filtro: `event_id.ilike.*${termo}*,trck_user_id.ilike.*${termo}*` })
    }
  }

  return cond
}

/**
 * Lista explícita para NÃO trazer os 4 jsonb pesados na listagem — eles só
 * carregam quando o modal de um evento abre.
 *
 * Anotada como `string` e não como literal: o postgrest-js analisaria a
 * string em tempo de compilação para inferir o formato do retorno, e não há
 * o que ganhar com isso aqui, já que o tipo real é fixado por `RawRow` e
 * `mapear` logo abaixo. Mesma razão pela qual `lib/settings/queries.ts` não
 * monta select dinâmico.
 */
const COLUNAS: string =
  "id,event_name,event_id,trck_user_id,event_time,dispatch_status,dispatch_attempts,dispatch_after,dispatched_at,dispatch_error,pixel_fired,utm_source,utm_campaign,geo_country,geo_region,geo_city,event_source_url,visitors(email,identified_at)"

type RawRow = {
  id: string
  event_name: string
  event_id: string
  trck_user_id: string | null
  event_time: string
  dispatch_status: DispatchStatus
  dispatch_attempts: number
  dispatch_after: string
  dispatched_at: string | null
  dispatch_error: string | null
  pixel_fired: boolean
  utm_source: string | null
  utm_campaign: string | null
  geo_country: string | null
  geo_region: string | null
  geo_city: string | null
  event_source_url: string | null
  visitors: { email: string | null; identified_at: string | null } | null
}

function mapear(row: RawRow): EventRow {
  return {
    id: row.id,
    eventName: row.event_name,
    eventId: row.event_id,
    trckUserId: row.trck_user_id,
    eventTime: row.event_time,
    dispatchStatus: row.dispatch_status,
    dispatchAttempts: row.dispatch_attempts,
    dispatchAfter: row.dispatch_after,
    dispatchedAt: row.dispatched_at,
    dispatchError: row.dispatch_error,
    pixelFired: row.pixel_fired,
    utmSource: row.utm_source,
    utmCampaign: row.utm_campaign,
    geoCountry: row.geo_country,
    geoRegion: row.geo_region,
    geoCity: row.geo_city,
    sourceUrl: row.event_source_url,
    visitorEmail: row.visitors?.email ?? null,
    visitorIdentifiedAt: row.visitors?.identified_at ?? null,
  }
}

export async function listEvents(filtros: EventFilters): Promise<{
  rows: EventRow[]
  total: number
  error: string | null
  /**
   * O "agora" do servidor no instante da consulta. Vem daqui porque o lint do
   * React 19 recusa `Date.now()` dentro de um componente
   * (`react-hooks/purity`), e a tabela precisa dele para dizer quanto falta
   * para um evento pendente sair.
   */
  agoraMs: number
}> {
  const supabase = await createClient()

  const de = (filtros.pagina - 1) * PAGE_SIZE

  let q = supabase.from("events_log").select(COLUNAS, { count: "exact" })
  for (const c of condicoesDe(filtros)) {
    q = c.op === "or"
      ? q.or(c.filtro)
      : c.op === "lt"
        ? q.lt(c.coluna, c.valor)
        : q[c.op](c.coluna, c.valor)
  }

  const { data, count, error } = await q
    .order("event_time", { ascending: false })
    .range(de, de + PAGE_SIZE - 1)

  const agoraMs = Date.now()

  if (error) return { rows: [], total: 0, error: error.message, agoraMs }

  return {
    rows: ((data ?? []) as unknown as RawRow[]).map(mapear),
    total: count ?? 0,
    error: null,
    agoraMs,
  }
}

/**
 * Contagem por status, respeitando todos os filtros MENOS o de status — senão
 * os chips só mostrariam o que já está selecionado e deixariam de servir como
 * navegação.
 */
export async function getStatusCounts(
  filtros: EventFilters
): Promise<Record<DispatchStatus, number> & { total: number }> {
  const supabase = await createClient()

  const resultado = {
    pending: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    total: 0,
  }

  // Uma contagem exata no banco por status (`head: true` não traz linha
  // nenhuma). Ler as linhas e contar em JS esbarrava no teto de 1.000 do
  // PostgREST e os chips travavam nesse número.
  const status = Object.keys(resultado).filter((k) => k !== "total") as DispatchStatus[]

  const contagens = await Promise.all(
    status.map(async (s) => {
      let q = supabase
        .from("events_log")
        .select("id", { count: "exact", head: true })
        .eq("dispatch_status", s)
      for (const c of condicoesDe(filtros, { ignorarStatus: true })) {
        q = c.op === "or"
          ? q.or(c.filtro)
          : c.op === "lt"
            ? q.lt(c.coluna, c.valor)
            : q[c.op](c.coluna, c.valor)
      }
      const { count, error } = await q
      return error ? null : (count ?? 0)
    })
  )

  // Qualquer falha: zera tudo, como antes, em vez de mostrar um total parcial.
  if (contagens.some((n) => n === null)) return resultado

  status.forEach((s, i) => {
    resultado[s] = contagens[i] as number
    resultado.total += contagens[i] as number
  })

  return resultado
}

/**
 * Série diária para o gráfico.
 *
 * A agregação é feita aqui e não em SQL porque uma função de agregação exigiria
 * uma migration nova (que neste projeto é aplicada à mão no SQL Editor), e não
 * vale travar a tela nisso. Só duas colunas são trazidas, lidas em páginas
 * (`lerTudo`): `.limit(N)` sozinho trazia só as 1.000 primeiras. Se o volume
 * passar do teto de `ler-tudo.ts`, o certo é uma RPC.
 */
export async function getSerieDiaria(filtros: EventFilters): Promise<SeriePonto[]> {
  const supabase = await createClient()

  const { linhas, error } = await lerTudo<{ event_time: string; dispatch_status: DispatchStatus }>(
    (de, ate) => {
      let q = supabase.from("events_log").select("event_time,dispatch_status")
      for (const c of condicoesDe(filtros)) {
        q = c.op === "or"
          ? q.or(c.filtro)
          : c.op === "lt"
            ? q.lt(c.coluna, c.valor)
            : q[c.op](c.coluna, c.valor)
      }
      return q.order("id").range(de, ate)
    }
  )

  if (error) return []

  const porDia = new Map<string, SeriePonto>()

  // Preenche o intervalo inteiro antes, para que um dia sem evento apareça como
  // zero em vez de sumir e encurtar o gráfico.
  //
  // Os baldes são dias do FUSO DO PAINEL, não dias UTC. Com
  // `toISOString().slice(0,10)` — como era antes — um evento das 22h em
  // Brasília caía no balde do dia seguinte, enquanto a mesma linha na tabela
  // aparecia com a data de hoje.
  for (const chave of diasDoPeriodo(filtros.periodo) ?? []) {
    porDia.set(chave, { dia: chave, enviados: 0, outros: 0 })
  }

  for (const row of linhas) {
    const chave = diaLocal(row.event_time)
    const ponto = porDia.get(chave) ?? { dia: chave, enviados: 0, outros: 0 }
    if (row.dispatch_status === "sent") ponto.enviados += 1
    else ponto.outros += 1
    porDia.set(chave, ponto)
  }

  return [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia))
}

/** Nomes de evento que existem no banco, para montar o filtro. */
export async function getEventNames(): Promise<string[]> {
  const supabase = await createClient()

  // O PostgREST devolve no máximo 1.000 linhas por requisição, então a lista é
  // lida em páginas. Com `.limit(20_000)` só vinham as 1.000 primeiras e eventos
  // mais raros (Purchase) ficavam fora do filtro.
  const nomes = new Set<string>(EVENTOS_DO_FUNIL)
  const PAGINA = 1000

  for (let de = 0; de < 20_000; de += PAGINA) {
    const { data, error } = await supabase
      .from("events_log")
      .select("event_name")
      .order("id")
      .range(de, de + PAGINA - 1)

    if (error || !data) break
    for (const r of data as { event_name: string }[]) nomes.add(r.event_name)
    if (data.length < PAGINA) break
  }

  return [...nomes].sort()
}

/** Etapas do funil sempre disponíveis no filtro, mesmo antes de o primeiro evento chegar. */
const EVENTOS_DO_FUNIL = [
  "PageView",
  "ViewContent",
  "CustomizeProduct",
  "Lead",
  "CompleteRegistration",
  "SubmitApplication",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
]

export type Localizacao = {
  country: string | null
  region: string | null
  city: string | null
  postalCode: string | null
  latitude: number | null
  longitude: number | null
  /** Fuso IANA do visitante, para exibir o horário no relógio DELE. */
  timezone: string | null
}

export type EventDetail = {
  eventId: string
  eventName: string
  eventTime: string
  createdAt: string
  actionSource: string
  sourceUrl: string | null
  /** Onde o visitante estava no instante DESTE evento. */
  local: Localizacao
  customData: unknown
  payloadMeta: unknown
  responseMeta: unknown
  payloadGa4: unknown
  responseGa4: unknown
  /** True quando o evento é velho o bastante para a retenção já ter zerado os jsonb. */
  purgado: boolean
}

const DIAS_DE_RETENCAO = 14

/**
 * Os 4 jsonb pesados, buscados só quando o modal abre — trazê-los na listagem
 * inflaria a resposta de 50 linhas sem necessidade.
 */
export async function getEventDetail(id: string): Promise<EventDetail | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("events_log")
    .select(
      "event_id,event_name,event_time,created_at,action_source,event_source_url,geo_country,geo_region,geo_city,geo_postal_code,geo_latitude,geo_longitude,geo_timezone,custom_data,payload_meta,response_meta,payload_ga4,response_ga4"
    )
    .eq("id", id)
    .maybeSingle()

  if (error || !data) return null

  const idade = Date.now() - new Date(data.created_at as string).getTime()

  return {
    eventId: data.event_id as string,
    eventName: data.event_name as string,
    eventTime: data.event_time as string,
    createdAt: data.created_at as string,
    actionSource: data.action_source as string,
    sourceUrl: data.event_source_url as string | null,
    local: {
      country: data.geo_country as string | null,
      region: data.geo_region as string | null,
      city: data.geo_city as string | null,
      postalCode: data.geo_postal_code as string | null,
      latitude: data.geo_latitude as number | null,
      longitude: data.geo_longitude as number | null,
      timezone: data.geo_timezone as string | null,
    },
    customData: data.custom_data,
    payloadMeta: data.payload_meta,
    responseMeta: data.response_meta,
    payloadGa4: data.payload_ga4,
    responseGa4: data.response_ga4,
    purgado: data.payload_meta === null && idade > DIAS_DE_RETENCAO * 86_400_000,
  }
}
