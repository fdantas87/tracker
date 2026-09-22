"use client"

import * as React from "react"
import Link from "next/link"
import { Check, Copy, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Instruções de instalação do track.js na aba Geral — sem checagem ao vivo:
 * a confirmação é o próprio usuário abrindo a tela Eventos (ver nota abaixo
 * sobre janela anônima).
 */
export function InstallationSection() {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const snippet = `<script src="${origin}/track.js" defer></script>`

  return (
    <div className="glass flex flex-col gap-4 rounded-2xl p-6">
      <div>
        <h2 className="text-base font-medium">Conexão com o site</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Instale o script de captura no site e confirme que os eventos estão
          chegando.
        </p>
      </div>

      <div className="rounded-xl border bg-background/40 p-4">
        <p className="text-sm font-medium">
          Passo 1: insira o código na tag <code className="font-mono">&lt;head&gt;</code> do
          site
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cole antes de qualquer outra tag de analytics, em todas as páginas.
        </p>
        <CopySnippet snippet={snippet} />
      </div>

      <div className="rounded-xl border bg-background/40 p-4">
        <p className="text-sm font-medium">Passo 2: confirme a instalação</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Abra o site numa janela anônima e depois abra a tela{" "}
          <Link href="/eventos" className="text-primary underline underline-offset-2">
            Eventos
          </Link>{" "}
          — um PageView deve aparecer em poucos segundos.
        </p>

        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/5 p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-xs text-muted-foreground">
            Teste sempre em janela anônima. Testar logado, no mesmo navegador
            do painel, não prova nada: a sessão da Vercel atravessa a proteção
            de deploy e o site carrega normalmente mesmo se um visitante
            comum estivesse sendo bloqueado.
          </p>
        </div>
      </div>
    </div>
  )
}

function CopySnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard bloqueado (http, permissão): o valor segue visível na tela
      // para seleção manual.
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-background/80 px-3 py-2 font-mono text-xs break-all">
        {snippet}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        className="shrink-0"
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  )
}
