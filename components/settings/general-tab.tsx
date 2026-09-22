"use client"

import { useActionState } from "react"
import { KeyRound, LoaderCircle, Save } from "lucide-react"

import {
  createInitialSettings,
  regenerateWebhookToken,
  saveGeneralSettings,
} from "@/app/(dashboard)/configuracoes/actions"
import { IDLE_STATE, type ActionState } from "@/lib/settings/action-state"
import type { SettingsRow } from "@/lib/settings/queries"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InstallationSection } from "./installation-section"
import { RevealOnce } from "./reveal-once"

export function GeneralTab({ settings }: { settings: SettingsRow | null }) {
  return (
    <div className="flex flex-col gap-4">
      <InstallationSection />
      {settings ? (
        <>
          <GeneralForm settings={settings} />
          <WebhookSection />
        </>
      ) : (
        <FirstRun />
      )}
    </div>
  )
}

/** Estado de primeiro acesso: a linha de configuração ainda não existe. */
function FirstRun() {
  const [state, formAction, isPending] = useActionState(
    async () => await createInitialSettings(),
    IDLE_STATE
  )

  return (
    <div className="glass rounded-2xl p-6">
      <h2 className="text-base font-medium">Configuração inicial</h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        Ainda não existe configuração salva. Ao criar, um token de webhook é
        gerado — é ele que autentica as compras enviadas pela plataforma de
        venda. O token aparece uma única vez.
      </p>

      {state.revealedToken ? (
        <div className="mt-4">
          <RevealOnce token={state.revealedToken} />
        </div>
      ) : null}

      {state.message && !state.ok ? (
        <p className="mt-3 text-sm text-destructive">{state.message}</p>
      ) : null}

      <form action={formAction} className="mt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
          Criar configuração e gerar token
        </Button>
      </form>
    </div>
  )
}

function GeneralForm({ settings }: { settings: SettingsRow }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveGeneralSettings,
    IDLE_STATE
  )

  return (
    <form action={formAction} className="glass flex flex-col gap-4 rounded-2xl p-6">
      <div>
        <h2 className="text-base font-medium">Geral</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Valores usados em todo envio de evento e no cálculo de receita.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="currency">Moeda</Label>
          <Select name="currency" defaultValue={settings.currency}>
            <SelectTrigger id="currency" className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL">BRL — Real</SelectItem>
              <SelectItem value="USD">USD — Dólar</SelectItem>
              <SelectItem value="EUR">EUR — Euro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="test_event_code">Código de teste do Meta</Label>
          <Input
            id="test_event_code"
            name="test_event_code"
            defaultValue={settings.testEventCode ?? ""}
            placeholder="TEST12345"
            className="h-10 font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Opcional. Events Manager → Test Events. Usado no botão “Testar
            conexão” dos pixels.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
          Salvar
        </Button>
        {state.message ? (
          <span
            className={
              state.ok
                ? "text-sm text-primary"
                : "text-sm text-destructive"
            }
          >
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  )
}

function WebhookSection() {
  const [state, formAction, isPending] = useActionState(
    async () => await regenerateWebhookToken(),
    IDLE_STATE
  )

  return (
    <div className="glass flex flex-col gap-4 rounded-2xl p-6">
      <div>
        <h2 className="text-base font-medium">Token do webhook</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Autentica as compras que chegam da plataforma de venda. Está salvo
          apenas como hash, então não dá para consultá-lo — se perder, gere
          outro e atualize a URL cadastrada na plataforma.
        </p>
      </div>

      {state.revealedToken ? <RevealOnce token={state.revealedToken} /> : null}

      {state.message && !state.ok ? (
        <p className="text-sm text-destructive">{state.message}</p>
      ) : null}

      <form action={formAction}>
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
          Gerar token novo
        </Button>
      </form>

      <WebhookUrlHelp />
    </div>
  )
}

/**
 * Monta a URL que vai ser cadastrada no PerfectPay. O token não fica aqui: ele
 * só existe no momento em que é gerado, então a URL é mostrada com um lugar
 * pra colar o valor que o usuário guardou.
 */
function WebhookUrlHelp() {
  const origin = typeof window !== "undefined" ? window.location.origin : ""

  return (
    <div className="rounded-xl border bg-background/40 p-4">
      <p className="text-sm font-medium">URL para cadastrar no PerfectPay</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Em Ferramentas → PostBack/Webhook, cadastre a URL abaixo trocando
        <code className="mx-1 font-mono text-xs">SEU_TOKEN</code>
        pelo token que você copiou.
      </p>
      <code className="mt-3 block overflow-x-auto rounded-lg bg-background/80 px-3 py-2 font-mono text-xs break-all">
        {origin}/api/webhook/compra/perfectpay?token=SEU_TOKEN
      </code>
      <p className="mt-3 text-xs text-muted-foreground">
        Para a compra ser ligada à visita, o PerfectPay precisa repassar o campo
        <code className="mx-1 font-mono">src</code>— o script de captura já
        preenche isso nos links de checkout automaticamente.
      </p>
    </div>
  )
}
