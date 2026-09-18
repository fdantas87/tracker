/**
 * Verificador da fase 7.5 — disparo atrasado.
 *
 *   npm run verify:dispatch
 *
 * Responde três perguntas, em ordem, e para na primeira que falhar:
 *   1. a produção está com o código desta fase?
 *   2. o painel está configurado (URL do cron preenchida)?
 *   3. o pg_cron está REALMENTE drenando a fila?
 *
 * A pergunta 3 é a que importa e a única que não dá pra responder olhando
 * configuração: ele cria um evento de teste, libera a fila e ESPERA o cron
 * agir sozinho, sem chamar o endpoint. Se o evento sair, o ciclo inteiro
 * (Supabase -> pg_net -> Vercel -> Meta) está de pé.
 *
 * Para não sujar os dados do pixel, o teste exige um test_event_code real
 * (Events Manager -> Eventos de teste). Ele é gravado, usado e restaurado ao
 * valor anterior no fim — e as linhas criadas são apagadas.
 *
 *   npm run verify:dispatch -- --test-code TEST12345
 *   npm run verify:dispatch -- --só-configuracao     (pula o teste ao vivo)
 */
import { readFileSync } from "node:fs"
import { randomBytes } from "node:crypto"

const args = process.argv.slice(2)
const testCode = valueOf("--test-code")
const configOnly = args.includes("--so-configuracao") || args.includes("--só-configuracao")

function valueOf(flag) {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}

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
const HJ = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rest = async (path, init = {}) => {
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: HJ, ...init })
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return text
  }
}

const problemas = []
function erro(titulo, oQueFazer) {
  problemas.push({ titulo, oQueFazer })
  console.log(`\n  [X] ${titulo}`)
  console.log(`      O QUE FAZER: ${oQueFazer}`)
}
function ok(texto) {
  console.log(`  [ok] ${texto}`)
}

// ---------------------------------------------------------------------------
// 1. A produção está com o código desta fase?
// ---------------------------------------------------------------------------
console.log("\n1) A producao esta com o codigo da fase 7.5?")

const settings = (
  await rest(
    "settings?select=dispatch_mode,dispatch_delay_seconds,dispatch_cron_url,dispatch_cron_token_vault_id,test_event_code,form_capture_enabled&id=eq.true"
  )
)?.[0]

if (!settings) {
  erro(
    "Nao consegui ler a tabela settings.",
    "Confira o .env.local (NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY)."
  )
  encerrar()
}

const BASE = settings.dispatch_cron_url
  ? new URL(settings.dispatch_cron_url).origin
  : "https://tracking.negou.net"

let temCodigoNovo = false
try {
  const res = await fetch(`${BASE}/api/config/public`)
  const body = await res.json()
  temCodigoNovo = Object.hasOwn(body, "dispatch")
  if (temCodigoNovo) {
    ok(`${BASE} esta com o codigo novo (modo: ${body.dispatch?.mode}).`)
  } else {
    erro(
      `${BASE} ainda esta com o codigo ANTIGO.`,
      "Faca o deploy da versao atual desta pasta. Enquanto isso nao acontecer, o endpoint /api/cron/dispatch nao existe la e a fila nunca vai drenar."
    )
  }
} catch (error) {
  erro(
    `Nao consegui falar com ${BASE}: ${error.message}`,
    "Confira se o dominio esta no ar."
  )
}

if (temCodigoNovo) {
  const res = await fetch(`${BASE}/api/cron/dispatch`, {
    method: "POST",
    headers: { "x-cron-token": "sonda-invalida" },
  })
  if (res.status === 401) {
    ok("O endpoint /api/cron/dispatch existe e recusa token invalido (401).")
  } else if (res.status === 404) {
    erro(
      "O endpoint /api/cron/dispatch nao existe na producao (404).",
      "O deploy nao levou o codigo novo. Refaca o deploy."
    )
    temCodigoNovo = false
  } else if (res.status === 503) {
    erro(
      "O endpoint respondeu 503: nao ha token do cron gravado.",
      'No painel, aba Disparo, clique em "Gerar token do cron".'
    )
  } else {
    console.log(`  [?] /api/cron/dispatch respondeu ${res.status} (esperado 401).`)
  }
}

// ---------------------------------------------------------------------------
// 2. O painel está configurado?
// ---------------------------------------------------------------------------
console.log("\n2) O painel esta configurado?")

if (settings.dispatch_cron_url) {
  ok(`URL do cron: ${settings.dispatch_cron_url}`)
} else {
  erro(
    "A URL do cron esta VAZIA, entao ninguem drena a fila.",
    'No painel (aba Disparo), preencha "URL do cron" com https://tracking.negou.net/api/cron/dispatch e clique em Salvar. Faca isso DEPOIS do deploy.'
  )
}

if (settings.dispatch_cron_token_vault_id) {
  ok("Token do cron gravado no Vault.")
} else {
  erro(
    "Nao existe token do cron.",
    'No painel, aba Disparo, clique em "Gerar token do cron".'
  )
}

