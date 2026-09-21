"use client"

import { LabelList, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { SeriePonto } from "@/lib/dashboard/filters"

const config = {
  enviados: { label: "Enviados", color: "var(--chart-1)" },
  outros: { label: "Na fila / falha", color: "var(--chart-3)" },
} satisfies ChartConfig

/** Acima disso os números nos pontos se sobrepõem e viram borrão. */
const MAX_PONTOS_COM_ROTULO = 10

/** Rótulo curto do eixo: "18/09". Evita depender de date-fns só para isso. */
function diaCurto(iso: string) {
  const [, mes, dia] = iso.split("-")
  return `${dia}/${mes}`
}

export function EventsChart({ dados }: { dados: SeriePonto[] }) {
  const vazio = dados.every((d) => d.enviados === 0 && d.outros === 0)

  if (vazio) {
    return (
      <div className="flex h-32 items-center justify-center px-2 text-center text-sm text-muted-foreground sm:h-40">
        Nenhum evento capturado neste período.
      </div>
    )
  }

  // Num card de ~18rem cabem uns poucos números; em 30 dias o tooltip é quem
  // entrega o valor exato.
  const comRotulo = dados.length <= MAX_PONTOS_COM_ROTULO

  return (
    <ChartContainer config={config} className="h-32 w-full sm:h-40">
      <LineChart data={dados} margin={{ left: 12, right: 12, top: 18, bottom: 0 }}>
        {/* Eixo escondido só para afastar a linha do zero da base: sem ele os
            rótulos de "outros" caem em cima dos ticks de data. */}
        <YAxis hide allowDecimals={false} padding={{ top: 4, bottom: 14 }} />
        <XAxis
          dataKey="dia"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={20}
          tickFormatter={diaCurto}
          tick={{ fontSize: 11 }}
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
        <Line
          dataKey="enviados"
          type="monotone"
          stroke="var(--color-enviados)"
          strokeWidth={2}
          dot={{ r: 2.5 }}
          activeDot={{ r: 4 }}
        >
          {comRotulo ? (
            <LabelList
              dataKey="enviados"
              position="top"
              offset={6}
              className="fill-muted-foreground"
              fontSize={11}
            />
          ) : null}
        </Line>
        <Line
          dataKey="outros"
          type="monotone"
          stroke="var(--color-outros)"
          strokeWidth={2}
          dot={{ r: 2.5 }}
          activeDot={{ r: 4 }}
        >
          {comRotulo ? (
            <LabelList
              dataKey="outros"
              position="bottom"
              offset={6}
              className="fill-muted-foreground"
              fontSize={11}
            />
          ) : null}
        </Line>
        <ChartLegend content={<ChartLegendContent className="pt-2 text-[11px]" />} />
      </LineChart>
    </ChartContainer>
  )
}
