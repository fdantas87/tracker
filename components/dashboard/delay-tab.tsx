"use client"

import { useActionState } from "react"
import { AlertTriangle, KeyRound, LoaderCircle, Save, Database, Send, Clock } from "lucide-react"

import {
  regenerateCronToken,
  saveDispatchSettings,
} from "@/app/(dashboard)/pixels/actions"
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
import { RevealOnce } from "../settings/reveal-once"

export function DelayTab({
  settings,
  queue,
}: {
  settings: SettingsRow | null
  queue: QueueDepth | null
}) {
  if (!settings) {
    return (
      <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-8 text-center sm:p-12 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Crie a configuração inicial na aba Geral antes de ajustar o disparo.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
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
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-8 text-center sm:p-12 shadow-sm">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-full max-w-md -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-3xl" />
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-10">
        <div className="flex items-center gap-2.5">
          <Database className="size-7 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Fila de Eventos</h2>
        </div>

        <div className="w-full grid gap-4 sm:grid-cols-3">
          <Stat label="Aguardando a janela" value={queue.pending} />
          <Stat label="Vencidos, a caminho" value={queue.due} highlight={stalled} />
          <Stat label="Falharam" value={queue.failed} highlight={queue.failed > 0} />
        </div>

        {stalled ? (
          <p className="flex w-full items-start justify-center gap-2.5 text-left text-[14px] leading-relaxed text-amber-500 sm:items-center sm:text-center" style={{ fontFamily: "var(--font-manrope), sans-serif" }}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0 sm:mt-0" />
            <span className="text-balance">
              Há muitos eventos vencidos parados. Confira se a extensão <code className="font-mono font-bold">pg_net</code> está habilitada no Supabase e se a URL e o token do cron abaixo estão preenchidos.
            </span>
          </p>
        ) : null}

        {!settings.hasCronToken ? (
          <p className="flex w-full items-start justify-center gap-2.5 text-left text-[14px] leading-relaxed text-amber-500 sm:items-center sm:text-center" style={{ fontFamily: "var(--font-manrope), sans-serif" }}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0 sm:mt-0" />
            <span className="text-balance">
              O token do cron ainda não foi gerado, então nada está drenando a fila. Gere abaixo.
            </span>
          </p>
        ) : null}
      </div>
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
    <div className="relative flex flex-col justify-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-6 shadow-sm">
      <div className="pointer-events-none absolute -top-16 left-1/2 h-32 w-full max-w-[150px] -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-2xl" />
      <div className="relative z-10 flex flex-col items-center text-center">
        <p className={`font-mono text-4xl font-semibold tabular-nums tracking-tight ${highlight ? "text-amber-500" : ""}`}>
          {value}
        </p>
        <p className="mt-2 text-sm text-muted-foreground text-balance">{label}</p>
      </div>
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
      className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-8 text-center sm:p-12 shadow-sm"
    >
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-full max-w-md -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-3xl" />
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-10">
        
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2.5">
            <Send className="size-7 text-primary" />
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Disparo atrasado</h2>
          </div>
          <p className="mx-auto max-w-lg text-[14px] text-muted-foreground sm:text-base text-balance">
            Segurar o evento por alguns minutos dá tempo de a pessoa converter e
            entregar email, telefone e nome. Quando o evento finalmente sai, ele
            leva esses dados junto — um PageView pode chegar ao Meta com a
            identidade completa. O evento é enviado com a hora real em que
            aconteceu, então a atribuição não muda de lugar.
          </p>
        </div>

        <div className="flex w-full max-w-2xl flex-col gap-6 text-left">
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="dispatch_mode" className="ml-1 text-[13px] text-muted-foreground">Modo</Label>
            <Select name="dispatch_mode" defaultValue={settings.dispatchMode}>
              <SelectTrigger id="dispatch_mode" className="h-14 rounded-2xl border-primary/20 bg-background/80 px-5 shadow-sm backdrop-blur transition-colors hover:border-primary/40 focus:border-primary/40 focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {DISPATCH_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {DISPATCH_MODE_LABELS[mode].title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-1 flex flex-col gap-2 rounded-2xl border bg-background/40 p-5 shadow-sm">
              {DISPATCH_MODES.map((mode) => (
                <p key={mode} className="text-[13px] text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {DISPATCH_MODE_LABELS[mode].title}:
                  </span>{" "}
                  {DISPATCH_MODE_LABELS[mode].description}
                </p>
              ))}
            </div>
          </div>

          <div className="grid w-full gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="dispatch_delay_minutes" className="ml-1 text-[13px] text-muted-foreground">Janela (minutos)</Label>
              <Input
                id="dispatch_delay_minutes"
                name="dispatch_delay_minutes"
                type="number"
                min={0}
                max={360}
                step={1}
                defaultValue={Math.round(settings.dispatchDelaySeconds / 60)}
                className="h-14 rounded-2xl border-primary/20 bg-background/80 px-5 font-mono tabular-nums shadow-sm backdrop-blur transition-colors hover:border-primary/40 focus-visible:border-primary/40 focus-visible:ring-0"
              />
              <p className="text-[13px] text-muted-foreground text-balance leading-relaxed">
                0 desliga o atraso. O Meta aceita eventos com até 7 dias de
                defasagem, mas passando de 1 hora a chance de aprender algo novo
                quase não cresce e o sinal de otimização envelhece.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <Label htmlFor="default_phone_country" className="ml-1 text-[13px] text-muted-foreground">Código do país (telefone)</Label>
              <Input
                id="default_phone_country"
                name="default_phone_country"
                defaultValue={settings.defaultPhoneCountry}
                placeholder="55"
                className="h-14 rounded-2xl border-primary/20 bg-background/80 px-5 font-mono tabular-nums shadow-sm backdrop-blur transition-colors hover:border-primary/40 focus-visible:border-primary/40 focus-visible:ring-0"
              />
              <p className="text-[13px] text-muted-foreground text-balance leading-relaxed">
                O Meta compara o telefone em formato internacional. Sem o código do
                país, o hash nunca casa — e isso não gera erro nenhum, só zera a
                correspondência.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="dispatch_immediate_events" className="ml-1 text-[13px] text-muted-foreground">
              Eventos que nunca esperam
            </Label>
            <Input
              id="dispatch_immediate_events"
              name="dispatch_immediate_events"
              defaultValue={settings.dispatchImmediateEvents.join(", ")}
              placeholder="Lead, InitiateCheckout"
              className="h-14 rounded-2xl border-primary/20 bg-background/80 px-5 font-mono shadow-sm backdrop-blur transition-colors hover:border-primary/40 focus-visible:border-primary/40 focus-visible:ring-0"
            />
            <p className="text-[13px] text-muted-foreground text-balance leading-relaxed">
              Separados por vírgula. Estes saem na hora e sempre disparam o pixel do
              navegador. Vale para eventos que já nascem com os dados da pessoa —
              num evento de lead, o formulário acabou de ser preenchido, então não
              há o que esperar.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <Label htmlFor="dispatch_cron_url" className="ml-1 text-[13px] text-muted-foreground">URL do cron</Label>
            <Input
              id="dispatch_cron_url"
              name="dispatch_cron_url"
              type="url"
              defaultValue={settings.dispatchCronUrl ?? ""}
              placeholder="https://tracking.seudominio.com/api/cron/dispatch"
              className="h-14 rounded-2xl border-primary/20 bg-background/80 px-5 font-mono shadow-sm backdrop-blur transition-colors hover:border-primary/40 focus-visible:border-primary/40 focus-visible:ring-0"
            />
            <p className="text-[13px] text-muted-foreground text-balance leading-relaxed">
              É este endereço que o pg_cron chama de minuto em minuto. Enquanto
              estiver vazio, a fila não é drenada por ninguém.
            </p>
          </div>


        </div>

        <div className="flex flex-col items-center justify-center gap-3 w-full">
          <Button type="submit" size="lg" className="h-12 w-full gap-2 rounded-xl px-12 sm:w-auto" disabled={isPending}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar
          </Button>
          {state.message ? (
            <p
              className={
                state.ok ? "text-sm text-primary" : "text-sm text-destructive"
              }
              style={{ fontFamily: "var(--font-manrope), sans-serif" }}
            >
              {state.message}
            </p>
          ) : null}
        </div>
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
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-8 text-center sm:p-12 shadow-sm">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-full max-w-md -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-3xl" />
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-10">
        
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            <Clock className="size-7 text-primary" />
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Quem drena a fila</h2>
          </div>
          <p className="mx-auto max-w-lg text-[14px] text-muted-foreground sm:text-base text-balance">
            O pg_cron do próprio Supabase chama o endereço abaixo de minuto em
            minuto, e o token é lido direto do Vault — nenhum serviço novo, nenhum
            valor colado em SQL. Habilite a extensão <code className="font-mono font-bold">pg_net</code> em Database → Extensions antes de gerar o token.
          </p>
        </div>

        <div className="flex w-full max-w-2xl flex-col gap-6 text-left">
          <div className="w-full rounded-2xl border border-primary/10 bg-gradient-to-b from-primary/5 to-transparent p-5 sm:p-6 shadow-sm">
            <p className="text-[15px] font-semibold tracking-tight text-center sm:text-left">Endereço deste ambiente</p>
            <div className="mt-4 overflow-hidden rounded-2xl border border-primary/20 bg-background/80 p-2 shadow-sm backdrop-blur transition-colors hover:border-primary/40">
              <code 
                className="block px-3 py-2 text-left font-mono text-[16px] leading-tight tracking-tight text-foreground whitespace-nowrap overflow-x-auto" 
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {origin}/api/cron/dispatch
              </code>
            </div>
            <p className="mt-3 text-[13px] text-muted-foreground text-center sm:text-left text-balance">
              Cole no campo “URL do cron” acima e salve. Em produção ele precisa ser o domínio público, não o endereço local.
            </p>
          </div>

          <div className="w-full">
            {state.revealedToken ? <RevealOnce token={state.revealedToken} /> : null}
          </div>

          <form action={formAction} className="flex flex-col items-center justify-center w-full gap-3">
            <Button type="submit" size="lg" className="h-12 gap-2 rounded-xl px-12" disabled={isPending}>
              {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {settings.hasCronToken ? "Gerar token novo" : "Gerar token do cron"}
            </Button>
            {state.message && !state.ok ? (
              <p className="text-sm text-destructive" style={{ fontFamily: "var(--font-manrope), sans-serif" }}>
                {state.message}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  )
}
