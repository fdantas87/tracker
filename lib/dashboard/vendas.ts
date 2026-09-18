import "server-only"

import { createClient } from "@/lib/supabase/server"
import {
  PAGE_SIZE,
  PAGAMENTO_LABELS,
  PAGAMENTO_NAO_INFORMADO,
  periodoInicio,
  type VendaFilters,
} from "@/lib/dashboard/vendas-filters"
import { parseUserAgent, type DeviceInfo } from "@/lib/dashboard/user-agent"
import type { PaymentMethod, PurchaseStatus } from "@/lib/webhooks/adapters/types"

/**
 * Leitura da tela de Vendas.
 *
 * Cliente SSR (anon + cookies), sob RLS — `purchases` tem
 * `select using (true)` para `authenticated` desde a fase 2. NÃO usar
 * `createServiceClient()` aqui: aquele padrão é de `lib/settings/queries.ts`, e
 * existe porque as tabelas de credencial não têm policy de SELECT nenhuma.
 *
 * ESTA é a tela do total de vendas, diferente da de Leads: a consulta parte de
 * `purchases`, então compra sem visitante casado (`match_found = false`)
 * aparece aqui e não lá. Os dois números divergirem é o comportamento correto —
 * ver o cabeçalho de `lib/dashboard/leads.ts`.
 */

/**
 * Teto do scan de agregação, igual ao de `events.ts`. A alternativa seria uma
 * função de agregação no Postgres, que exigiria migration nova aplicada à mão
 * no SQL Editor; quando o volume passar disso, o certo é virar RPC. Até lá, o
 * resumo devolve `truncado` para a tela poder dizer que o número está parcial
 * em vez de mentir com um total errado.
 */
const TETO_AGREGACAO = 20_000

// ---------------------------------------------------------------------------
// Condições de filtro como dados.
//
// Mesmo motivo de `events.ts` e `leads.ts`: passar o query builder do Supabase
// por uma função genérica faz o TypeScript estourar em "type instantiation is
// excessively deep and possibly infinite" — e o erro aponta para a linha do
// `.select()`, o que faz parecer que o culpado é a string de colunas.
// ---------------------------------------------------------------------------
type Condicao =
  | { op: "gte"; coluna: string; valor: string }
  | { op: "eq"; coluna: string; valor: string }
  | { op: "or"; filtro: string }
  | { op: "is-null"; coluna: string }
  | { op: "not-null"; coluna: string }

function condicoesDe(
  filtros: VendaFilters,
  { ignorarStatus = false } = {}
): Condicao[] {
  const cond: Condicao[] = []

  const inicio = periodoInicio(filtros.periodo)
  if (inicio) cond.push({ op: "gte", coluna: "created_at", valor: inicio.toISOString() })

  if (!ignorarStatus && filtros.status) {
    cond.push({ op: "eq", coluna: "status", valor: filtros.status })
  }

  if (filtros.pagamento === "nao_informado") {
    cond.push({ op: "is-null", coluna: "payment_method" })
  } else if (filtros.pagamento) {
    cond.push({ op: "eq", coluna: "payment_method", valor: filtros.pagamento })
  }

  if (filtros.q) {
    // Tira o que o PostgREST usaria como separador dentro do `or(...)`.
    const termo = filtros.q.replace(/[(),*]/g, "")
    if (termo) {
      cond.push({
        op: "or",
        filtro: [
          `email.ilike.*${termo}*`,
          `transaction_id.ilike.*${termo}*`,
          `product_name.ilike.*${termo}*`,
          `buyer_first_name.ilike.*${termo}*`,
          `buyer_last_name.ilike.*${termo}*`,
        ].join(","),
      })
    }
  }

  return cond
}

export type PagamentoChave = PaymentMethod | "nao_informado"

export type FatiaPagamento = {
  chave: PagamentoChave
  label: string
  valor: number
  quantidade: number
}

export type VendasResumo = {
  /** Moeda predominante no recorte; a tela avisa quando há mais de uma. */
  moeda: string
  moedasMultiplas: boolean
  faturamento: number
  aprovadas: number
  ticketMedio: number
  reembolsado: number
  reembolsadas: number
  chargeback: number
  chargebacks: number
  porPagamento: FatiaPagamento[]
  truncado: boolean
  error: string | null
}

type RawResumoRow = {
  amount: number
  currency: string
  status: PurchaseStatus
  payment_method: PaymentMethod | null
}

/**
 * As quatro formas canônicas aparecem SEMPRE, mesmo zeradas: é o vocabulário da
 * tela, e vê-lo completo responde "não vendi no Pix" em vez de deixar a dúvida
 * entre "não vendi" e "a tela não sabe sobre Pix".
 *
 * `nao_informado` é a exceção e só entra quando tem volume — ela não é uma forma
 * de pagamento, é a ausência do dado, e mostrá-la zerada por padrão sugeriria um
 * problema onde não há nenhum.
 */
