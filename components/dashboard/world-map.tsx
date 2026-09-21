"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

import type { WorldMapProps } from "./world-map-impl"

/**
 * Só no cliente, mesmo padrão de `payment-method-chart.tsx`.
 *
 * Aqui o motivo é mais forte que o de lá: o mapa projeta a partir do tamanho
 * que ele mede na tela. No servidor não existe tamanho, então o HTML gerado
 * seria descartado no primeiro frame — e, com `d3-zoom` e `ResizeObserver` no
 * meio, o que dá é divergência de hidratação, não economia.
 */
const Mapa = dynamic(() => import("./world-map-impl"), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      <span>Carregando o mapa…</span>
    </div>
  ),
})

export function WorldMap(props: WorldMapProps) {
  return <Mapa {...props} />
}
