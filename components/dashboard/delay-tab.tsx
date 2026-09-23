"use client"

import { useActionState, useState } from "react"
import {
  AlertTriangle,
  Database,
  LoaderCircle,
  Save,
  Send,
  X,
} from "lucide-react"

import {
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
              Há muitos eventos vencidos parados. Confira se a extensão <code className="font-mono font-bold">pg_net</code> está habilitada no Supabase e o indicador de saúde do cron abaixo.
            </span>
          </p>
        ) : null}

        {!settings.hasCronToken ? (
          <p className="flex w-full items-start justify-center gap-2.5 text-left text-[14px] leading-relaxed text-amber-500 sm:items-center sm:text-center" style={{ fontFamily: "var(--font-manrope), sans-serif" }}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0 sm:mt-0" />
            <span className="text-balance">
              O envio automático está sendo configurado neste acesso. Recarregue a página em alguns segundos.
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
  const [mode, setMode] = useState<string>(settings.dispatchMode)

  const defaultEvents = settings.dispatchImmediateEvents.length > 0
    ? settings.dispatchImmediateEvents
    : ["Lead", "Purchase", "CompleteRegistration", "AddPaymentInfo", "InitiateCheckout"]
  const [events, setEvents] = useState<string[]>(defaultEvents)
  const [inputValue, setInputValue] = useState("")

  function addTags(input: string) {
    const newTags = input
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0 && !events.includes(t));
    
    if (newTags.length > 0) {
      setEvents(prev => [...prev, ...newTags]);
    }
    setInputValue('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTags(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && events.length > 0) {
      setEvents(events.slice(0, -1));
    }
  }

  function removeEvent(eventToRemove: string) {
    setEvents(events.filter(e => e !== eventToRemove));
  }

  return (
    <form action={formAction} className="w-full">
      <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-4 items-start">
        {/* Coluna Esquerda: Headline, Modo e Salvar (Ocupa 2/4) */}
        <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-8 text-center sm:p-12 shadow-sm lg:col-span-2">
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

            <div className="flex w-full max-w-2xl flex-col items-center gap-6">
              <div className="flex w-full flex-col gap-4">
                <input type="hidden" name="dispatch_mode" value={mode} />
                <div 
                  className="relative flex w-full max-w-fit items-center overflow-x-auto sm:overflow-visible rounded-[20px] bg-black/40 p-1.5 shadow-[inset_0_4px_10px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                  role="radiogroup"
                >
                  {DISPATCH_MODES.map((m) => {
                    const isActive = mode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => setMode(m)}
                        className={`relative flex items-center justify-center rounded-2xl px-5 py-3 text-[14px] font-medium transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          isActive 
                            ? "text-foreground shadow-[0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)] bg-gradient-to-b from-white/10 to-transparent ring-1 ring-white/10 z-10" 
                            : "text-muted-foreground hover:text-foreground z-0"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute -top-px left-1/2 h-[1px] w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                        )}
                        <span className="relative z-10 flex items-center gap-2.5">
                          <span className={`h-2 w-2 rounded-full transition-all duration-300 ${
                            isActive 
                              ? 'bg-primary shadow-[0_0_12px_hsl(var(--primary))] ring-1 ring-primary/50' 
                              : 'bg-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]'
                          }`} />
                          {DISPATCH_MODE_LABELS[m].title}
                        </span>
                      </button>
                    )
                  })}
                </div>
                
                {/* Legenda Explicativa do Modo Selecionado */}
                <div className="mt-4 flex w-full flex-col items-center justify-center rounded-2xl border border-white/5 bg-black/20 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] text-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-50" />
                  <p className="relative z-10 text-[14px] text-muted-foreground text-balance leading-relaxed">
                    <span className="font-semibold text-foreground mb-1.5 block">
                      {DISPATCH_MODE_LABELS[mode as keyof typeof DISPATCH_MODE_LABELS].title}
                    </span>
                    {DISPATCH_MODE_LABELS[mode as keyof typeof DISPATCH_MODE_LABELS].description}
                  </p>
                </div>
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
        </div>

        {/* Coluna Direita: Janela (Ocupa 1/4) */}
        <div className="relative flex flex-col justify-start overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-8 shadow-sm lg:col-span-1 h-full">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-full max-w-md -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <Label htmlFor="dispatch_delay_minutes" className="ml-1 text-[14px] font-medium text-foreground">Janela (minutos)</Label>
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
              <p className="text-[13px] text-muted-foreground text-left leading-relaxed">
                0 desliga o atraso. O Meta aceita eventos com até 7 dias de
                defasagem, mas passando de 1 hora a chance de aprender algo novo
                quase não cresce e o sinal de otimização envelhece.
              </p>
            </div>
          </div>
        </div>

        {/* Coluna Direita: Eventos Imediatos (Ocupa 1/4) */}
        <div className="relative flex flex-col justify-start overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-8 shadow-sm lg:col-span-1 h-full">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-full max-w-md -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-4">
            <Label htmlFor="dispatch_immediate_events" className="ml-1 text-[14px] font-medium text-foreground">
              Eventos que nunca esperam
            </Label>
            
            <div className="flex flex-col gap-3">
              <input type="hidden" name="dispatch_immediate_events" value={events.join(", ")} />
              
              <div className="flex min-h-14 flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-background/80 px-3 py-2.5 shadow-sm backdrop-blur transition-colors focus-within:border-primary/40 focus-within:ring-0 cursor-text" onClick={() => document.getElementById('dispatch_immediate_events_input')?.focus()}>
                {events.map(ev => (
                  <span key={ev} className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-[13px] font-medium text-primary shadow-sm border border-primary/20 transition-all hover:bg-primary/20">
                    {ev}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEvent(ev);
                      }}
                      className="inline-flex size-[18px] items-center justify-center rounded-full bg-primary/20 text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus:outline-none"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
                
                <input
                  id="dispatch_immediate_events_input"
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={() => addTags(inputValue)}
                  placeholder={events.length === 0 ? "Adicione eventos..." : ""}
                  className="flex-1 bg-transparent px-2 py-1 text-[14px] outline-none placeholder:text-muted-foreground font-mono min-w-[120px]"
                />
              </div>
            </div>
            
            <p className="text-[13px] text-muted-foreground text-left leading-relaxed mt-1">
              Digite o evento e aperte Enter. Estes saem na hora e sempre disparam o pixel do
              navegador. Vale para eventos que já nascem com os dados da pessoa.
            </p>
          </div>
        </div>
      </div>
    </form>
  )
}

