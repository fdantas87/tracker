"use client"

import * as React from "react"
import {
  CheckCircle2,
  ExternalLink,
  Info,
  LoaderCircle,
  Pencil,
  Plug,
  Trash2,
  X,
  XCircle,
} from "lucide-react"
import { SiMeta, SiGoogleanalytics, SiGoogleads } from "react-icons/si"

import {
  deleteAccount,
  testAccountConnection,
  toggleAccountActive,
} from "@/app/(dashboard)/pixels/actions"
import { IDLE_STATE } from "@/lib/settings/action-state"
import type { ConnectionTestResult } from "@/lib/connections/test-connection"
import { ACCOUNT_CONFIG, type AccountKind } from "@/lib/settings/config"
import type { AccountRow } from "@/lib/settings/queries"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

const GA4_DEBUGVIEW_URL = "https://analytics.google.com/analytics/web/#/debugview"

function getPlatformConfig(kind: AccountKind) {
  switch (kind) {
    case "pixel":
      return { 
        icon: SiMeta, 
        color: "#0668E1", 
        bg: "bg-[#0668E1]/10", 
        border: "border-[#0668E1]/20",
        glow: "bg-[#0668E1]"
      }
    case "adaccount":
      return { 
        icon: SiGoogleads, 
        color: "#F4B400", 
        bg: "bg-[#F4B400]/10", 
        border: "border-[#F4B400]/20",
        glow: "bg-[#F4B400]"
      }
    case "ga4":
      return { 
        icon: SiGoogleanalytics, 
        color: "#E37400", 
        bg: "bg-[#E37400]/10", 
        border: "border-[#E37400]/20",
        glow: "bg-[#E37400]"
      }
    default:
      return { 
        icon: Plug, 
        color: "currentColor", 
        bg: "bg-muted/50", 
        border: "border-border",
        glow: "bg-muted"
      }
  }
}

export function DestinationCard({
  kind,
  account,
  onEdit,
}: {
  kind: AccountKind
  account: AccountRow
  onEdit: () => void
}) {
  const [testing, startTesting] = React.useTransition()
  const [testResult, setTestResult] = React.useState<ConnectionTestResult | null>(null)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  function runTest() {
    setTestResult(null)
    startTesting(async () => {
      setTestResult(await testAccountConnection(kind, account.id))
    })
  }

  function toggleActive(nextActive: boolean) {
    const formData = new FormData()
    formData.set("kind", kind)
    formData.set("id", account.id)
    formData.set("next_active", String(nextActive))
    startTransition(async () => {
      await toggleAccountActive(IDLE_STATE, formData)
    })
  }

  function confirmDelete() {
    const formData = new FormData()
    formData.set("kind", kind)
    formData.set("id", account.id)
    startTransition(async () => {
      await deleteAccount(IDLE_STATE, formData)
      setConfirmOpen(false)
    })
  }

  const config = getPlatformConfig(kind)
  const Icon = config.icon

  return (
    <li className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-5 sm:p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/30">
      {/* Decorative background glow behind the icon */}
      <div className={cn("pointer-events-none absolute -top-10 -left-10 h-32 w-32 rounded-full blur-3xl opacity-15 transition-opacity group-hover:opacity-30", config.glow)} />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {/* Logo container */}
          <div className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-sm backdrop-blur-md border transition-transform group-hover:scale-105 duration-300", config.bg, config.border)}>
            <Icon className="size-8" style={{ color: config.color }} />
          </div>

          {/* Headline and ID */}
          <div className="min-w-0 flex flex-col gap-1.5">
            <h3 className="text-lg font-bold tracking-tight truncate leading-none text-foreground">{account.label}</h3>
            <div className="flex items-center">
              <span className="inline-flex items-center rounded-md bg-background/50 border border-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground backdrop-blur-sm shadow-sm truncate max-w-[200px] sm:max-w-[150px] lg:max-w-[120px] xl:max-w-[180px]">
                {account.publicId}
              </span>
            </div>
          </div>
        </div>

        <Switch
          checked={account.isActive}
          onCheckedChange={toggleActive}
          disabled={pending}
          aria-label={account.isActive ? "Desativar" : "Ativar"}
          className="shrink-0 mt-2"
        />
      </div>

      <div className="relative z-10 mt-6 flex items-center justify-between border-t border-border/50 pt-4">
        <div>
          {account.isActive ? (
            <Badge variant="outline" className="border-green-500/30 text-green-600 bg-green-500/10 dark:text-green-400">Ativo</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Inativo</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={runTest}
            disabled={testing}
            title="Testar Conexão"
          >
            {testing ? <LoaderCircle className="animate-spin size-4" /> : <Plug className="size-4 text-muted-foreground" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Editar">
            <Pencil className="size-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setConfirmOpen(true)}
            aria-label="Remover"
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {testResult ? (
        <div className="relative z-10 mt-4 border-t border-border/50 pt-4">
          <TestResult result={testResult} kind={kind} onClose={() => setTestResult(null)} />
        </div>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{account.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O segredo guardado no Vault também é apagado. Os eventos deixam de
              ser enviados para este destino. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={pending}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

function TestResult({
  result,
  kind,
  onClose,
}: {
  result: ConnectionTestResult
  kind: AccountKind
  onClose: () => void
}) {
  const tone = {
    ok: { icon: CheckCircle2, className: "text-primary" },
    verificar: { icon: Info, className: "text-cyan" },
    erro: { icon: XCircle, className: "text-destructive" },
  }[result.status]

  const Icon = tone.icon

  return (
    <div className="relative flex items-start gap-2 rounded-xl bg-background/60 p-3 border border-border/40 shadow-sm pr-8">
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone.className}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-tight text-foreground/90">{result.message}</p>
        {result.detail ? (
          <p className="mt-1.5 text-xs text-muted-foreground leading-snug">{result.detail}</p>
        ) : null}
        {kind === "ga4" && result.status === "verificar" ? (
          <a
            href={GA4_DEBUGVIEW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cyan hover:underline"
          >
            Abrir o DebugView do GA4
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
      <button 
        onClick={onClose}
        className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
        aria-label="Fechar"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
