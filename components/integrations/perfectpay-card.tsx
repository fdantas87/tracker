"use client"

import * as React from "react"
import { Pencil, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

import { IntegrationCard } from "./integration-card"

export function PerfectPayCard() {
  const [formOpen, setFormOpen] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  return (
    <>
      <IntegrationCard
        name="PerfectPay"
        icon="/logos/perfectpay-icon.png"
        status="conectado"
        actions={
          <>
            <Button variant="ghost" size="icon-sm" onClick={() => setFormOpen(true)} aria-label="Editar">
              <Pencil className="size-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setConfirmOpen(true)}
              aria-label="Desconectar"
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        }
      />

      {/* Modal de "Edição" / Informação */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configuração PerfectPay</DialogTitle>
            <DialogDescription>
              A PerfectPay não requer chaves de API próprias para enviar vendas. Ela usa o webhook genérico do tracker.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border bg-muted/50 p-5 mt-2">
            <p className="text-[13px] text-muted-foreground leading-relaxed text-center">
              A URL final e o seu token estão disponíveis na aba{" "}
              <span className="font-semibold text-foreground">Webhook</span> desta página.
              Basta copiar a URL e colar na área de PostBack da PerfectPay.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Exclusão (Informativo) */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar PerfectPay?</AlertDialogTitle>
            <AlertDialogDescription>
              A PerfectPay não possui uma conexão exclusiva que possa ser "excluída" aqui, pois ela envia dados via webhook genérico.
              <br /><br />
              Para parar de receber as vendas, basta remover a URL de webhook <strong>dentro do painel da própria PerfectPay</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Entendi</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
