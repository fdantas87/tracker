import "server-only"

import { createClient } from "@/lib/supabase/server"
import { periodoInicio, type PeriodoKey } from "@/lib/dashboard/filters"
import { getVendasResumo } from "@/lib/dashboard/vendas"

/**
 * Números da Visão geral.
 *
 * Cliente SSR (anon + cookies), sob RLS — mesma regra de Eventos, Leads e
 * Vendas. NÃO usar `createServiceClient()`.
 *
 * Definições (o que cada número conta, e por quê):
 *
 * TODA contagem é de PESSOAS ÚNICAS, nunca de visitas ou eventos: a mesma pessoa
 * voltando dez vezes é uma só, senão a taxa de conversão seria irreal. A chave
 * de pessoa (`chavePessoa`) é o e-mail do visitante, quando existe; senão o
 * próprio `trck_user_id`. Isso funde a mesma pessoa em dois dispositivos, mas
 * SÓ quando ela deixou e-mail — quem é anônimo em dois aparelhos continua
 * contado duas vezes, e não há como evitar sem identidade.
 *
 * - **Leads** = pessoas com um evento `Lead` ou `CompleteRegistration` no
 *   período (`events_log.event_time`). Conta evento de QUALQUER
 *   `dispatch_status` — pendente na fila, falho e `skipped` também: o lead
 *   aconteceu no site, e o status só diz o que aconteceu depois com o envio ao
 *   Meta. Conta também o visitante anônimo (sem e-mail), que é como a tela de
 *   Eventos já os mostra. Mesmo critério de `totalCadastros` em `leads.ts`.
 * - **Visitantes únicos** = união das pessoas vistas em `events_log` no período
 *   com as criadas em `visitors` no período. Ser a união é o que garante
 *   leads ⊆ visitantes: com os visitantes só de `visitors.created_at`, um
 *   visitante antigo que voltou e virou lead hoje contaria como lead sem contar
 *   como visitante, e a taxa poderia passar de 100%.
 * - **Clientes** = pessoas com compra `approved` no período. Os que também estão
 *   nos visitantes do período (`clientesNoFunil`) são o numerador de
 *   Conv. Clientes: compra sem visita no período (boleto de visitante antigo,
 *   venda sem vínculo) não pode inflar a taxa acima de 100%. O card "Novos
 *   Clientes" e o faturamento seguem contando todos.
 * - **Faturamento, vendas e ticket médio** vêm de `getVendasResumo` — a MESMA
 *   fonte da tela de Vendas, para as duas nunca divergirem.
 *
 * ROAS, CPA, CPL, CAC e Connect Rate NÃO estão aqui: dependem de gasto e cliques
 * de anúncio (fase 9, Campanhas), que o sistema ainda não lê.
 */

/** Mesmo teto de agregação de `events.ts` e `vendas.ts`. */
const TETO_AGREGACAO = 20_000

/**
 * O PostgREST do Supabase devolve no máximo 1.000 linhas por requisição, então
 * `.limit(20_000)` sozinho NÃO traz 20 mil: traz mil, em silêncio. Aqui a leitura
 * é paginada com `.range()` até acabar ou bater o teto.
 */
const TAMANHO_PAGINA = 1_000

type Pagina = { data: unknown; error: { message: string } | null }

async function lerTudo<T>(
  buscar: (de: number, ate: number) => PromiseLike<Pagina>
): Promise<{ linhas: T[]; truncado: boolean; error: string | null }> {
  const linhas: T[] = []

  for (let de = 0; de < TETO_AGREGACAO; de += TAMANHO_PAGINA) {
    const { data, error } = await buscar(de, de + TAMANHO_PAGINA - 1)
    if (error) return { linhas: [], truncado: false, error: error.message }

    const pagina = (data ?? []) as T[]
    linhas.push(...pagina)
    if (pagina.length < TAMANHO_PAGINA) return { linhas, truncado: false, error: null }
  }

  return { linhas, truncado: true, error: null }
}

export type Overview = {
  moeda: string
  moedasMultiplas: boolean
  faturamento: number
  vendas: number
  ticketMedio: number
  visitantes: number
  leads: number
  clientes: number
  /** Clientes que também são visitantes únicos do período — base de Conv. Clientes. */
  clientesNoFunil: number
  /** null quando não há venda aprovada no recorte. */
  topProduto: string | null
  truncado: boolean
  error: string | null
}

const EVENTOS_DE_LEAD = new Set(["Lead", "CompleteRegistration"])

const COLUNAS_EVENTO: string = "trck_user_id,event_name"
const COLUNAS_VISITANTE: string = "trck_user_id"
const COLUNAS_EMAIL: string = "trck_user_id,email"
const COLUNAS_COMPRA: string = "trck_user_id,email,transaction_id,product_name"

type EventoRow = { trck_user_id: string | null; event_name: string }
type VisitanteRow = { trck_user_id: string }
type VisitanteEmailRow = { trck_user_id: string; email: string }
type CompraRow = {
  trck_user_id: string | null
  email: string | null
  transaction_id: string
  product_name: string | null
}

