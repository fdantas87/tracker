/**
 * Verificador da captura — o caminho do navegador anônimo até o tracker.
 *
 *   npm run verify:captura
 *
 * Existe por causa de um bug real: o Deployment Protection da Vercel ficou
 * ligado em Produção e TODO o domínio passou a devolver 302 para o SSO. O
 * `track.js` nunca carregou, nenhum evento foi capturado, e nada disso apareceu
 * em lugar nenhum — o `post()` do track.js engole falha de rede com
 * `.catch(function () {})`, e quem tem sessão na Vercel continua vendo o painel
 * funcionar normalmente. O sintoma é ausência, e ausência não dispara alarme.
 *
 * As três checagens aqui são deliberadamente do ponto de vista de quem NÃO tem
 * sessão nenhuma: é esse visitante que precisa conseguir baixar o script e
 * gravar o evento.
 *
 * Ele não cria visitante nem evento. `verify:dispatch` já cobre o ciclo com
 * escrita; repetir isso aqui sujaria o banco a cada checagem de rotina.
 *
 *   npm run verify:captura
 *   npm run verify:captura -- --origem https://lp.cliente.com
 *   TRACKING_BASE_URL=https://tracking.cliente.com npm run verify:captura
 */
import { readFileSync } from "node:fs"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)