ok(`Modo: ${settings.dispatch_mode} · janela: ${settings.dispatch_delay_seconds / 60} min`)
ok(`Leitura de formularios: ${settings.form_capture_enabled ? "ligada" : "desligada"}`)

if (settings.test_event_code) {
  erro(
    `test_event_code esta PREENCHIDO ("${settings.test_event_code}").`,
    "Enquanto tiver valor, NENHUM evento conta para atribuicao ou otimizacao no Meta. Limpe o campo no painel (aba Geral) assim que terminar de testar."
  )
} else {
  ok("test_event_code vazio (os eventos contam de verdade).")
}

const fila = (await rest("rpc/event_queue_depth", { method: "POST", body: "{}" }))?.[0]
if (fila) {
  ok(`Fila: ${fila.pending} aguardando, ${fila.due} vencidos, ${fila.failed} falhados.`)
  if (fila.due > 200) {
    erro(
      `${fila.due} eventos venceram e nao sairam.`,
      "Sinal de que o cron nao esta rodando. Confira os itens acima."
    )
  }
}

// ---------------------------------------------------------------------------
// 3. O cron está drenando de verdade?
// ---------------------------------------------------------------------------
if (configOnly) {
  console.log("\n3) Teste ao vivo: PULADO (--so-configuracao).")
  encerrar()
}

if (problemas.length > 0) {
  console.log("\n3) Teste ao vivo: PULADO, resolva os itens acima primeiro.")
  encerrar()
}

if (!testCode) {
  console.log("\n3) Teste ao vivo: PULADO.")
  console.log(
    "   Para provar que o cron esta drenando, rode de novo passando um codigo de\n" +
      "   teste real do Events Manager (Eventos de teste):\n\n" +
      "     npm run verify:dispatch -- --test-code SEU_CODIGO\n\n" +
      "   Sem ele, o evento de teste entraria nos dados de producao do pixel."
  )
  encerrar()
}

console.log("\n3) O pg_cron esta drenando a fila de verdade?")
console.log("   (cria um evento, libera a fila e ESPERA o cron agir sozinho)")

const TUID = `verifica-${randomBytes(6).toString("hex")}`
const EVENT = `verifica-${randomBytes(6).toString("hex")}`
const codigoAnterior = settings.test_event_code

try {
  await rest("settings?id=eq.true", {
    method: "PATCH",
    body: JSON.stringify({ test_event_code: testCode }),
  })

  // Inserido direto no banco pra não depender do endpoint público.
  await rest("visitors", {
    method: "POST",
    body: JSON.stringify({ trck_user_id: TUID, email: "verifica@negou.test" }),
  })
  await rest("events_log", {
    method: "POST",
    body: JSON.stringify({
      trck_user_id: TUID,
      event_name: "PageView",
      event_id: EVENT,
      event_time: new Date().toISOString(),
      event_source_url: "https://tracking.negou.net/verificacao",
      dispatch_status: "pending",
      dispatch_after: new Date().toISOString(),
    }),
  })
  ok("Evento de teste criado e vencido na fila.")

  console.log("   Aguardando o cron (ele roda a cada minuto; espero ate 3)...")
  let status = "pending"
  for (let i = 1; i <= 18; i++) {
    await sleep(10_000)
    const row = (
      await rest(`events_log?select=dispatch_status,response_meta&event_id=eq.${EVENT}`)
    )?.[0]
    status = row?.dispatch_status
    if (status && status !== "pending") {
      const meta = Array.isArray(row.response_meta) ? row.response_meta[0] : null
      if (status === "sent" && meta?.response?.events_received === 1) {
        ok(`O CRON FUNCIONOU. O Meta confirmou o recebimento (${i * 10}s).`)
      } else if (status === "sent") {
        ok(`O cron enviou (${i * 10}s), mas o Meta nao confirmou: ${JSON.stringify(meta?.response)}`)
      } else {
        erro(
          `O cron pegou o evento mas o status virou "${status}".`,
          `Veja response_meta no banco. Detalhe: ${JSON.stringify(meta?.response)}`
        )
      }
      break
    }
    process.stdout.write(`   ...${i * 10}s\r`)
  }

  if (status === "pending") {
    erro(
      "Passaram 3 minutos e o cron nao tocou no evento.",
      "Confira no Supabase: a extensao pg_net esta habilitada (Database -> Extensions)? " +
        "E rode `select * from cron.job where jobname = 'dispatch_event_queue_minutely';` " +
        "no SQL Editor pra ver se o agendamento esta ativo."
    )
  }
} catch (error) {
  erro(`Falha inesperada no teste: ${error.message}`, "Me mande esta mensagem.")
} finally {
  await rest("settings?id=eq.true", {
    method: "PATCH",
    body: JSON.stringify({ test_event_code: codigoAnterior }),
  })
  await rest(`visitors?trck_user_id=eq.${TUID}`, { method: "DELETE" })
  const restou = await rest(`events_log?select=event_id&event_id=eq.${EVENT}`)
  console.log(
    `\n  Limpeza: test_event_code restaurado para ${JSON.stringify(codigoAnterior)}; ` +
      `linhas de teste restantes: ${restou?.length ?? "?"}.`
  )
}

encerrar()

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
