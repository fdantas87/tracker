"use client"

import * as React from "react"
import { useActionState } from "react"
import { LoaderCircle } from "lucide-react"

import { saveAccount } from "@/app/(dashboard)/configuracoes/actions"
import { IDLE_STATE, type ActionState } from "@/lib/settings/action-state"
import { ACCOUNT_CONFIG, type AccountKind } from "@/lib/settings/config"
import type { AccountRow } from "@/lib/settings/queries"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function AccountFormDialog({
  kind,
  account,
  open,
  onOpenChange,
}: {
  kind: AccountKind
  /** Ausente = criação. Presente = edição. */
  account?: AccountRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const config = ACCOUNT_CONFIG[kind]
  const isEditing = Boolean(account)

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveAccount,
    IDLE_STATE
  )

  // Fecha sozinho quando a action confirma sucesso.
  React.useEffect(() => {
    if (state.ok) onOpenChange(false)
  }, [state.ok, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar" : "Adicionar"} {config.singular}
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="kind" value={kind} />
          {account ? (
            <input type="hidden" name="id" value={account.id} />
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="label">Nome</Label>
            <Input
              id="label"
              name="label"
              defaultValue={account?.label ?? ""}
              placeholder="Ex.: Conta principal"
              required
              className="h-10"
            />
            <p className="text-xs text-muted-foreground">
              Só para você identificar na lista.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="public_id">{config.publicIdLabel}</Label>
            <Input
              id="public_id"
              name="public_id"
              defaultValue={account?.publicId ?? ""}
              placeholder={config.publicIdPlaceholder}
              required
              className="h-10 font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {config.publicIdHint}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="secret">{config.secretLabel}</Label>
            <Input
              id="secret"
              name="secret"
              type="password"
              autoComplete="off"
              placeholder={
                isEditing ? "Deixe em branco para manter o atual" : "Cole aqui"
              }
              required={!isEditing}
              className="h-10 font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {isEditing
                ? "O valor salvo não pode ser consultado — preencha só se for substituir."
                : config.secretHint}
            </p>
          </div>

          {state.message && !state.ok ? (
            <p className="text-sm text-destructive">{state.message}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <LoaderCircle className="animate-spin" /> : null}
              {isEditing ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