const ORDEM_PAGAMENTO: PagamentoChave[] = ["credit_card", "pix", "billet", "other"]

function rotuloPagamento(chave: PagamentoChave): string {
  return chave === "nao_informado" ? PAGAMENTO_NAO_INFORMADO : PAGAMENTO_LABELS[chave]
}

function fatiasVazias(): FatiaPagamento[] {
  return ORDEM_PAGAMENTO.map((chave) => ({
    chave,
    label: rotuloPagamento(chave),
    valor: 0,
    quantidade: 0,
  }))
}

/**
 * O que a tela mostra quando não há nada a somar — inclusive quando a leitura
 * falhou. Zerado e completo, nunca vazio: ver a nota sobre erro em
 * `getVendasResumo`.
 */
const RESUMO_VAZIO: Omit<VendasResumo, "error" | "porPagamento"> = {
  moeda: "BRL",
  moedasMultiplas: false,
  faturamento: 0,
  aprovadas: 0,
  ticketMedio: 0,
  reembolsado: 0,
  reembolsadas: 0,
  chargeback: 0,
  chargebacks: 0,
  truncado: false,
}

/**
 * Os números do topo da tela.
 *
 * IGNORA o filtro de status, e só ele — mesma decisão dos chips de contagem da
 * tela de Eventos. Se o status entrasse aqui, escolher "Reembolsadas" zeraria o
 * card de faturamento e os cards deixariam de servir como panorama.
 *
 * Agrega em JS a partir de um scan limitado, com quatro colunas só.
 *
 * EM CASO DE ERRO devolve o resumo ZERADO, com a mensagem no campo `error`. A
 * tela renderiza os cards em R$ 0,00 e mostra o aviso numa faixa ao lado, em vez
 * de trocar a página inteira por um alerta vermelho. O `error` continua vindo
 * junto de propósito: num painel de vendas, "R$ 0,00" silencioso seria pior que
 * inútil — a pessoa não teria como distinguir "não vendi nada" de "a consulta
 * quebrou".
 */
export async function getVendasResumo(filtros: VendaFilters): Promise<VendasResumo> {
  const supabase = await createClient()

  let q = supabase.from("purchases").select("amount,currency,status,payment_method")
  for (const c of condicoesDe(filtros, { ignorarStatus: true })) {
    if (c.op === "or") q = q.or(c.filtro)
    else if (c.op === "is-null") q = q.is(c.coluna, null)
    else if (c.op === "not-null") q = q.not(c.coluna, "is", null)
    else q = q[c.op](c.coluna, c.valor)
  }

  const { data, error } = await q.limit(TETO_AGREGACAO)

  if (error) {
    return { ...RESUMO_VAZIO, porPagamento: fatiasVazias(), error: error.message }
  }

  const linhas = (data ?? []) as unknown as RawResumoRow[]

  // Somar moedas diferentes num total só seria simplesmente errado: R$ 100 e
  // US$ 100 não são 200 de nada. Agregamos por moeda e a tela mostra a
  // predominante, avisando quando o recorte mistura mais de uma.
  const porMoeda = new Map<string, number>()
  const porPagamento = new Map<PagamentoChave, FatiaPagamento>(
    fatiasVazias().map((fatia) => [fatia.chave, fatia])
  )

  let faturamento = 0
  let aprovadas = 0
  let reembolsado = 0
  let reembolsadas = 0
  let chargeback = 0
  let chargebacks = 0

  for (const linha of linhas) {
    const valor = Number(linha.amount) || 0

    if (linha.status === "approved") {
      faturamento += valor
      aprovadas += 1
      porMoeda.set(linha.currency, (porMoeda.get(linha.currency) ?? 0) + valor)

      // A quebra por forma de pagamento é de RECEITA CONFIRMADA: um boleto
      // gerado e não pago inflaria o "Boleto" e faria o gráfico descrever
      // intenção em vez de venda.
      const chave: PagamentoChave = linha.payment_method ?? "nao_informado"
      const fatia = porPagamento.get(chave) ?? {
        chave,
        label: rotuloPagamento(chave),
        valor: 0,
        quantidade: 0,
      }
      fatia.valor += valor
      fatia.quantidade += 1
      porPagamento.set(chave, fatia)
    } else if (linha.status === "refunded") {
      reembolsado += valor
      reembolsadas += 1
    } else if (linha.status === "chargeback") {
      chargeback += valor
      chargebacks += 1
    }
  }

  const moedas = [...porMoeda.entries()].sort((a, b) => b[1] - a[1])
  const naoInformado = porPagamento.get("nao_informado")

  return {
    moeda: moedas[0]?.[0] ?? "BRL",
    moedasMultiplas: moedas.length > 1,
    faturamento,
    aprovadas,
    ticketMedio: aprovadas ? faturamento / aprovadas : 0,
    reembolsado,
    reembolsadas,
    chargeback,
    chargebacks,
    // As 4 canônicas na ordem fixa, e "Não informado" no fim só se tiver volume.
    porPagamento: [
      ...ORDEM_PAGAMENTO.map((chave) => porPagamento.get(chave)).filter(
        (fatia): fatia is FatiaPagamento => Boolean(fatia)
      ),
      ...(naoInformado && naoInformado.quantidade > 0 ? [naoInformado] : []),
    ],
    truncado: linhas.length >= TETO_AGREGACAO,
    error: null,
  }
}

