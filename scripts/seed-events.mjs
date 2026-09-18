/**
 * Semeador de dados de demonstração — só para desenvolver as telas do painel.
 *
 *   node scripts/seed-events.mjs            cria os dados
 *   node scripts/seed-events.mjs --limpar   apaga tudo que ele criou
 *
 * Escreve DIRETO no Postgres, sem passar por /api/event. Isso é deliberado:
 * o test_event_code está vazio em produção, então qualquer evento que passasse
 * pelo endpoint contaria como real no pixel e sujaria a atribuição.
 *
 * Tudo que ele cria é identificável pelo prefixo abaixo, e é só isso que o
 * --limpar apaga — dado real capturado no site nunca é tocado.
 */
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"

const PREFIX = "seed_"

const limpar = process.argv.slice(2).includes("--limpar")

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const SB = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SB || !KEY) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local")
  process.exit(1)
}

const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
}

async function rest(path, init = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: H, ...init })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

// ---------------------------------------------------------------- limpeza

async function limparTudo() {
  // purchases primeiro: tem FK para visitors.
  for (const t of ["purchases", "events_log", "visitors"]) {
    await rest(`${t}?trck_user_id=like.${PREFIX}*`, { method: "DELETE" })
  }
  console.log(`Apagado tudo com trck_user_id começando em "${PREFIX}".`)
}

// ---------------------------------------------------------------- dados

/**
 * [país, UF, cidade, CEP, lat, long, fuso] — o mesmo conjunto que os headers
 * `x-vercel-ip-*` entregam em produção.
 *
 * Manaus e Rio Branco estão aqui de propósito: são os fusos brasileiros que
 * NÃO são o do painel, e sem pelo menos um deles não há como ver o campo
 * "hora local do visitante" funcionando. Lisboa cobre o caso de fuso e país
 * estrangeiros.
 */
const CIDADES = [
  ["BR", "SP", "São Paulo", "01310-100", -23.5505, -46.6333, "America/Sao_Paulo"],
  ["BR", "SP", "Campinas", "13015-000", -22.9099, -47.0626, "America/Sao_Paulo"],
  ["BR", "RJ", "Rio de Janeiro", "20040-020", -22.9068, -43.1729, "America/Sao_Paulo"],
  ["BR", "MG", "Belo Horizonte", "30130-010", -19.9167, -43.9345, "America/Sao_Paulo"],
  ["BR", "RS", "Porto Alegre", "90010-150", -30.0346, -51.2177, "America/Sao_Paulo"],
  ["BR", "PR", "Curitiba", "80010-010", -25.4284, -49.2733, "America/Sao_Paulo"],
  ["BR", "BA", "Salvador", "40020-000", -12.9777, -38.5016, "America/Bahia"],
  ["BR", "PE", "Recife", "50010-000", -8.0476, -34.877, "America/Recife"],
  ["BR", "SC", "Florianópolis", "88010-000", -27.5954, -48.548, "America/Sao_Paulo"],
  ["BR", "DF", "Brasília", "70040-010", -15.7939, -47.8828, "America/Sao_Paulo"],
  ["BR", "CE", "Fortaleza", "60010-000", -3.7319, -38.5267, "America/Fortaleza"],
  ["BR", "GO", "Goiânia", "74003-010", -16.6869, -49.2648, "America/Sao_Paulo"],
  ["BR", "AM", "Manaus", "69005-040", -3.119, -60.0217, "America/Manaus"],
  ["BR", "AC", "Rio Branco", "69900-064", -9.9754, -67.8249, "America/Rio_Branco"],
  ["PT", null, "Lisboa", "1100-148", 38.7223, -9.1393, "Europe/Lisbon"],
]

/** Manaus: garantido no primeiro visitante, para o fuso diferente sempre existir. */
const MANAUS = CIDADES.find((c) => c[2] === "Manaus")

/** As 7 colunas de geo, do jeito que as três tabelas as gravam. */
function geoDe([pais, uf, cidade, cep, lat, lng, fuso]) {
  return {
    geo_country: pais,
    geo_region: uf,
    geo_city: cidade,
    geo_postal_code: cep,
    geo_latitude: lat,
    geo_longitude: lng,
    geo_timezone: fuso,
  }
}

const ORIGENS = [
  { utm_source: "facebook", utm_medium: "cpc", utm_campaign: "negou-frio-01", utm_content: "criativo-a" },
  { utm_source: "facebook", utm_medium: "cpc", utm_campaign: "negou-frio-01", utm_content: "criativo-b" },
  { utm_source: "instagram", utm_medium: "cpc", utm_campaign: "negou-remarketing", utm_content: "story-01" },
  { utm_source: "google", utm_medium: "organic", utm_campaign: null, utm_content: null },
  { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null }, // direto
]

