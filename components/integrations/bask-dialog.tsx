"use client"

import * as React from "react"
import { Check, Copy, Info } from "lucide-react"

import { baskBridgeSnippet } from "@/lib/integrations/bask-bridge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** O que a ponte traduz. Espelha o comentário de lib/integrations/bask-bridge.ts. */
const TRADUCAO = [
  { bask: "signup", tracker: "Lead", quando: "conta criada ou login no questionário" },
  { bask: "add_to_cart", tracker: "InitiateCheckout", quando: "plano escolhido no checkout" },
  { bask: "purchase", tracker: "SubmitApplication", quando: "tela de obrigado — checkout enviado" },
]

/**
 * Instalação do tracker nas páginas da Bask (questionário e checkout).
 *
 * Só instruções e o código: a Bask não tem credencial para guardar aqui. O
 * Purchase da Bask depende do add-on Webhooks dela, que não está ligado — por
 * isso não há card de "conectado" nem URL de webhook nesta etapa.
 */
export function BaskDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const snippet = baskBridgeSnippet(origin)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bask — questionário e checkout</DialogTitle>
          <DialogDescription>
            O código abaixo carrega o tracker nas páginas da Bask e traduz os
            eventos do questionário. Quem envia para o Meta e o GA4 passa a ser
            o tracker.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-4 text-sm">
          <li>
            <p className="font-medium">1. Desligue o que contaria em dobro</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Na Bask, em Settings → Apps &amp; Integrations: tire o ID do GA4 do
              card Google Analytics se for o mesmo cadastrado neste painel, e
              deixe o Meta Pixel da Bask desligado. Os dois ligados com o mesmo
              ID contam cada evento duas vezes.
            </p>
          </li>
          <li>
            <p className="font-medium">2. Cole o código</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              No container do Google Tag Manager cadastrado na Bask, crie uma tag
              “HTML personalizado” acionada em todas as páginas e publique. A
              alternativa é o Global JavaScript do questionário, com a versão sem
              a tag &lt;script&gt;.
            </p>
            <SnippetBox snippet={snippet} />
          </li>
          <li>
            <p className="font-medium">3. Libere o domínio do questionário</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              O endereço onde o questionário abre precisa estar em Site →
              Domínios liberados. Sem isso o navegador descarta os eventos em
              silêncio.
            </p>
          </li>
          <li>
            <p className="font-medium">4. Teste em janela anônima</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Percorra um checkout de teste até a tela de obrigado e abra a tela
              Eventos: devem aparecer PageView, Lead, InitiateCheckout e
              SubmitApplication.
            </p>
          </li>
        </ol>

        <div className="rounded-2xl border border-primary/10 p-4">
          <p className="text-xs font-medium">O que vira o quê</p>
          <ul className="mt-2 flex flex-col gap-1">
            {TRADUCAO.map((linha) => (
              <li key={linha.bask} className="text-xs text-muted-foreground">
                <code className="font-mono text-foreground">{linha.bask}</code> →{" "}
                <code className="font-mono text-foreground">{linha.tracker}</code> ({linha.quando})
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Respostas do questionário e nome do medicamento nunca saem da
            página: o código lê só valor, moeda, id do pedido e o email para
            identificar o visitante.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-cyan/5 border border-cyan/30 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-cyan" />
          <p className="text-xs">
            Venda da Bask só vira Purchase com pagamento confirmado, e isso chega
            pelo add-on Webhooks da Bask, que ainda não está ligado. Até lá, nenhuma
            venda da Bask aparece em Vendas nem vai como Purchase ao Meta e ao GA4.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SnippetBox({ snippet }: { snippet: string }) {
  const [copied, setCopied] = React.useState<"gtm" | "js" | null>(null)

  async function copy(kind: "gtm" | "js") {
    const text = kind === "gtm" ? `<script>\n${snippet}\n</script>` : snippet
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard bloqueado: o código segue visível para seleção manual.
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <pre className="max-h-56 overflow-auto rounded-xl border border-primary/20 bg-background/80 p-3 font-mono text-[11px] leading-relaxed">
        {snippet}
      </pre>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" className="h-11 flex-1 gap-2 rounded-xl" onClick={() => copy("gtm")}>
          {copied === "gtm" ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied === "gtm" ? "Copiado" : "Copiar para o GTM"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-11 flex-1 gap-2 rounded-xl"
          onClick={() => copy("js")}
        >
          {copied === "js" ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied === "js" ? "Copiado" : "Copiar para Global JavaScript"}
        </Button>
      </div>
    </div>
  )
}
