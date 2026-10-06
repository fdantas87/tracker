"use client"

import * as React from "react"
import { Bot, Check, Copy, LoaderCircle } from "lucide-react"

import { generateClarityMcpToken } from "@/app/(dashboard)/mapa-de-calor/actions"
import type { ActionState } from "@/lib/settings/action-state"
import { RevealOnce } from "@/components/settings/reveal-once"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ClarityNavButton } from "./clarity-nav-button"

/**
 * Conexão do Claude (ou outro cliente MCP) aos dados do Clarity DESTE deploy.
 *
 * O MCP é servido pelo próprio tracker (/api/mcp) e lê o que já foi
 * sincronizado — não gasta nenhuma das 10 consultas diárias do Clarity. É por
 * isso que ele existe em vez de mandar o cliente usar o MCP oficial da
 * Microsoft, que roda na máquina dele e consome a mesma cota a cada pergunta.
 */
export function ClarityMcpDialog({ hasMcpToken }: { hasMcpToken: boolean }) {
  const [pending, startTransition] = React.useTransition()
  const [state, setState] = React.useState<ActionState | null>(null)

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const url = `${origin}/api/mcp`
  const token = state?.revealedToken ?? "SEU_TOKEN"

  function gerar() {
    startTransition(async () => {
      setState(await generateClarityMcpToken())
    })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <ClarityNavButton icone={<Bot />} rotulo="Conectar ao Claude" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consultar o Clarity pelo Claude (MCP)</DialogTitle>
          <DialogDescription>
            Pergunte em linguagem natural — “quais páginas tiveram mais rage
            clicks esta semana?” — e o Claude responde com os mesmos números
            desta tela. As respostas saem do que o tracker já sincronizou, então
            não gastam a cota diária do Clarity.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 text-sm">
          <section className="flex flex-col gap-2">
            <p className="font-medium">1. Token de acesso</p>
            {state?.revealedToken ? (
              <RevealOnce token={state.revealedToken} />
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button onClick={gerar} disabled={pending} size="sm">
                  {pending ? <LoaderCircle className="animate-spin" /> : null}
                  {hasMcpToken ? "Gerar novo token" : "Gerar token"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {hasMcpToken
                    ? "Já existe um token. Gerar outro desliga o anterior na hora."
                    : "Mostrado uma única vez. O banco guarda só o hash."}
                </p>
              </div>
            )}
            {state && !state.ok && state.message ? (
              <p className="text-xs text-destructive">{state.message}</p>
            ) : null}
          </section>

          <section className="flex flex-col gap-2">
            <p className="font-medium">2. Claude Code (terminal)</p>
            <Comando
              texto={`claude mcp add --transport http clarity ${url} --header "Authorization: Bearer ${token}"`}
            />
          </section>

          <section className="flex flex-col gap-2">
            <p className="font-medium">3. Claude no navegador ou no app</p>
            <p className="text-xs text-muted-foreground">
              Configurações → Conectores → Adicionar conector personalizado, com
              esta URL (o token vai nela porque essa tela não aceita cabeçalho):
            </p>
            <Comando texto={`${url}?token=${token}`} />
            <p className="text-xs text-muted-foreground">
              Trate essa URL como senha: quem a tiver lê os KPIs do Clarity deste
              painel. Se vazar, gere um novo token acima.
            </p>
          </section>

          <details className="rounded-xl border p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">
              E o MCP oficial da Microsoft?
            </summary>
            <p className="mt-2">
              Existe (<code className="font-mono">@microsoft/clarity-mcp-server</code>)
              e também lista gravações. Mas ele roda na sua máquina, usa o token
              da Data Export API e cada pergunta consome uma das 10 consultas
              diárias do projeto — as mesmas que o tracker usa para sincronizar.
              Se for usá-lo, gere para ele um token separado no Clarity e saiba
              que os dois dividem a cota.
            </p>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Comando({ texto }: { texto: string }) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard bloqueado: o texto está visível para seleção manual.
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border bg-background/80 p-2">
      <code className="min-w-0 flex-1 break-all px-2 py-1 font-mono text-xs">{texto}</code>
      <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label="Copiar">
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  )
}
