"use client"

import * as React from "react"
import { useActionState } from "react"
import { KeyRound, LoaderCircle, Webhook, Check, Copy } from "lucide-react"

import { regenerateWebhookToken } from "@/app/(dashboard)/pixels/actions"
import { IDLE_STATE } from "@/lib/settings/action-state"
import {
  CUSTOM_PAYLOAD_EXAMPLE,
  CUSTOM_STATUS_DOC,
} from "@/lib/webhooks/adapters/custom"
import { Button } from "@/components/ui/button"
import { RevealOnce } from "@/components/settings/reveal-once"

export function WebhookTab() {
  const [state, formAction, isPending] = useActionState(
    async () => await regenerateWebhookToken(),
    IDLE_STATE
  )

  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-8 text-center sm:p-12 shadow-sm">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-full max-w-md -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-3xl" />

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-10">
        <div className="flex flex-col items-center space-y-3">
          <div className="flex items-center gap-2.5">
            <Webhook className="size-7 text-primary" />
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Token do webhook</h2>
          </div>
          <p className="mx-auto max-w-lg text-[14px] text-muted-foreground sm:text-base text-balance">
            Autentica as compras que chegam da plataforma de venda. Está salvo
            apenas como hash, então não dá para consultá-lo — se perder, gere
            outro e atualize a URL cadastrada na plataforma.
          </p>
        </div>

        <div className="flex w-full flex-col items-center gap-6">
          <form action={formAction} className="flex flex-col items-center">
            <Button type="submit" size="lg" className="gap-2 h-12 rounded-xl px-12" disabled={isPending}>
              {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              Gerar token novo
            </Button>
            {state.message && !state.ok ? (
              <p className="mt-3 text-sm font-medium text-destructive">{state.message}</p>
            ) : null}
          </form>
          
          {state.revealedToken ? (
            <div className="w-full max-w-2xl pt-2">
              <RevealOnce token={state.revealedToken} />
            </div>
          ) : null}
        </div>

        <WebhookUrlHelp />
      </div>
    </div>
  )
}

const PAYLOAD_JSON = JSON.stringify(CUSTOM_PAYLOAD_EXAMPLE, null, 2)

/** Copia um texto e mostra "Copiado" por 2s. Clipboard bloqueado: o texto segue visível. */
function useCopy(text: string) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return { copied, copy }
}

function WebhookUrlHelp() {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const webhookUrl = `${origin}/api/webhook/compra/custom?token=SEU_TOKEN`

  const { copied, copy } = useCopy(webhookUrl)

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-6 pt-8 mt-2 border-t border-primary/10">
      <div className="flex flex-col items-center space-y-2">
        <p className="text-[15px] font-semibold">URL do webhook de compra</p>
        <p className="text-[13px] text-muted-foreground max-w-xl text-balance">
          Para qualquer plataforma sem integração própria — direto ou via n8n,
          Make ou Zapier. Troque <code className="font-mono text-[13px] font-bold text-foreground">SEU_TOKEN</code> pelo
          token gerado acima; ele também pode ir no header{" "}
          <code className="font-mono text-[13px] text-foreground">x-webhook-token</code> ou no campo{" "}
          <code className="font-mono text-[13px] text-foreground">token</code> do JSON.
        </p>
      </div>

      <div className="relative flex w-full flex-col items-center gap-4 sm:flex-row sm:items-stretch">
        <div className="flex w-full flex-col items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-background/80 p-2 shadow-sm backdrop-blur transition-colors hover:border-primary/40 sm:flex-row overflow-hidden">
          
          <div 
            className="relative flex-1 w-full overflow-hidden"
            style={{ 
              maskImage: "linear-gradient(to right, black 75%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to right, black 75%, transparent 100%)"
            }}
          >
            <code 
              className="block px-4 py-2 text-left font-mono text-[16px] sm:text-[18px] leading-tight tracking-tight text-foreground whitespace-nowrap" 
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {webhookUrl}
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
            {copied ? "Copiado" : "Copiar URL"}
          </Button>
        </div>
      </div>

      <PayloadContract />
    </div>
  )
}

function PayloadContract() {
  const { copied, copy } = useCopy(PAYLOAD_JSON)

  return (
    <div className="flex w-full flex-col gap-6 pt-2 text-left">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-[15px] font-semibold">Payload de integração (JSON)</p>
            <p className="text-[13px] text-muted-foreground">
              Envie por POST, com <code className="font-mono text-foreground">Content-Type: application/json</code>.
            </p>
          </div>
          <Button
            type="button"
            variant={copied ? "secondary" : "outline"}
            onClick={copy}
            className="h-10 shrink-0 gap-2 rounded-xl"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copiado" : "Copiar JSON"}
          </Button>
        </div>
        <pre className="max-h-[28rem] overflow-auto rounded-2xl border border-primary/20 bg-background/80 p-4 font-mono text-[12px] leading-relaxed sm:text-[13px]">
          <code>{highlightJson(PAYLOAD_JSON)}</code>
        </pre>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-[15px] font-semibold">
          Valores de <code className="font-mono">event.status</code>
        </p>
        <div className="overflow-hidden rounded-2xl border border-primary/10">
          <table className="w-full text-[13px]">
            <tbody>
              {CUSTOM_STATUS_DOC.map((linha) => (
                <tr key={linha.status} className="border-b border-primary/10 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 align-top font-mono text-foreground">
                    {linha.status}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{linha.efeito}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <li>
            <code className="font-mono text-foreground">transaction.id</code> é a chave da
            venda: o mesmo id em envios seguintes atualiza a mesma linha, e o Purchase sai
            uma vez só. Reembolso, cancelamento e chargeback precisam só do id e do status.
          </li>
          <li>
            Para ligar a venda à visita, mande em{" "}
            <code className="font-mono text-foreground">parameter.src</code> o id de rastreio
            que o script de captura põe nos links de checkout. Sem ele, a venda é casada pelo
            email ou telefone do <code className="font-mono text-foreground">lead</code>.
          </li>
          <li>
            <code className="font-mono text-foreground">payment.method</code>:{" "}
            <code className="font-mono text-foreground">credit_card</code>,{" "}
            <code className="font-mono text-foreground">billet</code>,{" "}
            <code className="font-mono text-foreground">pix</code> ou{" "}
            <code className="font-mono text-foreground">other</code>.{" "}
            <code className="font-mono text-foreground">product.omit_from_ads: true</code>{" "}
            mantém nome e id do produto só no painel, fora do Meta e do GA4.
          </li>
        </ul>
      </div>
    </div>
  )
}

/** Realce mínimo de JSON: chave, texto, número e literal, sem biblioteca. */
function highlightJson(json: string): React.ReactNode[] {
  const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g
  const nodes: React.ReactNode[] = []
  let last = 0

  for (const match of json.matchAll(TOKEN)) {
    const index = match.index ?? 0
    if (index > last) nodes.push(json.slice(last, index))

    const [whole, string, colon, literal] = match
    if (string && colon) {
      nodes.push(<span key={index} className="text-cyan">{string}</span>, colon)
    } else if (string) {
      nodes.push(<span key={index} className="text-primary">{string}</span>)
    } else {
      nodes.push(
        <span key={index} className={literal ? "text-chart-4" : "text-amber"}>{whole}</span>
      )
    }
    last = index + whole.length
  }

  if (last < json.length) nodes.push(json.slice(last))
  return nodes
}