export type VendaRow = {
  id: string
  transactionId: string
  comprador: string | null
  email: string | null
  productName: string | null
  amount: number
  currency: string
  status: PurchaseStatus
  paymentMethod: PaymentMethod | null
  createdAt: string
  matchFound: boolean
}

/**
 * Anotada como `string` de propósito: sem isso o postgrest-js tenta inferir o
 * formato da linha a partir do literal e o TypeScript estoura em profundidade
 * de instanciação. O formato real é `RawVendaRow`, abaixo.
 */
const COLUNAS_LISTA: string =
  "id,transaction_id,email,buyer_first_name,buyer_last_name,product_name,amount,currency,status,payment_method,created_at,match_found"

type RawVendaRow = {
  id: string
  transaction_id: string
  email: string | null
  buyer_first_name: string | null
  buyer_last_name: string | null
  product_name: string | null
  amount: number
  currency: string
  status: PurchaseStatus
  payment_method: PaymentMethod | null
  created_at: string
  match_found: boolean
}

function nomeDe(row: { buyer_first_name: string | null; buyer_last_name: string | null }) {
  const nome = [row.buyer_first_name, row.buyer_last_name].filter(Boolean).join(" ")
  return nome || null
}

function mapearVenda(row: RawVendaRow): VendaRow {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    comprador: nomeDe(row),
    email: row.email,
    productName: row.product_name,
    amount: Number(row.amount) || 0,
    currency: row.currency,
    status: row.status,
    paymentMethod: row.payment_method,
    createdAt: row.created_at,
    matchFound: row.match_found,
  }
}