const escolher = (a) => a[Math.floor(Math.random() * a.length)]
const inteiro = (min, max) => min + Math.floor(Math.random() * (max - min + 1))
const chance = (p) => Math.random() < p

const AGORA = Date.now()
const DIA = 86_400_000
const iso = (ms) => new Date(ms).toISOString()

/** Payload no mesmo envelope que o disparo real grava: { data: [evento], test_event_code }. */
function payloadMeta(nome, tempoMs) {
  return {
    data: [
      {
        event_name: nome,
        event_id: `${PREFIX}${nome}`,
        event_time: Math.floor(tempoMs / 1000),
        action_source: "website",
        user_data: { client_ip_address: "177.0.0.1", client_user_agent: "Mozilla/5.0" },
      },
    ],
    test_event_code: null,
  }
}

/**
 * Um evento às 22:30 de ONTEM no horário de Brasília — ou seja, 01:30 UTC de
 * hoje.
 *
 * Existe só para tornar visível o bug de fuso que esta fase corrigiu, e para
 * impedir que ele volte sem ninguém perceber. Com o recorte em UTC, este evento
 * caía dentro do filtro "Hoje" (porque 01:30 UTC de hoje é depois de 00:00 UTC)
 * enquanto a própria tabela o exibia com a data de ONTEM, e o gráfico o jogava
 * no balde errado. Com o recorte no fuso do painel, ele fica fora de "Hoje" e
 * dentro do dia de ontem — que é onde ele aconteceu.
 */
function eventoDeBorda(trck, geo) {
  const agora = new Date(AGORA)
  let tempo = Date.UTC(
    agora.getUTCFullYear(),
    agora.getUTCMonth(),
    agora.getUTCDate(),
    1,
    30
  )
  // Rodando de madrugada (antes de 01:30 UTC), a conta acima cairia no futuro.
  if (tempo > AGORA) tempo -= DIA

  return {
    trck_user_id: trck,
    event_name: "ViewContent",
    event_id: `${PREFIX}borda-de-fuso`,
    payload_meta: payloadMeta("ViewContent", tempo),
    response_meta: [
      { pixel_id: "4534042836884934", ok: true, status: 200, body: { events_received: 1 } },
    ],
    ip: "177.0.0.1",
    ...geo,
    created_at: iso(tempo),
    event_time: iso(tempo),
    event_source_url: "https://lp.negou.net/?teste=borda-de-fuso",
    action_source: "website",
    pixel_fired: false,
    dispatch_status: "sent",
    dispatch_after: iso(tempo + 900_000),
    dispatch_attempts: 1,
    dispatched_at: iso(tempo + 900_000),
  }
}

