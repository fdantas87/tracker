import "server-only"

import { createClient } from "@/lib/supabase/server"
import { nomeDoPais, periodoInicio, type GeoFilters } from "@/lib/dashboard/geo-filters"
import type { GeoPonto } from "@/lib/dashboard/geo-fit"

/**
 * Leitura da tela de Geo.
 *
 * Cliente SSR (anon + cookies), sob RLS — `visitors` e `purchases` têm
 * `select using (true)` para `authenticated` desde a fase 2. NÃO usar
 * `createServiceClient()` aqui: aquele padrão é de `lib/settings/queries.ts`, e
 * existe porque as tabelas de credencial não têm policy de SELECT nenhuma.
 *
 * O mapa sai de `visitors` (que é quem tem latitude e longitude) e o
 * faturamento sai de `purchases`. As duas consultas são independentes de
 * propósito: uma compra sem visitante casado não tem região nenhuma e não
 * poderia ser posicionada no mapa, mas ainda é receita e precisa aparecer no
 * total — ela entra em `semLocal`, não some.
 *
 * Aqui não existe a maquinaria de "condições como dados" das outras telas:
 * o único filtro é o período, e um `.gte()` direto não corre o risco de
 * estourar o TypeScript em profundidade de instanciação (que é o que acontece
 * quando o query builder passa por uma função genérica).
 */

/**
 * Teto do scan de agregação, igual ao de `events.ts` e `vendas.ts`. A
 * alternativa seria uma função de agregação no Postgres, que exigiria migration
 * nova aplicada à mão no SQL Editor; quando o volume passar disso, o certo é
 * virar RPC. Até lá, a tela diz que o número está parcial em vez de mentir.
 */
const TETO_AGREGACAO = 20_000

/**
 * Casas decimais usadas para juntar visitantes no mesmo ponto do mapa. Duas
 * casas são ~1 km: o suficiente para todo mundo de uma mesma cidade virar um
 * círculo só (a coordenada do header da Vercel é do centroide da cidade, então
 * na prática já vem repetida), sem colar cidades vizinhas num ponto só.
 */
const CASAS_DECIMAIS = 2

/** Quantos itens cada ranking devolve; o resto vira "e mais N". */
const TOPO = 8

export type ItemRanking = {
  /** O valor cru, como está no banco — é por ele que o mapa filtra o destaque. */
  chave: string
  label: string
  valor: number
}

export type Ranking = {
  itens: ItemRanking[]
  /** Quantos locais distintos existem no recorte, para o "e mais N". */
  distintos: number
}

function rankingDe(
  contagens: Map<string, number>,
  rotular: (chave: string) => string
): Ranking {
  const ordenado = [...contagens.entries()].sort((a, b) => b[1] - a[1])

  return {
    itens: ordenado.slice(0, TOPO).map(([chave, valor]) => ({
      chave,
      label: rotular(chave),
      valor,
    })),
    distintos: ordenado.length,
  }
}

function arredondar(valor: number): number {
  const fator = 10 ** CASAS_DECIMAIS
  return Math.round(valor * fator) / fator
}

// ---------------------------------------------------------------------------
// Visitantes — os pontos do mapa e os chips de contagem
// ---------------------------------------------------------------------------

export type VisitantesPorLocal = {
  pontos: GeoPonto[]
  paises: Ranking
  estados: Ranking
  cidades: Ranking
  /** Visitantes do período, com ou sem geo. */
  total: number
  /** Quantos têm coordenada e portanto aparecem no mapa. */
  comCoordenada: number
  leads: {
    paises: Ranking
    estados: Ranking
    cidades: Ranking
    total: number
  }
  clientes: {
    paises: Ranking
    estados: Ranking
    cidades: Ranking
    total: number
  }
  truncado: boolean
  error: string | null
}

type RawVisitante = {
  trck_user_id: string
  identified_at: string | null
  geo_country: string | null
  geo_region: string | null
  geo_city: string | null
  geo_latitude: number | null
  geo_longitude: number | null
}

const VAZIO_VISITANTES: Omit<VisitantesPorLocal, "error"> = {
  pontos: [],
  paises: { itens: [], distintos: 0 },
  estados: { itens: [], distintos: 0 },
  cidades: { itens: [], distintos: 0 },
  total: 0,
  comCoordenada: 0,
  leads: {
    paises: { itens: [], distintos: 0 },
    estados: { itens: [], distintos: 0 },
    cidades: { itens: [], distintos: 0 },
    total: 0,
  },
  clientes: {
    paises: { itens: [], distintos: 0 },
    estados: { itens: [], distintos: 0 },
    cidades: { itens: [], distintos: 0 },
    total: 0,
  },
  truncado: false,
}

