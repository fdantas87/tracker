"use client"

import * as React from "react"
import Link from "next/link"
import { Check, Copy, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ShaderCard } from "@/components/ui/shader-card"

/**
 * Instruções de instalação do track.js na aba Geral — sem checagem ao vivo:
 * a confirmação é o próprio usuário abrindo a tela Eventos (ver nota abaixo
 * sobre janela anônima).
 */
export function InstallationSection() {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const snippet = `<script src="${origin}/track.js" defer></script>`

  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-8 text-center sm:p-12 shadow-sm">
      {/* Decorative background glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-full max-w-md -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-3xl" />

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-10">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Conexão com o site</h2>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground sm:text-base">
            Instale o script de captura no site e confirme que os eventos estão chegando.
          </p>
        </div>

        <div className="w-full">
          <CopySnippet snippet={snippet} />
        </div>

        <div className="flex w-full flex-col items-center pt-2">
          <div 
            className="flex w-full items-center justify-center gap-2.5 text-center text-[15px] text-muted-foreground whitespace-normal lg:whitespace-nowrap"
            style={{ fontFamily: "'Manrope', sans-serif" }}
          >
            <TriangleAlert className="size-[18px] shrink-0 text-amber-500" />
            <p className="text-balance lg:text-left">
              Abra o site <strong>SEMPRE</strong> numa janela anônima e depois acesse a tela{" "}
              <Link href="/eventos" className="text-primary underline underline-offset-4 transition-colors hover:text-primary/80">
                Eventos
              </Link>{" "}
              — um PageView deve aparecer em poucos segundos.
            </p>
          </div>
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
    <div className="relative flex w-full flex-col items-center gap-4 sm:flex-row sm:items-stretch">
      <div className="relative flex w-full flex-col items-center justify-between gap-3 overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-b from-primary/5 to-transparent p-2 shadow-sm transition-colors hover:border-primary/20 sm:flex-row">
        <ShaderCard roundness="md" />
        
        <div className="relative z-10 flex w-full flex-col items-center justify-between gap-3 overflow-hidden sm:flex-row">
          {/* Máscara horizontal para esconder o texto quando ultrapassar o espaço, sem barra de rolagem */}
          <div 
            className="relative flex-1 w-full overflow-hidden"
            style={{ 
              maskImage: "linear-gradient(to right, black 75%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to right, black 75%, transparent 100%)"
            }}
          >
            <code 
              className="block px-4 py-2 text-left font-mono text-[40px] leading-none tracking-tight text-foreground whitespace-nowrap" 
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {snippet}
            </code>
          </div>

          <Button
            type="button"
            variant={copied ? "secondary" : "default"}
            size="default"
            onClick={copy}
            className="z-10 w-full shrink-0 gap-2 h-12 rounded-xl px-6 sm:w-auto"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copiado" : "Copiar código"}
          </Button>
        </div>
      </div>
    </div>
  )
}