const problemas = []
function erro(titulo, oQueFazer) {
  problemas.push({ titulo, oQueFazer })
  console.log(`\n  [X] ${titulo}`)
  console.log(`      O QUE FAZER: ${oQueFazer}`)
}
function ok(texto) {
  console.log(`  [ok] ${texto}`)
}
function encerrar() {
  console.log("\n" + "=".repeat(70))
  if (problemas.length === 0) {
    console.log("TUDO CERTO.")
  } else {
    console.log(`${problemas.length} ponto(s) para resolver, na ordem:\n`)
    problemas.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.titulo}`)
      console.log(`     -> ${p.oQueFazer}\n`)
    })
  }
  console.log("=".repeat(70))
  process.exit(problemas.length === 0 ? 0 : 1)
}

/**
 * Origens a testar no preflight.
 *
 * `.env.local` NÃO é fonte confiável aqui: variáveis marcadas como "Secret" na
 * Vercel não descem em texto puro no `vercel env pull` — o arquivo recebe o
 * literal `[SENSITIVE]`. Usar isso às cegas testaria uma origem inventada e
 * devolveria uma reprovação que não diz nada. Por isso só aproveitamos o valor
 * quando ele se parece mesmo com uma lista de origens.
 *
 * Não há domínio de fallback de propósito: apontar para o site de outro cliente
 * daria um "TUDO CERTO" que não fala do deploy sendo verificado.
 */
function origensDosArgumentos() {
  const args = process.argv.slice(2)
  return args
    .map((a, i) => (a === "--origem" ? args[i + 1] : null))
    .filter(Boolean)
}

// Começa com env + args, mas depois soma o que estiver no banco (allowed_origins).
let ORIGENS = [
  ...origensDosArgumentos(),
  ...(env.TRACKING_ALLOWED_ORIGINS ?? "").split(","),
]
  .map((v) => v.trim().replace(/\/+$/, ""))
  .filter((v) => /^https?:\/\//.test(v))

// Tenta buscar allowed_origins do banco (mesma técnica que dispatch_cron_url).
async function descobrirOrigensDopainel() {
  const sb = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!sb || !key) return []

  try {
    const res = await fetch(
      `${sb}/rest/v1/settings?select=allowed_origins&id=eq.true`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    )
    const origins = (await res.json())?.[0]?.allowed_origins ?? []
    return Array.isArray(origins) ? origins : []
  } catch {
    return []
  }
}

const painelOrigins = await descobrirOrigensDopainel()
ORIGENS = [...new Set([...ORIGENS, ...painelOrigins])]

/**
 * A URL do tracker sai da mesma fonte que `verify:dispatch` usa: a "URL do cron"
 * que o próprio cliente preencheu no painel. É o único lugar do sistema onde
 * este deploy declara o próprio endereço.
 */
async function descobrirBase() {
  const manual = (process.env.TRACKING_BASE_URL ?? "").trim().replace(/\/+$/, "")
  if (manual) return manual

  const sb = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!sb || !key) return null

  try {
    const res = await fetch(
      `${sb}/rest/v1/settings?select=dispatch_cron_url&id=eq.true`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    )
    const url = (await res.json())?.[0]?.dispatch_cron_url
    return url ? new URL(url).origin : null
  } catch {
    return null
  }
}

const BASE = await descobrirBase()

if (!BASE) {
  console.log(
    "\nNao sei qual e a URL deste tracker.\n" +
      'Preencha "URL do cron" no painel (aba Disparo) ou rode com:\n' +
      "  TRACKING_BASE_URL=https://tracking.seudominio.com npm run verify:captura"
  )
  process.exit(1)
}

console.log(`\nVerificando a captura em ${BASE}`)

// ---------------------------------------------------------------------------
// 1. O navegador anônimo consegue baixar o track.js?
// ---------------------------------------------------------------------------
console.log("\n1) O track.js esta publico?")

// `redirect: "manual"` é o ponto da checagem: seguir o redirect daria 200 na
// página de login da Vercel e o script passaria achando que está tudo bem.
let scriptOk = false
try {
  const res = await fetch(`${BASE}/track.js`, { redirect: "manual" })
  const tipo = res.headers.get("content-type") ?? ""
  const destino = res.headers.get("location") ?? ""

  if (res.status >= 300 && res.status < 400 && destino.includes("vercel.com/sso")) {
    erro(
      `${BASE}/track.js responde ${res.status} e manda para o login da Vercel.`,
      "O Deployment Protection esta ligado em Producao e derruba a captura inteira. " +
        "Vercel -> Settings -> Deployment Protection -> Vercel Authentication -> " +
        '"Only Preview Deployments". Producao PRECISA ser publica: o track.js e os ' +
        "endpoints de captura sao chamados por navegadores anonimos. O painel segue " +
        "protegido pelo proxy.ts e pelo login do Supabase."
    )
  } else if (res.status >= 300 && res.status < 400) {
    erro(
      `${BASE}/track.js responde ${res.status} (redirect para ${destino || "?"}).`,
      "O script precisa ser servido direto, sem redirect. Confira dominio e proxy."
    )
  } else if (res.status !== 200) {
    erro(
      `${BASE}/track.js responde ${res.status}.`,
      "Confira se o deploy foi feito e se o arquivo esta em public/track.js."
    )
  } else if (!/javascript|ecmascript|text\/plain/i.test(tipo)) {
    erro(
      `${BASE}/track.js responde 200 mas com Content-Type "${tipo}".`,
      "O navegador recusa executar o script. Provavelmente esta vindo uma pagina HTML no lugar do arquivo."
    )
  } else {
    scriptOk = true
    ok(`track.js servido direto (200, ${tipo}).`)
  }
} catch (error) {
  erro(
    `Nao consegui falar com ${BASE}: ${error.message}`,
    "Confira se o dominio esta no ar."
  )
}

if (!scriptOk) encerrar()

// ---------------------------------------------------------------------------
// 2. O CORS libera cada origem configurada?
// ---------------------------------------------------------------------------
console.log("\n2) O CORS libera os dominios da allowlist?")

if (ORIGENS.length === 0) {
  erro(
    "Nao tenho nenhuma origem para testar.",
    "Rode nomeando os sites do cliente, um --origem por dominio:\n" +
      "        npm run verify:captura -- --origem https://lp.exemplo.com --origem https://www.exemplo.com\n" +
      "      (o .env.local nao serve de fonte quando TRACKING_ALLOWED_ORIGINS esta marcada como " +
      "Secret na Vercel: o vercel env pull grava [SENSITIVE] no lugar do valor)."
  )
} else {
  for (const origem of ORIGENS) {
    try {
      const res = await fetch(`${BASE}/api/identify`, {
        method: "OPTIONS",
        redirect: "manual",
        headers: {
          Origin: origem,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      })
      const liberado = res.headers.get("access-control-allow-origin")

      if (liberado === origem) {
        ok(`${origem} liberado no preflight.`)
      } else {
        erro(
          `${origem} NAO recebeu Access-Control-Allow-Origin (status ${res.status}).`,
          "ESCOLHA UM: (1) Abra Configurações → Geral, aba Domínios liberados, " +
            "e adicione a origem — vale em até 60s, sem deploy novo. " +
            "OU (2) Acrescente a variável TRACKING_ALLOWED_ORIGINS na Vercel e refaça o deploy " +
            "(a variável é um const de topo de módulo). " +
            "Ou ambos: ele estão tão protegidos. A comparação e por igualdade exata — " +
            "confira esquema (https://) e ausência de barra final."
        )
      }
    } catch (error) {
      erro(
        `Falha no preflight de ${origem}: ${error.message}`,
        "Confira se o dominio do tracker esta no ar."
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 3. O app responde e esta configurado?
// ---------------------------------------------------------------------------
console.log("\n3) O /api/config/public responde com os IDs do painel?")

try {
  const res = await fetch(`${BASE}/api/config/public`, { redirect: "manual" })
  if (res.status !== 200) {
    erro(
      `/api/config/public responde ${res.status}.`,
      "Se for 5xx, quase sempre e migration pendente: rode as migrations no SQL Editor do Supabase antes do deploy."
    )
  } else {
    const body = await res.json()
    // As chaves são as que o endpoint realmente devolve: `pixels` e `ga4`.
    // Ler um nome parecido (`meta_pixels`) daria `undefined` e o script
    // acusaria "nenhum destino" com o painel perfeitamente configurado.
    const pixels = body?.pixels?.length ?? 0
    const ga4 = body?.ga4?.length ?? 0

    ok(`/api/config/public respondeu 200 (${pixels} pixel(s), ${ga4} conta(s) GA4).`)

    // Zero destino não impede a captura — o evento ainda é gravado e fica na
    // fila. Mas é a diferença entre "capturando" e "capturando para alguem".
    if (pixels === 0 && ga4 === 0) {
      erro(
        "Nenhum pixel do Meta nem conta GA4 ativa no painel.",
        "Os eventos vao continuar sendo gravados, mas nao ha para onde disparar. " +
          "Cadastre os destinos em Configuracoes."
      )
    }
  }
} catch (error) {
  erro(
    `Nao consegui ler /api/config/public: ${error.message}`,
    "Confira se o dominio esta no ar."
  )
}

encerrar()
