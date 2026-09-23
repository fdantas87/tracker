"use client"

import * as React from "react"
import { useActionState } from "react"
import {
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Info,
  LoaderCircle,
  Pencil,
  Plug,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react"

import {
  removeStripeIntegration,
  saveStripeCredentials,
  testStripeCredentials,
  toggleStripeActive,
} from "@/app/(dashboard)/integracoes/actions"
import type { ConnectionTestResult } from "@/lib/connections/test-connection"
import { IDLE_STATE, type ActionState } from "@/lib/settings/action-state"
import type { StripeAccountRow } from "@/lib/settings/queries"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { IntegrationCard } from "./integration-card"

/** Os 4 eventos que o adaptador entende. Assinar só estes evita ruído. */
const EVENTOS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "charge.refunded",
]

export function StripeCard({
  account,
  hasWebhookToken,
}: {
  account: StripeAccountRow | null
  /**
   * O token global de webhook, que protege a rota antes da assinatura do
   * Stripe. Sem ele a URL não pode ser montada — e o card precisa dizer isso
   * em vez de mostrar uma URL que vai devolver 503.
   */
  hasWebhookToken: boolean
}) {
  const [formOpen, setFormOpen] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [testing, startTesting] = React.useTransition()
  const [pending, startTransition] = React.useTransition()
  const [testResult, setTestResult] =
    React.useState<ConnectionTestResult | null>(null)

  const configurado = Boolean(account?.hasSecretKey && account?.hasWebhookSecret)

  function runTest() {
    setTestResult(null)
    startTesting(async () => {
      setTestResult(await testStripeCredentials())
    })
  }

  function toggleActive(nextActive: boolean) {
    const formData = new FormData()
    formData.set("next_active", String(nextActive))
    startTransition(async () => {
      await toggleStripeActive(IDLE_STATE, formData)
    })
  }

  function confirmRemove() {
    startTransition(async () => {
      await removeStripeIntegration()
      setConfirmOpen(false)
    })
  }

  return (
    <IntegrationCard
      name="Stripe"
      icon="/logos/stripe-icon.svg"
      status="conectado"
      description="Cartão, Pix e boleto pelo Stripe. A venda chega por webhook assinado e é casada com a visita que a originou."
      isActive={account?.isActive}
      headerAction={
        <Switch
          checked={account?.isActive ?? false}
          onCheckedChange={toggleActive}
          disabled={pending}
          aria-label={account?.isActive ? "Desativar" : "Ativar"}
          className="shrink-0 mt-2"
        />
      }
      actions={
        <>
          <Button variant="ghost" size="icon-sm" onClick={runTest} disabled={testing} title="Testar Conexão">
            {testing ? <LoaderCircle className="animate-spin size-4" /> : <Plug className="size-4 text-muted-foreground" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setFormOpen(true)} aria-label="Editar">
            <Pencil className="size-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setConfirmOpen(true)}
            aria-label="Desconectar"
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-4" />
          </Button>
        </>
      }
      testResult={testResult ? <TestResult result={testResult} /> : null}
    >
      <StripeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={account}
        hasWebhookToken={hasWebhookToken}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar o Stripe?</AlertDialogTitle>
            <AlertDialogDescription>
              As duas credenciais são apagadas do Vault e os webhooks passam a
              ser recusados. As vendas já registradas continuam no painel. Para
              reconectar, será preciso colar as credenciais de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove} disabled={pending}>
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </IntegrationCard>
  )
}

