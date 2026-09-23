"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import type { AccountRow } from "@/lib/settings/queries"
import type { AccountKind } from "@/lib/settings/config"
import { DestinationCard } from "./destination-card"
import { AccountFormDialog } from "./account-form-dialog"
import { Button } from "@/components/ui/button"

export function DestinationsView({
  pixels,
  ga4Accounts,
  adAccounts,
}: {
  pixels: AccountRow[]
  ga4Accounts: AccountRow[]
  adAccounts: AccountRow[]
}) {
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<{ kind: AccountKind; account: AccountRow } | undefined>()

  function openCreate() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function openEdit(kind: AccountKind, account: AccountRow) {
    setEditing({ kind, account })
    setFormOpen(true)
  }

  const allDestinations = [
    ...pixels.map((a) => ({ ...a, kind: "pixel" as const })),
    ...ga4Accounts.map((a) => ({ ...a, kind: "ga4" as const })),
    ...adAccounts.map((a) => ({ ...a, kind: "adaccount" as const })),
  ]

  return (
    <div className="flex flex-col gap-6 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Destinos Ativos</h2>
        <Button onClick={openCreate} className="rounded-xl h-12 px-8 shadow-sm">
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>

      {allDestinations.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent border-dashed">
          <p className="text-muted-foreground mb-4">Nenhum destino cadastrado.</p>
          <Button variant="outline" onClick={openCreate} className="rounded-xl h-10 px-6">
            Adicionar o primeiro
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {allDestinations.map((dest) => (
            <DestinationCard
              key={`${dest.kind}-${dest.id}`}
              kind={dest.kind}
              account={dest}
              onEdit={() => openEdit(dest.kind, dest)}
            />
          ))}
        </ul>
      )}

      <AccountFormDialog
        key={editing?.account.id ?? "novo"}
        initialKind={editing?.kind}
        account={editing?.account}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </div>
  )
}
