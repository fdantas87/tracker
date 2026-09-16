#!/usr/bin/env node
/**
 * Guarda contra um erro que nem o `next build` nem o ESLint pegam.
 *
 * Um arquivo `"use server"` só pode exportar funções assíncronas. Exportar uma
 * constante de lá derruba a página em tempo de execução ("A use server file
 * can only export async functions, found object") — e como o erro só aparece
 * quando o módulo é avaliado, um build verde não prova nada. Aconteceu de
 * verdade na fase 4, com um `export const IDLE_STATE`.
 *
 * Exports de TIPO são permitidos: somem na compilação, não viram export real.
 *
 * Roda junto do build (ver package.json), então vale também na Vercel.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = process.cwd()
const SEARCH_DIRS = ["app", "lib", "components", "hooks"]
const IGNORED_DIRS = new Set(["node_modules", ".next", ".git"])

function collectFiles(dir, found = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return found
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      collectFiles(fullPath, found)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      found.push(fullPath)
    }
  }
  return found
}

function isUseServerFile(source) {
  // A diretiva tem que estar no topo, antes de qualquer código (comentários
  // e linhas em branco podem vir antes).
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) {
      continue
    }
    return /^["']use server["'];?$/.test(line)
  }
  return false
}

const problems = []

for (const dir of SEARCH_DIRS) {
  for (const file of collectFiles(join(ROOT, dir))) {
    const source = readFileSync(file, "utf8")
    if (!isUseServerFile(source)) continue

    source.split("\n").forEach((rawLine, index) => {
      const line = rawLine.trim()
      if (!line.startsWith("export")) return

      // Permitido: função assíncrona, e qualquer export puramente de tipo.
      if (/^export\s+async\s+function\s/.test(line)) return
      if (/^export\s+(type|interface)\s/.test(line)) return
      if (/^export\s+type\s*\{/.test(line)) return

      problems.push({
        file: relative(ROOT, file),
        line: index + 1,
        text: line,
      })
    })
  }
}

if (problems.length > 0) {
  console.error(
    '\nErro: arquivo "use server" com export que não é função assíncrona.\n' +
      "Mova valores (constantes, objetos) para um módulo separado.\n"
  )
  for (const problem of problems) {
    console.error(`  ${problem.file}:${problem.line}  ${problem.text}`)
  }
  console.error("")
  process.exit(1)
}

console.log('OK: todos os arquivos "use server" exportam só funções assíncronas.')