const ZERADO: Omit<Overview, "error"> = {
  moeda: "BRL",
  moedasMultiplas: false,
  faturamento: 0,
  vendas: 0,
  ticketMedio: 0,
  visitantes: 0,
  leads: 0,
  clientes: 0,
  clientesNoFunil: 0,
  topProduto: null,
  truncado: false,
}

/**
 * EM CASO DE ERRO devolve tudo zerado COM a mensagem, igual a `getVendasResumo`:
 * a tela mostra os cards e o aviso ao lado, porque "0" silencioso não deixa
 * distinguir "nada aconteceu" de "a consulta quebrou".
 */
export async function getOverview(periodo: PeriodoKey): Promise<Overview> {
  const supabase = await createClient()
  const inicio = periodoInicio(periodo)?.toISOString() ?? null

  const [resumo, eventos, visitantes, emails, compras] = await Promise.all([
    getVendasResumo({ periodo, pagina: 1 }),

    lerTudo<EventoRow>((de, ate) => {
      let q = supabase.from("events_log").select(COLUNAS_EVENTO)
      if (inicio) q = q.gte("event_time", inicio)
      return q.order("id").range(de, ate)
    }),

    lerTudo<VisitanteRow>((de, ate) => {
      let q = supabase.from("visitors").select(COLUNAS_VISITANTE)
      if (inicio) q = q.gte("created_at", inicio)
      return q.order("trck_user_id").range(de, ate)
    }),

    // E-mails de TODOS os tempos, sem recorte de período: o e-mail pode ter sido
    // capturado depois de o visitante nascer, e é ele que funde dispositivos.
    lerTudo<VisitanteEmailRow>((de, ate) =>
      supabase
        .from("visitors")
        .select(COLUNAS_EMAIL)
        .not("email", "is", null)
        .order("trck_user_id")
        .range(de, ate)
    ),

    lerTudo<CompraRow>((de, ate) => {
      let q = supabase.from("purchases").select(COLUNAS_COMPRA).eq("status", "approved")
      if (inicio) q = q.gte("created_at", inicio)
      return q.order("id").range(de, ate)
    }),
  ])

  const erro =
    resumo.error ?? eventos.error ?? visitantes.error ?? emails.error ?? compras.error
  if (erro) return { ...ZERADO, error: erro }

  const emailDe = new Map<string, string>()
  for (const v of emails.linhas) {
    const email = v.email.trim().toLowerCase()
    if (email) emailDe.set(v.trck_user_id, email)
  }

  /** Uma pessoa: o e-mail do visitante, ou o próprio dispositivo se não houver. */
  const chavePessoa = (trckUserId: string) => {
    const email = emailDe.get(trckUserId)
    return email ? `email:${email}` : `id:${trckUserId}`
  }

  const visitantesVistos = new Set<string>()
  const leads = new Set<string>()

  for (const e of eventos.linhas) {
    if (!e.trck_user_id) continue
    const pessoa = chavePessoa(e.trck_user_id)
    visitantesVistos.add(pessoa)
    if (EVENTOS_DE_LEAD.has(e.event_name)) leads.add(pessoa)
  }
  for (const v of visitantes.linhas) visitantesVistos.add(chavePessoa(v.trck_user_id))

  // Quem comprou: o e-mail do visitante vinculado (cai na MESMA pessoa do lead),
  // depois o e-mail da compra, o dispositivo e, por último, a própria transação
  // (comprador sem identificação nenhuma conta como um).
  const clientes = new Set<string>()
  const produtos = new Map<string, number>()

  for (const c of compras.linhas) {
    const emailCompra = c.email?.trim().toLowerCase()
    const pessoa = c.trck_user_id
      ? emailDe.has(c.trck_user_id)
        ? chavePessoa(c.trck_user_id)
        : emailCompra
          ? `email:${emailCompra}`
          : chavePessoa(c.trck_user_id)
      : emailCompra
        ? `email:${emailCompra}`
        : `tx:${c.transaction_id}`
    clientes.add(pessoa)
    if (c.product_name) produtos.set(c.product_name, (produtos.get(c.product_name) ?? 0) + 1)
  }

  let clientesNoFunil = 0
  for (const pessoa of clientes) if (visitantesVistos.has(pessoa)) clientesNoFunil++

  const topProduto = [...produtos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return {
    moeda: resumo.moeda,
    moedasMultiplas: resumo.moedasMultiplas,
    faturamento: resumo.faturamento,
    vendas: resumo.aprovadas,
    ticketMedio: resumo.ticketMedio,
    visitantes: visitantesVistos.size,
    leads: leads.size,
    clientes: clientes.size,
    clientesNoFunil,
    topProduto,
    truncado:
      resumo.truncado ||
      eventos.truncado ||
      visitantes.truncado ||
      emails.truncado ||
      compras.truncado,
    error: null,
  }
}
