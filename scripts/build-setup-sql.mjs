#!/usr/bin/env node
/**
 * Gera `supabase/setup.sql` — o arquivo único que um cliente novo cola uma vez
 * no SQL Editor do Supabase, no lugar de aplicar as migrations uma a uma.
 *
 *   node scripts/build-setup-sql.mjs            escreve o arquivo
 *   node scripts/build-setup-sql.mjs --check    falha se estiver desatualizado
 *
 * O `--check` roda dentro do `npm run build` (ver package.json), então vale
 * também na Vercel. Mesmo espírito do check-server-actions.mjs: guardar contra
 * um erro que nada mais pegaria — aqui, um cliente novo receber um banco
 * incompleto porque alguém acrescentou uma migration e esqueceu de regerar.
 *
 * DUAS REGRAS QUE PARECEM DETALHE E NÃO SÃO:
 *
 * 1. Isto é concatenação BURRA, de propósito. Não transforme o SQL, não
 *    "simplifique" backfill que é no-op em banco vazio (o truque de dois
 *    passos da migration do event_queue, o `drop function if exists` da de
 *    geo, o `update ... where platform='perfectpay'` da de forma de
 *    pagamento). Eles parecem errados e estão certos. Transformar criaria um
 *    segundo dialeto de SQL para manter em sincronia com o primeiro.
 *
 * 2. Tudo é normalizado para LF. Com `core.autocrlf=true` (padrão no Windows)
 *    as migrations ficam CRLF na árvore e LF no repositório; ler e escrever
 *    bytes crus faria o `--check` passar aqui e falhar na Vercel, com a árvore
 *    perfeitamente correta. O `.gitattributes` cobre o outro lado (o arquivo
 *    gerado não sujar o `git status`).
 */

import { createHash } from "node:crypto"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = process.cwd()
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations")
const PREFLIGHT = join(ROOT, "supabase", "setup-preflight.sql")
const OUTPUT = join(ROOT, "supabase", "setup.sql")

/**
 * Nome de migration válido: 14 dígitos + underscore + minúsculas.
 *
 * A largura FIXA do prefixo é o que torna a ordenação lexicográfica igual à
 * cronológica — e é por isso que este regex existe. Um arquivo com prefixo de
 * outro tamanho faria a ordem mentir em silêncio, então ele falha o script em
 * vez de ser ignorado.
 */
const NOME_VALIDO = /^(\d{14})_[a-z0-9_]+\.sql$/

/** Lê um arquivo já normalizado para LF. */
function ler(caminho) {
  return readFileSync(caminho, "utf8").replace(/\r\n/g, "\n")
}

function sha(texto) {
  return createHash("sha256").update(texto, "utf8").digest("hex").slice(0, 8)
}

function listarMigrations() {
  const arquivos = readdirSync(MIGRATIONS_DIR).filter((nome) =>
    nome.endsWith(".sql")
  )

  const invalidos = arquivos.filter((nome) => !NOME_VALIDO.test(nome))
  if (invalidos.length > 0) {
    erro(
      "migration com nome fora do padrão <14 dígitos>_<nome>.sql:\n" +
        invalidos.map((nome) => `  supabase/migrations/${nome}`).join("\n") +
        "\n\nO nome define a ordem de aplicação. Renomeie antes de seguir."
    )
  }

  // Comparação de string crua, nunca localeCompare (que depende de locale).
  arquivos.sort()

  const vistos = new Map()
  for (const nome of arquivos) {
    const timestamp = NOME_VALIDO.exec(nome)[1]
    if (vistos.has(timestamp)) {
      erro(
        `duas migrations com o mesmo timestamp (${timestamp}):\n` +
          `  supabase/migrations/${vistos.get(timestamp)}\n` +
          `  supabase/migrations/${nome}\n\n` +
          "A ordem entre elas seria arbitrária. Renomeie uma."
      )
    }
    vistos.set(timestamp, nome)
  }

  return arquivos.map((nome) => join(MIGRATIONS_DIR, nome))
}

