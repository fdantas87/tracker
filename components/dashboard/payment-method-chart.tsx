"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

import type { FatiaPagamento } from "@/lib/dashboard/vendas"

const Chart3D = dynamic(() => import("./payment-method-chart-3d-impl"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] flex-col items-center justify-center gap-4 text-sm text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      <span>Carregando motor 3D...</span>
    </div>
  ),
})

export function PaymentMethodChart({
  dados,
  moeda,
}: {
  dados: FatiaPagamento[]
  moeda: string
}) {
  return <Chart3D dados={dados} moeda={moeda} />
}
