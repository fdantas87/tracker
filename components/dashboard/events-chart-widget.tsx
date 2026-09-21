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
    <div className="glass w-full rounded-2xl p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="eventos-chart-toggle" className="text-sm text-muted-foreground">
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
        <div className="mt-2">
          <EventsChart dados={dados} />
        </div>
      ) : null}
    </div>
  )
}
