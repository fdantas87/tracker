"use client"

import * as React from "react"
import { LoaderCircle, Plug, Settings2, Trash2 } from "lucide-react"

import {
  removeClarityIntegration,
  testClarityConnection,
  toggleClarityActive,
} from "@/app/(dashboard)/mapa-de-calor/actions"
import type { ClarityAccountRow } from "@/lib/clarity/queries"
import type { ConnectionTestResult } from "@/lib/connections/test-connection"
import { IDLE_STATE } from "@/lib/settings/action-state"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { ClarityCuidados, ProjectIdForm, TestResult, TokenForm } from "./clarity-forms"
import { ClarityNavButton } from "./clarity-nav-button"

/**
 * Tudo que se ajusta no Clarity depois de conectado, sem sair da tela Mapa de
 * Calor: ligar/pausar, trocar o projeto, trocar o token, testar, desconectar.
 */
export function ClaritySettingsDialog({ account }: { account: ClarityAccountRow }) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [testing, startTesting] = React.useTransition()
  const [testResult, setTestResult] = React.useState<ConnectionTestResult | null>(null)

  function toggleActive(nextActive: boolean) {
    const formData = new FormData()
    formData.set("next_active", String(nextActive))
    startTransition(async () => {
      await toggleClarityActive(IDLE_STATE, formData)
    })
  }

  function runTest() {
    setTestResult(null)
    startTesting(async () => {
      setTestResult(await testClarityConnection())
    })
  }

  function remove() {
    startTransition(async () => {
      await removeClarityIntegration()
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ClarityNavButton icone={<Settings2 />} rotulo="Configurar" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Microsoft Clarity</DialogTitle>
          <DialogDescription>
            Projeto <code className="font-mono text-foreground">{account.projectId}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <section className="flex items-start justify-between gap-4 rounded-2xl border p-4">
            <div>
              <p className="text-sm font-medium">Carregar o Clarity nos sites</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pausado, o script deixa de carregar em até 1 minuto e a
                sincronização diária para. O histórico continua aqui.
              </p>
            </div>
            <Switch
              checked={account.isActive}
              onCheckedChange={toggleActive}
              disabled={pending}
              aria-label={account.isActive ? "Pausar o Clarity" : "Ligar o Clarity"}
            />
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium">Projeto</p>
            <ProjectIdForm defaultValue={account.projectId} submitLabel="Salvar" />
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium">Token da Data Export API</p>
            <p className="text-xs text-muted-foreground">
              {account.hasApiToken
                ? "Guardado cifrado. Cole um novo só para substituir — ele é conferido no Clarity antes de valer."
                : "Settings → Data Export → Generate new API token, no projeto do Clarity."}
            </p>
            <TokenForm replacing={account.hasApiToken} submitLabel="Salvar" />
            {account.hasApiToken ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={runTest}
                disabled={testing}
                title="Usa 1 das 10 consultas diárias"
              >
                {testing ? <LoaderCircle className="animate-spin" /> : <Plug />}
                Testar o token
              </Button>
            ) : null}
            {testResult ? <TestResult result={testResult} /> : null}
          </section>

          <ClarityCuidados />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-fit text-destructive hover:bg-destructive/10"
              >
                <Trash2 />
                Desconectar o Clarity
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Desconectar o Clarity?</AlertDialogTitle>
                <AlertDialogDescription>
                  O script deixa de carregar nos sites, o token é apagado e a
                  sincronização para. O histórico já sincronizado continua
                  guardado, e as gravações continuam no próprio Clarity.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={remove} disabled={pending}>
                  Desconectar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DialogContent>
    </Dialog>
  )
}
