"use client"

import * as React from "react"
import { useActionState } from "react"
import { KeyRound, LoaderCircle, Save, Settings2, Webhook, Check, Copy, FormInput } from "lucide-react"

import {
  createInitialSettings,
  saveGeneralSettings,
  saveFormCaptureSettings,
} from "@/app/(dashboard)/pixels/actions"
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
import { Switch } from "@/components/ui/switch"
import { AllowedOriginsSection } from "../settings/allowed-origins-section"
import { InstallationSection } from "../settings/installation-section"
import { RevealOnce } from "../settings/reveal-once"

export function SiteTab({ settings }: { settings: SettingsRow | null }) {
  return (
    <div className="flex flex-col gap-4">
      <InstallationSection />
      {settings ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-4 items-start">
          <AllowedOriginsSection settings={settings} />
          <CurrencyForm settings={settings} />
          <TestCodeForm settings={settings} />
          <FormCaptureSection settings={settings} />
        </div>
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

function CurrencyForm({ settings }: { settings: SettingsRow }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveGeneralSettings,
    IDLE_STATE
  )
  const formRef = React.useRef<HTMLFormElement>(null)

  return (
    <form ref={formRef} action={formAction} className="relative flex flex-col items-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-6 text-center sm:p-8 shadow-sm min-h-[340px]">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-full max-w-md -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-3xl" />
      
      <div className="relative z-10 flex w-full flex-col items-center gap-6 flex-1">
        <div className="flex flex-col items-center gap-2">
          <Settings2 className="size-6 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight">Moeda padrão</h2>
          <p className="text-[13px] text-muted-foreground text-balance min-h-[40px]">
            Moeda usada no cálculo de receita dos eventos.
          </p>
        </div>

        <div className="flex w-full flex-col gap-4">
          <input type="hidden" name="test_event_code" value={settings.testEventCode ?? ""} />
          <Select 
            name="currency" 
            defaultValue={settings.currency}
            onValueChange={() => formRef.current?.requestSubmit()}
          >
            <SelectTrigger className="h-14 w-full rounded-2xl border-primary/20 bg-background/80 px-5 shadow-sm backdrop-blur transition-colors hover:border-primary/40 focus:border-primary/40 focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="BRL">BRL — Real</SelectItem>
              <SelectItem value="USD">USD — Dólar</SelectItem>
              <SelectItem value="EUR">EUR — Euro</SelectItem>
            </SelectContent>
          </Select>

          <div className="h-5">
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin mx-auto text-muted-foreground" />
            ) : state.message ? (
              <span className={state.ok ? "text-xs font-medium text-primary" : "text-xs font-medium text-destructive"}>
                {state.message}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  )
}

function TestCodeForm({ settings }: { settings: SettingsRow }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveGeneralSettings,
    IDLE_STATE
  )

  return (
    <form action={formAction} className="relative flex flex-col items-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-6 text-center sm:p-8 shadow-sm min-h-[380px]">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-full max-w-md -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-3xl" />
      
      <div className="relative z-10 flex w-full flex-col items-center gap-6 flex-1">
        <div className="flex flex-col items-center gap-2">
          <Webhook className="size-6 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight">Código de teste</h2>
          <p className="text-[13px] text-muted-foreground text-balance min-h-[40px]">
            Encontrado no Events Manager (Opcional).
          </p>
        </div>

        <div className="flex w-full flex-col gap-4">
          <input type="hidden" name="currency" value={settings.currency} />
          <Input
            name="test_event_code"
            defaultValue={settings.testEventCode ?? ""}
            placeholder="TEST12345"
            className="h-14 w-full rounded-2xl border-primary/20 bg-background/80 px-5 text-center font-mono shadow-sm backdrop-blur transition-colors hover:border-primary/40 focus-visible:border-primary/40 focus-visible:ring-0"
          />
          <Button type="submit" className="w-full gap-2 h-12 rounded-xl" disabled={isPending}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar
          </Button>

          {state.message && (
            <span className={state.ok ? "text-xs font-medium text-primary" : "text-xs font-medium text-destructive"}>
              {state.message}
            </span>
          )}
        </div>
      </div>
    </form>
  )
}

function FormCaptureSection({ settings }: { settings: SettingsRow }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveFormCaptureSettings,
    IDLE_STATE
  )
  const formRef = React.useRef<HTMLFormElement>(null)

  return (
    <form ref={formRef} action={formAction} className="relative flex flex-col items-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-6 text-center sm:p-8 shadow-sm min-h-[340px]">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-full max-w-md -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-3xl" />
      
      <div className="relative z-10 flex w-full flex-col items-center gap-6 flex-1">
        <div className="flex flex-col items-center gap-2">
          <FormInput className="size-6 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight">Capturar formulários</h2>
          <p className="text-[13px] text-muted-foreground text-balance min-h-[40px]">
            Lê email, telefone e nome. Ignora senhas e cartões.
          </p>
        </div>

        <div className="flex w-full flex-col gap-4">
          <div className="flex items-center justify-between gap-4 w-full rounded-2xl border border-primary/20 bg-background/80 p-5 shadow-sm backdrop-blur h-14">
            <Label htmlFor="form_capture_enabled" className="text-[14px] font-semibold cursor-pointer">
              Ativar leitura
            </Label>
            <div className="flex items-center gap-3">
              {isPending && <LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
              <Switch
                id="form_capture_enabled"
                name="form_capture_enabled"
                defaultChecked={settings.formCaptureEnabled}
                onCheckedChange={() => formRef.current?.requestSubmit()}
                disabled={isPending}
              />
            </div>
          </div>
          
          <div className="h-5">
            {state.message ? (
              <span className={state.ok ? "text-xs font-medium text-primary" : "text-xs font-medium text-destructive"}>
                {state.message}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  )
}


