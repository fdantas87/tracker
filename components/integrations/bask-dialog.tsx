"use client"

import * as React from "react"
import { Check, Copy, Info, TriangleAlert } from "lucide-react"

import { baskBridgeSnippet } from "@/lib/integrations/bask-bridge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/** O que a ponte traduz. Espelha o comentário de lib/integrations/bask-bridge.ts. */
const TRADUCAO = [
  { bask: "signup", tracker: "Lead", quando: "conta criada ou login no questionário" },
  { bask: "add_to_cart", tracker: "InitiateCheckout", quando: "plano escolhido no checkout" },
  { bask: "purchase", tracker: "SubmitApplication", quando: "tela de obrigado — checkout enviado" },
]

/** Os webhooks a criar na Bask. Espelha o mapa de lib/webhooks/adapters/bask.ts. */
const WEBHOOKS = [
  { evento: "Payment Succeeded", efeito: "venda aprovada + Purchase (inclusive renovação e refil)" },
  { evento: "Payment Refunded", efeito: "venda marcada como reembolsada" },
  { evento: "Payment Canceled", efeito: "venda marcada como cancelada" },
  { evento: "Dispute Created", efeito: "venda marcada como chargeback" },
  { evento: "Dispute Updated", efeito: "disputa ganha volta a aprovada" },
]

/** O header que carrega o token. A Bask aceita header customizado, então o token nunca vai na URL. */
const HEADER_KEY = "x-webhook-token"

/**
 * Instalação do tracker na Bask: o código das páginas (questionário e
 * checkout) e os webhooks de pagamento, que são a fonte da venda.
 *
 * Só instruções: a Bask não tem credencial para guardar aqui — o webhook usa o
 * token global de Integrações → Webhook.
 */
export function BaskDialog({
  open,
  onOpenChange,
  hasWebhookToken,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasWebhookToken: boolean
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const snippet = baskBridgeSnippet(origin)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bask — questionário e checkout</DialogTitle>
          <DialogDescription>
            O tracker entra na Bask por dois caminhos: o código nas páginas, que
            captura a visita, e os webhooks de pagamento, que registram a venda.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="gtm" className="gap-4">
          <TabsList variant="line" className="w-full justify-start border-b border-primary/10">
            <TabsTrigger value="gtm" className="flex-none px-3">
              Navegador (GTM)
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="flex-none px-3">
              Webhooks de pagamento
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gtm" className="flex flex-col gap-4">
            <p className="text-[13px] text-muted-foreground">
              O código abaixo carrega o tracker nas páginas da Bask e traduz os
              eventos do questionário. Quem envia para o Meta e o GA4 passa a ser
              o tracker.
            </p>

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
          </TabsContent>

          <TabsContent value="webhooks" className="flex flex-col gap-5">
            <p className="text-[13px] text-muted-foreground">
              É o que registra a venda em Vendas e envia o Purchase. Na Bask, em
              Settings → Webhooks &amp; API, crie <strong>um webhook para cada
              evento</strong> da lista (a Bask aceita um evento por webhook). URL,
              Key e Value são os mesmos nos cinco; só o Event Type muda.
            </p>

            <section className="flex flex-col gap-2">
              <p className="text-sm font-medium">Igual em todos os webhooks</p>
              <CopyRow label="URL" value={`${origin}/api/webhook/bask`} />
              <CopyRow label="Key" value={HEADER_KEY} />
              <TokenRow hasWebhookToken={hasWebhookToken} />
            </section>

            <section className="flex flex-col gap-2">
              <p className="text-sm font-medium">Event Type — um webhook para cada</p>
              {WEBHOOKS.map((linha) => (
                <CopyRow key={linha.evento} label="Event Type" value={linha.evento} note={linha.efeito} />
              ))}
              <p className="mt-1 text-xs text-muted-foreground">
                Não assine New Order nem Order Updated: pedido criado não é
                pagamento confirmado e nunca vira Purchase.
              </p>
            </section>

            <section className="flex flex-col gap-1">
              <p className="text-sm font-medium">Confira a ligação</p>
              <p className="text-[13px] text-muted-foreground">
                O botão Test do webhook Payment Refunded deve responder 200 sem
                criar nada: prova URL e token. 401 é token errado; um 400 traz os
                nomes dos campos recebidos, para ajustar a leitura. A primeira
                venda real aparece em Vendas.
              </p>
            </section>

            <div className="flex items-start gap-2 rounded-xl bg-cyan/5 border border-cyan/30 p-3">
              <Info className="mt-0.5 size-4 shrink-0 text-cyan" />
              <p className="text-xs">
                Só Payment Succeeded vira Purchase. A venda é ligada à visita pelo
                email ou telefone do paciente, que o código da aba Navegador já
                registra no questionário. O nome do medicamento fica só no painel,
                nunca vai ao Meta nem ao GA4.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/** Copia um texto e mostra "Copiado" por 2s. Clipboard bloqueado: o texto segue visível. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard bloqueado: o valor segue visível para seleção manual.
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className="h-9 w-full shrink-0 gap-2 rounded-lg sm:w-28"
      onClick={copy}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Copiado" : "Copiar"}
    </Button>
  )
}

/** Campo de formulário da Bask: rótulo, valor em mono e cópia com um clique. */
function CopyRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/15 bg-background/60 p-2 pl-3 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">
        <code className="block overflow-x-auto whitespace-nowrap font-mono text-[12px] text-foreground">
          {value}
        </code>
        {note ? <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p> : null}
      </div>
      <CopyButton text={value} />
    </div>
  )
}

/**
 * O valor do header é o token global do webhook, que só existe como hash
 * (mostrado uma vez, ao gerar). Não há o que copiar: um botão aqui copiaria um
 * texto-guia, e o usuário o colaria na Bask e receberia 401.
 */
function TokenRow({ hasWebhookToken }: { hasWebhookToken: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-primary/25 p-2 pl-3 sm:flex-row sm:items-start sm:gap-3">
      <span className="w-20 shrink-0 pt-0.5 text-xs text-muted-foreground">Value</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">O token de Integrações → Webhook</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Ele só aparece uma vez, no momento em que é gerado — copie lá e cole
          aqui na Bask. Salvo apenas como hash, o painel não consegue mostrá-lo
          de novo.
        </p>
        {!hasWebhookToken ? (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            Nenhum token foi gerado ainda. Gere um na aba Webhook desta tela antes
            de cadastrar na Bask.
          </p>
        ) : null}
      </div>
    </div>
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
