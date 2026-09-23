"use client"

import * as React from "react"
import { useActionState } from "react"
import { KeyRound, LoaderCircle, Webhook, Check, Copy } from "lucide-react"

import { regenerateWebhookToken } from "@/app/(dashboard)/pixels/actions"
import { IDLE_STATE } from "@/lib/settings/action-state"
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

function WebhookUrlHelp() {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const webhookUrl = `${origin}/api/webhook/compra/perfectpay?token=SEU_TOKEN`
  
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-6 pt-8 mt-2 border-t border-primary/10">
      <div className="flex flex-col items-center space-y-2">
        <p className="text-[15px] font-semibold">URL para cadastrar no PerfectPay</p>
        <p className="text-[13px] text-muted-foreground max-w-xl text-balance">
          Em Ferramentas → PostBack/Webhook, cadastre a URL abaixo trocando <code className="font-mono text-[13px] font-bold text-foreground">SEU_TOKEN</code> pelo token que você copiou.
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

      <div className="flex w-full flex-col items-center pt-2">
        <div 
          className="flex w-full items-start justify-center gap-2.5 text-left text-[14px] leading-relaxed text-muted-foreground sm:items-center sm:text-center"
          style={{ fontFamily: "var(--font-manrope), sans-serif" }}
        >
          <p className="text-balance">
            Para a compra ser ligada à visita, o PerfectPay precisa repassar o campo <strong>src</strong> — o script de captura já preenche isso nos links de checkout.
          </p>
        </div>
      </div>
    </div>
  )
}