export function StripeFormDialog({
  open,
  onOpenChange,
  account,
  hasWebhookToken,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: StripeAccountRow | null
  hasWebhookToken: boolean
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveStripeCredentials,
    IDLE_STATE
  )

  React.useEffect(() => {
    if (state.ok) onOpenChange(false)
  }, [state.ok, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Credenciais do Stripe</DialogTitle>
          <DialogDescription>
            As duas são necessárias e fazem coisas diferentes: uma autentica as
            chamadas que o painel faz ao Stripe, a outra prova que o webhook
            recebido veio mesmo dele.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="secret_key">Secret key</Label>
            <Input
              id="secret_key"
              name="secret_key"
              type="password"
              autoComplete="off"
              placeholder={
                account?.hasSecretKey ? "Deixe em branco para manter a atual" : "sk_live_..."
              }
              required={!account?.hasSecretKey}
              className="h-14 w-full rounded-2xl border-primary/20 bg-background/80 px-5 font-mono shadow-sm backdrop-blur transition-colors hover:border-primary/40 focus-visible:border-primary/40 focus-visible:ring-0"
            />
            <p className="text-[13px] text-muted-foreground leading-relaxed mt-1">
              Painel do Stripe → Desenvolvedores → Chaves de API. Use a chave de
              produção para registrar vendas reais; a de teste (sk_test_) só
              enxerga pagamentos de teste.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Label htmlFor="webhook_secret">Signing secret do webhook</Label>
            <Input
              id="webhook_secret"
              name="webhook_secret"
              type="password"
              autoComplete="off"
              placeholder={
                account?.hasWebhookSecret ? "Deixe em branco para manter o atual" : "whsec_..."
              }
              required={!account?.hasWebhookSecret}
              className="h-14 w-full rounded-2xl border-primary/20 bg-background/80 px-5 font-mono shadow-sm backdrop-blur transition-colors hover:border-primary/40 focus-visible:border-primary/40 focus-visible:ring-0"
            />
            <p className="text-[13px] text-muted-foreground leading-relaxed mt-1">
              Aparece ao cadastrar o endpoint em Desenvolvedores → Webhooks, no
              botão “Revelar”. É a chave que confere a assinatura de cada evento:
              sem ela, nenhum webhook do Stripe é aceito.
            </p>
          </div>

          {state.message && !state.ok ? (
            <p className="text-sm text-destructive">{state.message}</p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <Button type="button" variant="ghost" className="h-12 rounded-xl" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="h-12 rounded-xl px-8" disabled={isPending}>
              {isPending ? <LoaderCircle className="animate-spin size-4" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>

        <div className="pt-2">
          <WebhookSetup hasWebhookToken={hasWebhookToken} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Instruções de cadastro no painel do Stripe.
 *
 * A URL carrega o token global de webhook na querystring porque o Stripe não
 * permite header customizado — mesma situação já tratada para o PerfectPay. O
 * token não pode ser exibido (o banco só guarda o hash), então a URL vem com
 * um lugar para colar o valor que o operador guardou.
 */
function WebhookSetup({ hasWebhookToken }: { hasWebhookToken: boolean }) {
  const [copied, setCopied] = React.useState(false)
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const url = `${origin}/api/webhook/compra/stripe?token=SEU_TOKEN`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard bloqueado: o valor está na tela para seleção manual.
    }
  }

  return (
    <div className="rounded-2xl border border-primary/10 bg-gradient-to-b from-primary/5 to-transparent p-5 sm:p-6 mt-4 w-full">
      <p className="text-[15px] font-semibold tracking-tight text-center sm:text-left">URL para cadastrar no Stripe</p>
      <p className="mt-1 text-[13px] text-muted-foreground text-center sm:text-left">
        Desenvolvedores → Webhooks → Adicionar endpoint. Troque
        <code className="mx-1 font-mono text-[12px] font-bold text-foreground">SEU_TOKEN</code>
        pelo token de webhook gerado em Configurações.
      </p>

      <div className="mt-4 flex w-full flex-col items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-background/80 p-2 shadow-sm backdrop-blur transition-colors hover:border-primary/40 sm:flex-row overflow-hidden">
        <div 
          className="relative flex-1 w-full overflow-hidden"
          style={{ 
            maskImage: "linear-gradient(to right, black 75%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to right, black 75%, transparent 100%)"
          }}
        >
          <code 
            className="block px-3 py-2 text-left font-mono text-[16px] sm:text-[18px] leading-tight tracking-tight text-foreground whitespace-nowrap" 
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {url}
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

      {!hasWebhookToken ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/5 p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
          <p className="text-xs">
            Ainda não existe token de webhook neste painel. Gere um em
            Configurações → Geral — sem ele a rota devolve 503 e nenhuma venda é
            registrada, nem do Stripe nem do PerfectPay.
          </p>
        </div>
      ) : null}

      <p className="mt-3 text-xs font-medium">Assine só estes eventos:</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {EVENTOS.map((evento) => (
          <li key={evento} className="font-mono text-xs text-muted-foreground">
            {evento}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Cadastrar “todos os eventos” faz o Stripe mandar dezenas de tipos que
        não são venda; eles são recusados sem efeito nenhum aqui, mas aparecem
        como falha no log do próprio Stripe e confundem na hora de investigar.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Para a venda ser ligada à visita, o link de pagamento precisa carregar
        <code className="mx-1 font-mono">client_reference_id</code>— o track.js
        já faz isso sozinho nos links
        <code className="mx-1 font-mono">buy.stripe.com</code>
        da página. Sem ele, a ligação cai para o email do comprador.
      </p>
    </div>
  )
}

function TestResult({ result }: { result: ConnectionTestResult }) {
  // Mesma escala de Configurações: "verificar" é ciano informativo, nunca
  // âmbar — um resultado esperado pintado de alerta já foi lido como falha.
  const tone = {
    ok: { icon: CheckCircle2, className: "text-primary" },
    verificar: { icon: Info, className: "text-cyan" },
    erro: { icon: XCircle, className: "text-destructive" },
  }[result.status]

  const Icon = tone.icon

  return (
    <div className="flex items-start gap-2 rounded-xl bg-background/60 p-3">
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone.className}`} />
      <div className="min-w-0">
        <p className="text-sm">{result.message}</p>
        {result.detail ? (
          <p className="mt-1 text-xs text-muted-foreground">{result.detail}</p>
        ) : null}
      </div>
    </div>
  )
}
