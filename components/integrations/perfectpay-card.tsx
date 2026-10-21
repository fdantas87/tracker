"use client"

import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** A PerfectPay não tem credencial própria: usa o webhook genérico do tracker. */
export function PerfectPayDialog({
  open,
  onOpenChange,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  footer?: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>PerfectPay</DialogTitle>
          <DialogDescription>
            A PerfectPay não precisa de chave de API. As vendas chegam pelo
            webhook do tracker.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border bg-muted/50 p-5 mt-2">
          <p className="text-[13px] text-muted-foreground leading-relaxed text-center">
            A URL e o token estão na aba{" "}
            <span className="font-semibold text-foreground">Webhook</span> desta
            página. Copie a URL e cole na área de PostBack da PerfectPay.
          </p>
        </div>
        {footer}
      </DialogContent>
    </Dialog>
  )
}
