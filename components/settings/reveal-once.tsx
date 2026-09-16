"use client"

import * as React from "react"
import { Check, Copy, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Mostra um segredo que só existe neste instante (o token do webhook).
 *
 * O banco guarda apenas o hash, então este valor não pode ser recuperado
 * depois — daí o aviso explícito e o botão de copiar.
 */
export function RevealOnce({ token }: { token: string }) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard bloqueado (http, permissão): o valor está visível na tela
      // para seleção manual, então não há o que fazer além de não quebrar.
    }
  }

  return (
    <div className="rounded-xl border border-amber/40 bg-amber/5 p-4">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Copie agora</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Este token não aparece de novo. O banco guarda só o hash dele.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-background/80 px-3 py-2 font-mono text-xs break-all">
              {token}
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
        </div>
      </div>
    </div>
  )
}