function gerar() {
  const fontes = [PREFLIGHT, ...listarMigrations()].map((caminho) => ({
    rotulo: relative(ROOT, caminho).replace(/\\/g, "/"),
    conteudo: ler(caminho),
  }))

  const largura = Math.max(...fontes.map((f) => f.rotulo.length))
  const indice = fontes
    .map((f) => `--   ${f.rotulo.padEnd(largura)}  ${sha(f.conteudo)}`)
    .join("\n")

  const cabecalho = [
    "-- ============================================================================",
    "-- GERADO AUTOMATICAMENTE — NÃO EDITE ESTE ARQUIVO.",
    "-- ============================================================================",
    "-- Fonte:    supabase/setup-preflight.sql + supabase/migrations/*.sql",
    "-- Regerar:  npm run build:setup-sql",
    "--",
    "-- O `npm run build` falha se este arquivo estiver desatualizado em relação",
    "-- às migrations. Edite a migration, não o resultado.",
    "--",
    "-- COMO USAR (cliente novo): cole este arquivo INTEIRO no SQL Editor do",
    "-- Supabase e rode uma vez. O editor executa tudo numa transação única, então",
    "-- ou o schema inteiro aplica, ou nada aplica — não existe meio-termo.",
    "--",
    `-- ${fontes.length} arquivos, na ordem de aplicação:`,
    indice,
    "-- ============================================================================",
    "",
    "",
  ].join("\n")

  const corpo = fontes
    .map((f) => `-- >>> ${f.rotulo}\n${f.conteudo.trimEnd()}\n`)
    .join("\n")

  // O `trimEnd` acima não é cosmético: uma das migrations termina numa linha de
  // comentário `--`, e sem newline garantido entre os arquivos a primeira linha
  // do arquivo seguinte viraria comentário e sumiria em silêncio.
  return cabecalho + corpo
}

function erro(mensagem) {
  console.error(`\nErro: ${mensagem}\n`)
  process.exit(1)
}

// ---------------------------------------------------------------------------

const esperado = gerar()

if (process.argv.includes("--check")) {
  let atual
  try {
    atual = ler(OUTPUT)
  } catch {
    erro(
      "supabase/setup.sql não existe.\n" +
        "  Rode:  npm run build:setup-sql   e commite o resultado."
    )
  }

  if (atual !== esperado) {
    // Diz O QUE mudou, não só que mudou: a diferença quase sempre é uma
    // migration nova ou editada, e nomear o arquivo poupa o `git diff` num
    // arquivo de dezenas de milhares de linhas.
    const fontesAtuais = new Map(
      [...atual.matchAll(/^--   (\S+)\s+([0-9a-f]{8})$/gm)].map((m) => [
        m[1],
        m[2],
      ])
    )
    const fontesNovas = new Map(
      [...esperado.matchAll(/^--   (\S+)\s+([0-9a-f]{8})$/gm)].map((m) => [
        m[1],
        m[2],
      ])
    )

    const mudancas = []
    for (const [arquivo, hash] of fontesNovas) {
      if (!fontesAtuais.has(arquivo)) mudancas.push(`${arquivo} (novo)`)
      else if (fontesAtuais.get(arquivo) !== hash)
        mudancas.push(`${arquivo} (alterado)`)
    }
    for (const arquivo of fontesAtuais.keys()) {
      if (!fontesNovas.has(arquivo)) mudancas.push(`${arquivo} (removido)`)
    }
    if (mudancas.length === 0) {
      mudancas.push("o próprio setup.sql foi editado à mão")
    }

    erro(
      "supabase/setup.sql está desatualizado.\n" +
        mudancas.map((m) => `  Mudou: ${m}`).join("\n") +
        "\n  Rode:  npm run build:setup-sql   e commite o resultado."
    )
  }

  console.log("OK: supabase/setup.sql está em dia com as migrations.")
} else {
  writeFileSync(OUTPUT, esperado, "utf8")
  const linhas = esperado.split("\n").length
  console.log(
    `OK: supabase/setup.sql gerado (${linhas} linhas, ` +
      `${(Buffer.byteLength(esperado, "utf8") / 1024).toFixed(1)} KB).`
  )
}