/**
 * Os pontos do mapa e as três contagens.
 *
 * Os rankings NÃO são calculados só sobre quem tem coordenada: um visitante com
 * país e sem latitude ainda é um visitante daquele país, e sumir com ele faria
 * o chip divergir da tabela de Visitantes sem nenhum motivo visível.
 *
 * EM CASO DE ERRO devolve tudo zerado com a mensagem em `error`, mesma postura
 * de `getVendasResumo`: a tela continua de pé e mostra o aviso numa faixa, em
 * vez de trocar a página por um alerta vermelho.
 */
export async function getVisitantesPorLocal(
  filtros: GeoFilters
): Promise<VisitantesPorLocal> {
  const supabase = await createClient()

  let q = supabase
    .from("visitors")
    .select("trck_user_id,identified_at,geo_country,geo_region,geo_city,geo_latitude,geo_longitude")

  const inicio = periodoInicio(filtros.periodo)
  if (inicio) q = q.gte("created_at", inicio.toISOString())
  if (filtros.q) {
    const termo = filtros.q.replace(/[(),*]/g, "")
    if (termo) {
      q = q.or(`geo_country.ilike.*${termo}*,geo_region.ilike.*${termo}*,geo_city.ilike.*${termo}*`)
    }
  }

  const { data, error } = await q.limit(TETO_AGREGACAO)

  // Fetch all buyers to identify "Clientes"
  const { data: comprasData } = await supabase
    .from("purchases")
    .select("trck_user_id")
    .not("trck_user_id", "is", null)
    .limit(20_000)

  const idsComCompra = new Set((comprasData ?? []).map((r: any) => r.trck_user_id))

  if (error) return { ...VAZIO_VISITANTES, error: error.message }

  const linhas = (data ?? []) as unknown as RawVisitante[]

  const paises = new Map<string, number>()
  const estados = new Map<string, number>()
  const cidades = new Map<string, number>()

  const leadsPaises = new Map<string, number>()
  const leadsEstados = new Map<string, number>()
  const leadsCidades = new Map<string, number>()
  let totalLeads = 0

  const clientesPaises = new Map<string, number>()
  const clientesEstados = new Map<string, number>()
  const clientesCidades = new Map<string, number>()
  let totalClientes = 0

  const pontos = new Map<string, GeoPonto>()

  let comCoordenada = 0

  for (const linha of linhas) {
    const isIdent = Boolean(linha.identified_at)
    const isCliente = idsComCompra.has(linha.trck_user_id)
    const isLead = isIdent && !isCliente

    if (isCliente) totalClientes++
    if (isLead) totalLeads++

    if (linha.geo_country) {
      paises.set(linha.geo_country, (paises.get(linha.geo_country) ?? 0) + 1)
      if (isCliente) clientesPaises.set(linha.geo_country, (clientesPaises.get(linha.geo_country) ?? 0) + 1)
      if (isLead) leadsPaises.set(linha.geo_country, (leadsPaises.get(linha.geo_country) ?? 0) + 1)
    }
    if (linha.geo_region) {
      estados.set(linha.geo_region, (estados.get(linha.geo_region) ?? 0) + 1)
      if (isCliente) clientesEstados.set(linha.geo_region, (clientesEstados.get(linha.geo_region) ?? 0) + 1)
      if (isLead) leadsEstados.set(linha.geo_region, (leadsEstados.get(linha.geo_region) ?? 0) + 1)
    }
    if (linha.geo_city) {
      cidades.set(linha.geo_city, (cidades.get(linha.geo_city) ?? 0) + 1)
      if (isCliente) clientesCidades.set(linha.geo_city, (clientesCidades.get(linha.geo_city) ?? 0) + 1)
      if (isLead) leadsCidades.set(linha.geo_city, (leadsCidades.get(linha.geo_city) ?? 0) + 1)
    }

    const lat = Number(linha.geo_latitude)
    const lng = Number(linha.geo_longitude)
    if (
      linha.geo_latitude === null ||
      linha.geo_longitude === null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      continue
    }

    comCoordenada += 1

    const chave = `${arredondar(lat)},${arredondar(lng)}`
    const existente = pontos.get(chave)

    if (existente) {
      existente.count += 1
      existente.country ??= linha.geo_country
      existente.region ??= linha.geo_region
      existente.city ??= linha.geo_city
    } else {
      pontos.set(chave, {
        lat: arredondar(lat),
        lng: arredondar(lng),
        count: 1,
        country: linha.geo_country,
        region: linha.geo_region,
        city: linha.geo_city,
      })
    }
  }

  return {
    pontos: [...pontos.values()].sort((a, b) => a.count - b.count),
    paises: rankingDe(paises, nomeDoPais),
    estados: rankingDe(estados, (uf) => uf),
    cidades: rankingDe(cidades, (cidade) => cidade),
    total: linhas.length,
    comCoordenada,
    leads: {
      paises: rankingDe(leadsPaises, nomeDoPais),
      estados: rankingDe(leadsEstados, (uf) => uf),
      cidades: rankingDe(leadsCidades, (cidade) => cidade),
      total: totalLeads,
    },
    clientes: {
      paises: rankingDe(clientesPaises, nomeDoPais),
      estados: rankingDe(clientesEstados, (uf) => uf),
      cidades: rankingDe(clientesCidades, (cidade) => cidade),
      total: totalClientes,
    },
    truncado: linhas.length >= TETO_AGREGACAO,
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Faturamento por região
// ---------------------------------------------------------------------------

export type ReceitaPorLocal = {
  paises: Ranking
  estados: Ranking
  cidades: Ranking
  /** Moeda predominante; a tela avisa quando o recorte mistura mais de uma. */
  moeda: string
  moedasMultiplas: boolean
  faturamento: number
  aprovadas: number
  /**
   * Receita aprovada que não pôde ser atribuída a lugar nenhum, porque a compra
   * não casou com visitante (`match_found = false`) e por isso nasceu sem geo.
   */
  semLocal: { valor: number; quantidade: number }
  truncado: boolean
  error: string | null
}

type RawCompra = {
  amount: number
  currency: string
  geo_country: string | null
  geo_region: string | null
  geo_city: string | null
}

const VAZIO_RECEITA: Omit<ReceitaPorLocal, "error"> = {
  paises: { itens: [], distintos: 0 },
  estados: { itens: [], distintos: 0 },
  cidades: { itens: [], distintos: 0 },
  moeda: "BRL",
  moedasMultiplas: false,
  faturamento: 0,
  aprovadas: 0,
  semLocal: { valor: 0, quantidade: 0 },
  truncado: false,
}

/**
 * Faturamento aprovado, quebrado por país, estado e cidade.
 *
 * Só venda APROVADA, mesma regra da quebra por forma de pagamento da tela de
 * Vendas: um boleto gerado e não pago descreveria intenção, não receita.
 *
 * O geo daqui vem do visitante casado — `app/api/webhook/compra/[platform]`
 * copia `geo_country/region/city` de `visitors` para `purchases`, e não do IP
 * de quem chamou o webhook (que seria o servidor da plataforma de pagamento, e
 * não diria nada sobre o comprador).
 *
 * Moeda não se soma: R$ 100 e US$ 100 não são 200 de nada. Os rankings são
 * montados só com as vendas da moeda predominante, e `moedasMultiplas` avisa
 * quando o recorte tem mais de uma.
 */
export async function getReceitaPorLocal(filtros: GeoFilters): Promise<ReceitaPorLocal> {
  const supabase = await createClient()

  let q = supabase
    .from("purchases")
    .select("amount,currency,geo_country,geo_region,geo_city")
    .eq("status", "approved")

  const inicio = periodoInicio(filtros.periodo)
  if (inicio) q = q.gte("created_at", inicio.toISOString())
  if (filtros.q) {
    const termo = filtros.q.replace(/[(),*]/g, "")
    if (termo) {
      q = q.or(`geo_country.ilike.*${termo}*,geo_region.ilike.*${termo}*,geo_city.ilike.*${termo}*`)
    }
  }

  const { data, error } = await q.limit(TETO_AGREGACAO)

  if (error) return { ...VAZIO_RECEITA, error: error.message }

  const linhas = (data ?? []) as unknown as RawCompra[]

  const porMoeda = new Map<string, number>()
  for (const linha of linhas) {
    const valor = Number(linha.amount) || 0
    porMoeda.set(linha.currency, (porMoeda.get(linha.currency) ?? 0) + valor)
  }

  const moedas = [...porMoeda.entries()].sort((a, b) => b[1] - a[1])
  const moeda = moedas[0]?.[0] ?? VAZIO_RECEITA.moeda

  const paises = new Map<string, number>()
  const estados = new Map<string, number>()
  const cidades = new Map<string, number>()

  let faturamento = 0
  let aprovadas = 0
  let semLocalValor = 0
  let semLocalQuantidade = 0

  for (const linha of linhas) {
    if (linha.currency !== moeda) continue

    const valor = Number(linha.amount) || 0
    faturamento += valor
    aprovadas += 1

    if (linha.geo_country) {
      paises.set(linha.geo_country, (paises.get(linha.geo_country) ?? 0) + valor)
    }
    if (linha.geo_region) {
      estados.set(linha.geo_region, (estados.get(linha.geo_region) ?? 0) + valor)
    }
    if (linha.geo_city) {
      cidades.set(linha.geo_city, (cidades.get(linha.geo_city) ?? 0) + valor)
    }

    if (!linha.geo_country && !linha.geo_region && !linha.geo_city) {
      semLocalValor += valor
      semLocalQuantidade += 1
    }
  }

  return {
    paises: rankingDe(paises, nomeDoPais),
    estados: rankingDe(estados, (uf) => uf),
    cidades: rankingDe(cidades, (cidade) => cidade),
    moeda,
    moedasMultiplas: moedas.length > 1,
    faturamento,
    aprovadas,
    semLocal: { valor: semLocalValor, quantidade: semLocalQuantidade },
    truncado: linhas.length >= TETO_AGREGACAO,
    error: null,
  }
}
