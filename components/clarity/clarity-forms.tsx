"use client"

import * as React from "react"
import { useActionState } from "react"
import { CheckCircle2, Info, LoaderCircle, ShieldAlert, XCircle } from "lucide-react"

import {
  saveClarityProjectId,
  saveClarityToken,
} from "@/app/(dashboard)/mapa-de-calor/actions"
import type { ConnectionTestResult } from "@/lib/connections/test-connection"
import { IDLE_STATE, type ActionState } from "@/lib/settings/action-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * Peças de formulário do Clarity, usadas pelo assistente (tela sem conexão) e
 * pelo diálogo "Configurar" (tela já conectada) — os dois na tela Mapa de
 * Calor, que é a dona da integração.
 */

const INPUT_CLASS =
  "h-12 w-full rounded-xl border-primary/20 bg-background/80 px-4 font-mono text-sm shadow-sm transition-colors hover:border-primary/40 focus-visible:border-primary/40 focus-visible:ring-0"

function Mensagem({ state }: { state: ActionState }) {
  if (!state.message) return null
  return (
    <p className={cn("text-sm", state.ok ? "text-primary" : "text-destructive")}>
      {state.message}
    </p>
  )
}

/**
 * Aceita o ID, a URL do projeto ou o código de rastreamento inteiro: quem
 * abre o Clarity tem esses dois à mão, não um campo chamado "Project ID". A
 * extração acontece no servidor (`extrairProjectId`).
 */
export function ProjectIdForm({
  defaultValue,
  submitLabel = "Conectar",
}: {
  defaultValue?: string
  submitLabel?: string
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveClarityProjectId,
    IDLE_STATE
  )

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="project_id"
          autoComplete="off"
          spellCheck={false}
          defaultValue={defaultValue}
          placeholder="Cole aqui o endereço do projeto no Clarity"
          aria-label="Endereço ou Project ID do Clarity"
          required
          className={INPUT_CLASS}
        />
        <Button type="submit" className="h-12 rounded-xl px-6" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Serve o endereço da barra do navegador com o projeto aberto
        (<code className="font-mono">clarity.microsoft.com/projects/view/…</code>), o
        código de rastreamento inteiro ou só o ID de 10 letras.
      </p>
      <Mensagem state={state} />
    </form>
  )
}

/**
 * Salvar o token já busca os dados no Clarity — por isso o aviso de espera.
 * Se o Clarity recusar, o token não fica salvo (ver `saveClarityToken`).
 */
export function TokenForm({
  replacing = false,
  submitLabel = "Salvar e buscar dados",
}: {
  replacing?: boolean
  submitLabel?: string
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveClarityToken,
    IDLE_STATE
  )

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="api_token"
          type="password"
          autoComplete="off"
          placeholder={replacing ? "Cole um token novo para substituir o atual" : "eyJhbGciOi…"}
          aria-label="Token da Data Export API do Clarity"
          required
          className={INPUT_CLASS}
        />
        <Button type="submit" className="h-12 rounded-xl px-6" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
      {pending ? (
        <p className="text-xs text-cyan">
          Conferindo o token e buscando seus dados no Clarity… pode levar até 1 minuto.
        </p>
      ) : (
        <Mensagem state={state} />
      )}
    </form>
  )
}

/**
 * O que precisa estar certo do lado do Clarity. O Clarity grava a tela e a URL
 * inteiras, e o tracker não tem como filtrar isso como faz com o
 * event_source_url.
 */
export function ClarityCuidados({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-amber/30 bg-amber/5 p-4 text-[13px]"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
        <ShieldAlert className="size-4 text-amber" />
        Cuidados antes de ligar
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">
          ver
        </span>
      </summary>
      <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
        <li>
          <strong className="text-foreground">Um dono só.</strong> Se o Clarity já
          está instalado no site (GTM, plugin, código), remova a outra instalação —
          senão cada sessão é gravada duas vezes.
        </li>
        <li>
          <strong className="text-foreground">Dados sensíveis.</strong> O Clarity
          grava a tela e a URL completa. Em Settings → Masking, use o modo{" "}
          <em>Strict</em> em site de saúde ou com dado pessoal na tela.
        </li>
        <li>
          <strong className="text-foreground">Público.</strong> O Clarity não pode
          ser usado em sites voltados a menores de 18 anos. Para visitantes da
          União Europeia, Reino Unido e Suíça, o banner de cookies do site precisa
          chamar <code className="font-mono">thetrack.clarityConsent()</code>.
        </li>
      </ul>
    </details>
  )
}

export function TestResult({ result }: { result: ConnectionTestResult }) {
  // "verificar" é ciano informativo, nunca âmbar — um resultado esperado
  // pintado de alerta já foi lido como falha neste projeto.
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
