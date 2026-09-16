"use client"

import { useActionState } from "react"
import { KeyRound, LoaderCircle, Save } from "lucide-react"

import {
  IDLE_STATE,
  createInitialSettings,
  regenerateWebhookToken,
  saveGeneralSettings,
  type ActionState,
} from "@/app/(dashboard)/configuracoes/actions"
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
import { RevealOnce } from "./reveal-once"

export function GeneralTab({ settings }: { settings: SettingsRow | null }) {
  if (!settings) {
    return <FirstRun />
  }

  return (
    <div className="flex flex-col gap-4">
      <GeneralForm settings={settings} />
      <WebhookSection />
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

      <p className="text-xs text-muted-foreground">
        O endpoint que recebe as compras é criado na fase 7. A URL para
        cadastrar no PerfectPay aparece aqui quando ele existir.
      </p>
    </div>
  )
}
