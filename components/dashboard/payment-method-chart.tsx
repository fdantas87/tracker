"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatarMoeda } from "@/lib/dashboard/format"
import type { FatiaPagamento } from "@/lib/dashboard/vendas"

const config = {
  valor: { label: "Vendas", color: "var(--chart-1)" },
} satisfies ChartConfig

/**
 * Receita aprovada por forma de pagamento.
 *
 * O eixo Y é dinheiro, então o tick vai abreviado ("R$ 2,4 mil") — escrever o
 * valor inteiro em cada marca empurraria o gráfico para a direita e comeria a
 * área útil. O valor exato aparece no tooltip.
 */
function tickCurto(valor: number, moeda: string): string {
  if (valor >= 1_000_000) return `${(valor / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`
  if (valor >= 1_000) return `${(valor / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`
  return formatarMoeda(valor, moeda)
}

export function PaymentMethodChart({
  dados,
  moeda,
}: {
  dados: FatiaPagamento[]
  moeda: string
}) {
  const vazio = !dados.length || dados.every((d) => d.valor === 0)

  if (vazio) {
    return (
      <div className="flex h-[180px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Nenhuma venda aprovada neste período.
      </div>
    )
  }

  return (
    <ChartContainer config={config} className="h-[180px] w-full">
      <BarChart data={dados} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickMargin={4}
          tickFormatter={(valor: number) => tickCurto(valor, moeda)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(valor) => formatarMoeda(Number(valor), moeda)}
            />
          }
        />
        <Bar dataKey="valor" fill="var(--color-valor)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
