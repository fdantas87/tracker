"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { SeriePonto } from "@/lib/dashboard/filters"

const config = {
  enviados: { label: "Enviados", color: "var(--chart-1)" },
  outros: { label: "Na fila / falha", color: "var(--chart-3)" },
} satisfies ChartConfig

/** Rótulo curto do eixo: "18/09". Evita depender de date-fns só para isso. */
function diaCurto(iso: string) {
  const [, mes, dia] = iso.split("-")
  return `${dia}/${mes}`
}

export function EventsChart({ dados }: { dados: SeriePonto[] }) {
  const vazio = dados.every((d) => d.enviados === 0 && d.outros === 0)

  if (vazio) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
        Nenhum evento capturado neste período.
      </div>
    )
  }

  return (
    <ChartContainer config={config} className="h-[180px] w-full">
      <BarChart data={dados} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="dia"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
          tickFormatter={diaCurto}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
          tickMargin={4}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(valor) =>
                new Date(`${valor}T12:00:00`).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                })
              }
            />
          }
        />
        <Bar dataKey="enviados" stackId="a" fill="var(--color-enviados)" radius={[0, 0, 4, 4]} />
        <Bar dataKey="outros" stackId="a" fill="var(--color-outros)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