async function semear() {
  const visitantes = []
  const eventos = []
  const compras = []

  // 30 visitantes espalhados pelos últimos 30 dias.
  for (let i = 0; i < 30; i++) {
    const local = i === 0 ? MANAUS : escolher(CIDADES)
    const geo = geoDe(local)
    const origem = escolher(ORIGENS)
    const nasceuEm = AGORA - inteiro(0, 30) * DIA - inteiro(0, 23) * 3_600_000
    const identificado = chance(0.35)
    const trck = `${PREFIX}${randomUUID()}`

    visitantes.push({
      trck_user_id: trck,
      email: identificado ? `pessoa${i}@exemplo.test` : null,
      email_hash: identificado ? "0".repeat(64) : null,
      phone_hash: identificado && chance(0.7) ? "1".repeat(64) : null,
      first_name_hash: identificado ? "2".repeat(64) : null,
      fbp: `fb.1.${nasceuEm}.${inteiro(1e9, 9e9)}`,
      ga_client_id: `${inteiro(1e8, 9e8)}.${Math.floor(nasceuEm / 1000)}`,
      ...origem,
      referrer: origem.utm_source ? "https://l.facebook.com/" : null,
      ip: `177.${inteiro(0, 255)}.${inteiro(0, 255)}.${inteiro(1, 254)}`,
      user_agent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      ...geo,
      created_at: iso(nasceuEm),
      identified_at: identificado ? iso(nasceuEm + 120_000) : null,
    })

    // Funil: todo mundo vê a página; parte avança.
    const passos = ["PageView"]
    if (chance(0.55)) passos.push("ViewContent")
    if (chance(0.3)) passos.push("InitiateCheckout")
    const comprou = identificado && chance(0.35)
    if (comprou) passos.push("Purchase")

    passos.forEach((nome, passo) => {
      const tempo = nasceuEm + passo * inteiro(30_000, 600_000)
      const velho = AGORA - tempo > 14 * DIA

      // Distribuição de status parecida com a real: a maioria sai, alguns
      // esperam, poucos falham. Os dois últimos existem para a tela ter que
      // mostrá-los de verdade, não só em teoria.
      let status = "sent"
      if (chance(0.12)) status = "pending"
      else if (chance(0.05)) status = "sending"
      else if (chance(0.06)) status = "failed"
      else if (chance(0.04)) status = "skipped"

      const pendente = status === "pending" || status === "sending"
      const tentativas =
        status === "failed" ? inteiro(2, 5) : status === "sent" ? 1 : status === "sending" ? 1 : 0

      eventos.push({
        trck_user_id: trck,
        event_name: nome,
        event_id: `${PREFIX}${randomUUID()}`,
        ...origem,
        // Payload some depois de 14 dias (purge_old_event_payloads). A tela
        // precisa lidar com isso, então o seed reproduz.
        payload_meta: velho || pendente ? null : payloadMeta(nome, tempo),
        response_meta:
          velho || pendente
            ? null
            : status === "failed"
              ? [{ pixel_id: "4534042836884934", ok: false, status: 400, body: { error: { message: "Invalid parameter" } } }]
              : [{ pixel_id: "4534042836884934", ok: true, status: 200, body: { events_received: 1, fbtrace_id: "Axxxx" } }],
        ip: `177.${inteiro(0, 255)}.${inteiro(0, 255)}.${inteiro(1, 254)}`,
        ...geo,
        created_at: iso(tempo),
        event_time: iso(tempo),
        event_source_url: "https://lp.negou.net/",
        custom_data: nome === "Purchase" ? { value: 197, currency: "BRL" } : null,
        action_source: "website",
        // No modo adaptive o pixel só dispara para quem já está identificado.
        pixel_fired: identificado,
        dispatch_status: status,
        dispatch_after: iso(
          status === "pending" ? AGORA + inteiro(-300, 900) * 1000 : tempo + 900_000
        ),
        dispatch_attempts: tentativas,
        dispatch_claimed_at: status === "sending" ? iso(AGORA - 30_000) : null,
        dispatched_at: status === "sent" ? iso(tempo + 900_000) : null,
        dispatch_error:
          status === "failed"
            ? "Meta respondeu 400: (#2804) Invalid parameter — user_data.em must be a SHA-256 hash"
            : status === "skipped"
              ? "descartado: event_time com mais de 6 dias"
              : null,
      })
    })

    if (comprou) {
      const tempo = nasceuEm + inteiro(600_000, 3_600_000)
      const estornada = chance(0.12)
      compras.push({
        transaction_id: `${PREFIX}${randomUUID()}`,
        trck_user_id: trck,
        email: `pessoa${i}@exemplo.test`,
        email_hash: "0".repeat(64),
        product_name: escolher(["Método Negou", "Negou — Mentoria", "Negou Anual"]),
        product_id: escolher(["PPLQQ7A7", "PPLQQ8B2"]),
        amount: escolher([97, 197, 297, 497, 997]),
        currency: "BRL",
        status: estornada ? escolher(["refunded", "chargeback"]) : "approved",
        platform: "perfectpay",
        platform_status: estornada ? "7" : "2",
        ...origem,
        geo_country: geo.geo_country,
        geo_region: geo.geo_region,
        geo_city: geo.geo_city,
        match_method: "trck_user_id",
        match_found: true,
        meta_event_id: `purchase_${PREFIX}${i}`,
        response_meta: { ok: true, events_received: 1 },
        raw_webhook: { seed: true },
        created_at: iso(tempo),
      })
    }
  }

  eventos.push(eventoDeBorda(visitantes[0].trck_user_id, geoDe(MANAUS)))

  await rest("visitors", { method: "POST", body: JSON.stringify(visitantes) })
  await rest("events_log", { method: "POST", body: JSON.stringify(eventos) })
  if (compras.length) {
    await rest("purchases", { method: "POST", body: JSON.stringify(compras) })
  }

  const porStatus = eventos.reduce((acc, e) => {
    acc[e.dispatch_status] = (acc[e.dispatch_status] ?? 0) + 1
    return acc
  }, {})

  console.log(`${visitantes.length} visitantes, ${eventos.length} eventos, ${compras.length} compras.`)
  console.log("Eventos por status:", porStatus)
  console.log('Para desfazer: node scripts/seed-events.mjs --limpar')
}

try {
  if (limpar) {
    await limparTudo()
  } else {
    await limparTudo() // idempotente: rodar duas vezes não empilha
    await semear()
  }
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
