"use client"

import { useActionState } from "react"
import { AlertTriangle, KeyRound, LoaderCircle, Save } from "lucide-react"

import {
  regenerateCronToken,
  saveDispatchSettings,
} from "@/app/(dashboard)/configuracoes/actions"
import { IDLE_STATE, type ActionState } from "@/lib/settings/action-state"
import {
  DISPATCH_MODES,
  DISPATCH_MODE_LABELS,
} from "@/lib/settings/dispatch-modes"
import type { QueueDepth, SettingsRow } from "@/lib/settings/queries"
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
import { Switch } from "@/components/ui/switch"
import { RevealOnce } from "./reveal-once"

export function DispatchTab({
  settings,
  queue,
}: {
  settings: SettingsRow | null
  queue: QueueDepth | null
}) {
  if (!settings) {
    return (
      <div className="glass rounded-2xl p-6">
        <p className="text-sm text-muted-foreground">
          Crie a configuração inicial na aba Geral antes de ajustar o disparo.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <QueueStatus queue={queue} settings={settings} />
      <DispatchForm settings={settings} />
      <CronSection settings={settings} />
    </div>
  )
}

/**
 * Sem este indicador, uma falha do pg_net seria invisível: os eventos ficariam
 * parados na fila e a tela continuaria dizendo que está tudo bem.
 */
function QueueStatus({
  queue,
  settings,
}: {
  queue: QueueDepth | null
  settings: SettingsRow
}) {
  if (!queue) return null

  // Um punhado de vencidos é normal entre um tique e outro do cron. Um monte
  // significa que ninguém está drenando.
  const stalled = queue.due > 200

  return (
    <div className="glass rounded-2xl p-6">
      <h2 className="text-base font-medium">Fila</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Aguardando a janela" value={queue.pending} />
        <Stat label="Vencidos, a caminho" value={queue.due} highlight={stalled} />
        <Stat label="Falharam" value={queue.failed} highlight={queue.failed > 0} />
      </div>

      {stalled ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-amber">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Há muitos eventos vencidos parados. Confira se a extensão{" "}
            <code className="font-mono text-xs">pg_net</code> está habilitada no
            Supabase e se a URL e o token do cron abaixo estão preenchidos.
          </span>
        </p>
      ) : null}

      {!settings.hasCronToken ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-amber">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            O token do cron ainda não foi gerado, então nada está drenando a
            fila. Gere abaixo.
          </span>
        </p>
      ) : null}
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div className="rounded-xl border bg-background/40 p-4">
      <p
        className={`font-mono text-2xl tabular-nums ${
          highlight ? "text-amber" : ""
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function DispatchForm({ settings }: { settings: SettingsRow }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveDispatchSettings,
    IDLE_STATE
  )

  return (
    <form
      action={formAction}
      className="glass flex flex-col gap-5 rounded-2xl p-6"
    >
      <div>
        <h2 className="text-base font-medium">Disparo atrasado</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Segurar o evento por alguns minutos dá tempo de a pessoa converter e
          entregar email, telefone e nome. Quando o evento finalmente sai, ele
          leva esses dados junto — um PageView pode chegar ao Meta com a
          identidade completa. O evento é enviado com a hora real em que
          aconteceu, então a atribuição não muda de lugar.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="dispatch_mode">Modo</Label>
        <Select name="dispatch_mode" defaultValue={settings.dispatchMode}>
          <SelectTrigger id="dispatch_mode" className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DISPATCH_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {DISPATCH_MODE_LABELS[mode].title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-1 flex flex-col gap-2 rounded-xl border bg-background/40 p-4">
          {DISPATCH_MODES.map((mode) => (
            <p key={mode} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {DISPATCH_MODE_LABELS[mode].title}:
              </span>{" "}
              {DISPATCH_MODE_LABELS[mode].description}
            </p>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="dispatch_delay_minutes">Janela (minutos)</Label>
          <Input
            id="dispatch_delay_minutes"
            name="dispatch_delay_minutes"
            type="number"
            min={0}
            max={360}
            step={1}
            defaultValue={Math.round(settings.dispatchDelaySeconds / 60)}
            className="h-10 font-mono tabular-nums"
          />
          <p className="text-xs text-muted-foreground">
            0 desliga o atraso. O Meta aceita eventos com até 7 dias de
            defasagem, mas passando de 1 hora a chance de aprender algo novo
            quase não cresce e o sinal de otimização envelhece.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="default_phone_country">Código do país (telefone)</Label>
          <Input
            id="default_phone_country"
            name="default_phone_country"
            defaultValue={settings.defaultPhoneCountry}
            placeholder="55"
            className="h-10 font-mono tabular-nums"
          />
          <p className="text-xs text-muted-foreground">
            O Meta compara o telefone em formato internacional. Sem o código do
            país, o hash nunca casa — e isso não gera erro nenhum, só zera a
            correspondência.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="dispatch_immediate_events">
          Eventos que nunca esperam
        </Label>
        <Input
          id="dispatch_immediate_events"
          name="dispatch_immediate_events"
          defaultValue={settings.dispatchImmediateEvents.join(", ")}
          placeholder="Lead, InitiateCheckout"
          className="h-10 font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Separados por vírgula. Estes saem na hora e sempre disparam o pixel do
          navegador. Vale para eventos que já nascem com os dados da pessoa —
          num evento de lead, o formulário acabou de ser preenchido, então não
          há o que esperar.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="dispatch_cron_url">URL do cron</Label>
        <Input
          id="dispatch_cron_url"
          name="dispatch_cron_url"
          type="url"
          defaultValue={settings.dispatchCronUrl ?? ""}
          placeholder="https://tracking.seudominio.com/api/cron/dispatch"
          className="h-10 font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          É este endereço que o pg_cron chama de minuto em minuto. Enquanto
          estiver vazio, a fila não é drenada por ninguém.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border bg-background/40 p-4">
        <div>
          <Label htmlFor="form_capture_enabled" className="text-sm font-medium">
            Ler formulários do site
          </Label>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            Quando alguém envia um formulário, o script lê email, telefone e
            nome e manda para cá — é o que enriquece os eventos de quem ainda
            não comprou. Campos de senha, cartão e documento nunca são lidos, e
            um formulário com senha é ignorado por inteiro. Como isto passa a
            coletar dado pessoal em mais lugares, a política de privacidade dos
            sites precisa dizer isso.
          </p>
        </div>
        <Switch
          id="form_capture_enabled"
          name="form_capture_enabled"
          defaultChecked={settings.formCaptureEnabled}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
          Salvar
        </Button>
        {state.message ? (
          <span
            className={
              state.ok ? "text-sm text-primary" : "text-sm text-destructive"
            }
          >
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  )
}

function CronSection({ settings }: { settings: SettingsRow }) {
  const [state, formAction, isPending] = useActionState(
    async () => await regenerateCronToken(),
    IDLE_STATE
  )

  const origin = typeof window !== "undefined" ? window.location.origin : ""

  return (
    <div className="glass flex flex-col gap-4 rounded-2xl p-6">
      <div>
        <h2 className="text-base font-medium">Quem drena a fila</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          O pg_cron do próprio Supabase chama o endereço abaixo de minuto em
          minuto, e o token é lido direto do Vault — nenhum serviço novo, nenhum
          valor colado em SQL. Habilite a extensão{" "}
          <code className="font-mono text-xs">pg_net</code> em Database →
          Extensions antes de gerar o token.
        </p>
      </div>

      <div className="rounded-xl border bg-background/40 p-4">
        <p className="text-sm font-medium">Endereço deste ambiente</p>
        <code className="mt-2 block overflow-x-auto rounded-lg bg-background/80 px-3 py-2 font-mono text-xs break-all">
          {origin}/api/cron/dispatch
        </code>
        <p className="mt-2 text-xs text-muted-foreground">
          Cole no campo “URL do cron” acima e salve. Em produção ele precisa ser
          o domínio público, não o endereço local.
        </p>
      </div>

      {state.revealedToken ? <RevealOnce token={state.revealedToken} /> : null}

      {state.message && !state.ok ? (
        <p className="text-sm text-destructive">{state.message}</p>
      ) : null}

      <form action={formAction}>
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
          {settings.hasCronToken ? "Gerar token novo" : "Gerar token do cron"}
        </Button>
      </form>
    </div>
  )
}
