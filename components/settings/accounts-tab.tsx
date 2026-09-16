"use client"

import * as React from "react"
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Pencil,
  Plus,
  Plug,
  Trash2,
  XCircle,
} from "lucide-react"

import {
  deleteAccount,
  testAccountConnection,
  toggleAccountActive,
} from "@/app/(dashboard)/configuracoes/actions"
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
import { AccountFormDialog } from "./account-form-dialog"

export function AccountsTab({
  kind,
  accounts,
}: {
  kind: AccountKind
  accounts: AccountRow[]
}) {
  const config = ACCOUNT_CONFIG[kind]
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AccountRow | undefined>()

  function openCreate() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function openEdit(account: AccountRow) {
    setEditing(account)
    setFormOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-medium">{config.title}</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {config.description}
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus />
          Adicionar
        </Button>
      </div>

      {accounts.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma {config.singular} cadastrada ainda.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              kind={kind}
              account={account}
              onEdit={() => openEdit(account)}
            />
          ))}
        </ul>
      )}

      <AccountFormDialog
        // Remonta o formulário ao trocar entre criar/editar, pra os campos
        // não carregarem valor da abertura anterior.
        key={editing?.id ?? "novo"}
        kind={kind}
        account={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </div>
  )
}

function AccountCard({
  kind,
  account,
  onEdit,
}: {
  kind: AccountKind
  account: AccountRow
  onEdit: () => void
}) {
  const [testing, startTesting] = React.useTransition()
  const [testResult, setTestResult] =
    React.useState<ConnectionTestResult | null>(null)
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

  return (
    <li className="glass rounded-2xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{account.label}</span>
            {account.isActive ? (
              <Badge>ativo</Badge>
            ) : (
              <Badge variant="secondary">inativo</Badge>
            )}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {account.publicId}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Segredo guardado cifrado no Vault · não pode ser consultado
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Switch
            checked={account.isActive}
            onCheckedChange={toggleActive}
            disabled={pending}
            aria-label={account.isActive ? "Desativar" : "Ativar"}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={runTest}
            disabled={testing}
          >
            {testing ? <LoaderCircle className="animate-spin" /> : <Plug />}
            Testar
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Editar">
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setConfirmOpen(true)}
            aria-label="Remover"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {testResult ? <TestResult result={testResult} /> : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{account.label}”?</AlertDialogTitle>
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

function TestResult({ result }: { result: ConnectionTestResult }) {
  const tone = {
    ok: { icon: CheckCircle2, className: "text-primary" },
    parcial: { icon: CircleAlert, className: "text-amber" },
    erro: { icon: XCircle, className: "text-destructive" },
  }[result.status]

  const Icon = tone.icon

  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl bg-background/60 p-3">
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