export async function listVendas(filtros: VendaFilters): Promise<{
  rows: VendaRow[]
  total: number
  error: string | null
}> {
  const supabase = await createClient()

  const de = (filtros.pagina - 1) * PAGE_SIZE

  let q = supabase.from("purchases").select(COLUNAS_LISTA, { count: "exact" })
  for (const c of condicoesDe(filtros)) {
    if (c.op === "or") q = q.or(c.filtro)
    else if (c.op === "is-null") q = q.is(c.coluna, null)
    else if (c.op === "not-null") q = q.not(c.coluna, "is", null)
    else q = q[c.op](c.coluna, c.valor)
  }

  const { data, count, error } = await q
    .order("created_at", { ascending: false })
    .range(de, de + PAGE_SIZE - 1)

  // Erro devolvido no objeto, nunca lançado: a tela mostra um Alert em vez de
  // quebrar inteira.
  if (error) return { rows: [], total: 0, error: error.message }

  return {
    rows: ((data ?? []) as unknown as RawVendaRow[]).map(mapearVenda),
    total: count ?? 0,
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Deep dive de uma venda
// ---------------------------------------------------------------------------

export type VendaOutra = {
  id: string
  productName: string | null
  amount: number
  currency: string
  status: PurchaseStatus
  createdAt: string
}

export type VendaDetail = {
  id: string
  transactionId: string
  status: PurchaseStatus
  platformStatus: string | null
  platform: string
  amount: number
  currency: string
  paymentMethod: PaymentMethod | null
  platformPaymentMethod: string | null
  productName: string | null
  productId: string | null
  createdAt: string
  updatedAt: string
  metaEventId: string | null
  /** O comprador como a plataforma o informou nesta transação. */
  comprador: {
    nome: string | null
    email: string | null
    telefone: string | null
  }
  utm: {
    source: string | null
    medium: string | null
    campaign: string | null
    term: string | null
    content: string | null
  }
  geo: { country: string | null; region: string | null; city: string | null }
  matchMethod: string | null
  matchFound: boolean
  /** null quando a venda não casou com nenhum visitante — estado esperado. */
  visitante: {
    trckUserId: string
    email: string | null
    identifiedAt: string | null
    createdAt: string
    device: DeviceInfo | null
    geo: {
      country: string | null
      region: string | null
      city: string | null
      postalCode: string | null
      timezone: string | null
      ip: string | null
    }
    utm: {
      source: string | null
      medium: string | null
      campaign: string | null
      referrer: string | null
    }
  } | null
  /** Outras compras do mesmo visitante, para dar contexto de LTV. */
  outrasCompras: VendaOutra[]
  totalCliente: { compras: number; aprovado: number }
}

const COLUNAS_DETALHE =
  "id,transaction_id,trck_user_id,email,buyer_first_name,buyer_last_name,buyer_phone,product_name,product_id,amount,currency,status,platform,platform_status,payment_method,platform_payment_method,utm_source,utm_medium,utm_campaign,utm_term,utm_content,geo_country,geo_region,geo_city,match_method,match_found,meta_event_id,created_at,updated_at"

const COLUNAS_VISITANTE_VENDA =
  "trck_user_id,email,identified_at,created_at,user_agent,ip,geo_country,geo_region,geo_city,geo_postal_code,geo_timezone,utm_source,utm_medium,utm_campaign,referrer"

export async function getVendaDetail(purchaseId: string): Promise<VendaDetail | null> {
  const supabase = await createClient()

  const { data: venda, error } = await supabase
    .from("purchases")
    .select(COLUNAS_DETALHE)
    .eq("id", purchaseId)
    .maybeSingle()

  if (error || !venda) return null

  const trckUserId = venda.trck_user_id as string | null

  // Só vai ao banco de novo quando há visitante casado. Venda sem vínculo é
  // estado esperado (ver a ordem de confiança em findVisitor no webhook), não
  // falha — a tela diz isso com todas as letras.
  const [visitanteRes, outrasRes] = await Promise.all([
    trckUserId
      ? supabase
          .from("visitors")
          .select(COLUNAS_VISITANTE_VENDA)
          .eq("trck_user_id", trckUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    trckUserId
      ? supabase
          .from("purchases")
          .select("id,product_name,amount,currency,status,created_at")
          .eq("trck_user_id", trckUserId)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: null, error: null }),
  ])

  const visitante = visitanteRes.data as Record<string, unknown> | null

  const todas = ((outrasRes.data ?? []) as unknown as {
    id: string
    product_name: string | null
    amount: number
    currency: string
    status: PurchaseStatus
    created_at: string
  }[]).map((c) => ({
    id: c.id,
    productName: c.product_name,
    amount: Number(c.amount) || 0,
    currency: c.currency,
    status: c.status,
    createdAt: c.created_at,
  }))

  return {
    id: venda.id as string,
    transactionId: venda.transaction_id as string,
    status: venda.status as PurchaseStatus,
    platformStatus: venda.platform_status as string | null,
    platform: venda.platform as string,
    amount: Number(venda.amount) || 0,
    currency: venda.currency as string,
    paymentMethod: venda.payment_method as PaymentMethod | null,
    platformPaymentMethod: venda.platform_payment_method as string | null,
    productName: venda.product_name as string | null,
    productId: venda.product_id as string | null,
    createdAt: venda.created_at as string,
    updatedAt: venda.updated_at as string,
    metaEventId: venda.meta_event_id as string | null,
    comprador: {
      nome: nomeDe({
        buyer_first_name: venda.buyer_first_name as string | null,
        buyer_last_name: venda.buyer_last_name as string | null,
      }),
      email: venda.email as string | null,
      telefone: venda.buyer_phone as string | null,
    },
    utm: {
      source: venda.utm_source as string | null,
      medium: venda.utm_medium as string | null,
      campaign: venda.utm_campaign as string | null,
      term: venda.utm_term as string | null,
      content: venda.utm_content as string | null,
    },
    geo: {
      country: venda.geo_country as string | null,
      region: venda.geo_region as string | null,
      city: venda.geo_city as string | null,
    },
    matchMethod: venda.match_method as string | null,
    matchFound: Boolean(venda.match_found),
    visitante: visitante
      ? {
          trckUserId: visitante.trck_user_id as string,
          email: visitante.email as string | null,
          identifiedAt: visitante.identified_at as string | null,
          createdAt: visitante.created_at as string,
          device: parseUserAgent(visitante.user_agent as string | null),
          geo: {
            country: visitante.geo_country as string | null,
            region: visitante.geo_region as string | null,
            city: visitante.geo_city as string | null,
            postalCode: visitante.geo_postal_code as string | null,
            timezone: visitante.geo_timezone as string | null,
            ip: visitante.ip as string | null,
          },
          utm: {
            source: visitante.utm_source as string | null,
            medium: visitante.utm_medium as string | null,
            campaign: visitante.utm_campaign as string | null,
            referrer: visitante.referrer as string | null,
          },
        }
      : null,
    outrasCompras: todas.filter((c) => c.id !== purchaseId),
    totalCliente: {
      compras: todas.length,
      aprovado: todas
        .filter((c) => c.status === "approved")
        .reduce((soma, c) => soma + c.amount, 0),
    },
  }
}
