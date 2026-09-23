"use client"

import * as React from "react"

import { EventsChart } from "@/components/dashboard/events-chart"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { SeriePonto } from "@/lib/dashboard/filters"

const CHAVE = "eventos-chart-visivel"

/**
 * O estado do toggle é uma store externa (localStorage), não estado de React:
 * `useEffect` + `setState` para ler no mount é justamente o padrão que o lint
 * do React 19 acusa (`react-hooks/set-state-in-effect`) — mesmo motivo de
 * `hooks/use-mobile.ts` ter sido reescrito assim.
 */
const ouvintes = new Set<() => void>()

function subscribe(aoMudar: () => void) {
  ouvintes.add(aoMudar)
  return () => {
    ouvintes.delete(aoMudar)
  }
}

/** Padrão é visível: aba anônima ou storage bloqueado não pode esconder o gráfico. */
function getSnapshot() {
  try {
    return window.localStorage.getItem(CHAVE) !== "0"
  } catch {
    return true
  }
}

function getServerSnapshot() {
  return true
}

function definirVisivel(visivel: boolean) {
  try {
    window.localStorage.setItem(CHAVE, visivel ? "1" : "0")
  } catch {
    // Sem persistência ainda vale alternar dentro desta sessão.
  }
  for (const ouvinte of ouvintes) ouvinte()
}

export function EventsChartWidget({ dados }: { dados: SeriePonto[] }) {
  const visivel = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return (
    <div className="relative flex w-full flex-col overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-5 sm:p-6 shadow-sm">
      <div className="pointer-events-none absolute -top-16 left-1/2 h-32 w-full max-w-[200px] -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-2xl" />
      
      <div className="relative z-10 flex w-full flex-col">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="eventos-chart-toggle" className="text-sm font-medium text-muted-foreground">
            Disparos por dia
          </Label>
          <Switch
            id="eventos-chart-toggle"
            size="sm"
            checked={visivel}
            onCheckedChange={definirVisivel}
            aria-label={visivel ? "Ocultar gráfico" : "Exibir gráfico"}
          />
        </div>

        {visivel ? (
          <div className="mt-4">
            <EventsChart dados={dados} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
