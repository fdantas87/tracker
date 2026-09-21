"use client"

import { useEffect, useRef, useMemo } from "react"
import anychart from "anychart"
import { useTheme } from "next-themes"

import type { FatiaPagamento } from "@/lib/dashboard/vendas"
import { formatarMoeda } from "@/lib/dashboard/format"

const PALETA = ["#4ade80", "#22d3ee", "#fbbf24", "#a78bfa", "#f472b6"]

export default function PaymentMethodChart3DImpl({
  dados,
  moeda,
}: {
  dados: FatiaPagamento[]
  moeda: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<anychart.charts.Pie>(null)
  const { resolvedTheme } = useTheme()

  const vazio = !dados.length || dados.every((d) => d.valor === 0)

  const { linhas } = useMemo(() => {
    const sum = dados.reduce((acc, curr) => acc + curr.valor, 0)
    const linhas = dados.map((d) => {
      const pct = sum > 0 ? (d.valor / sum) * 100 : 0
      return `${d.label} ${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
    }).join(" - ")
    return { linhas }
  }, [dados])

  useEffect(() => {
    if (vazio || !containerRef.current) return

    const chartData = dados.map((d, i) => ({
      x: d.label,
      value: d.valor,
      fill: PALETA[i % PALETA.length],
    }))

    const chart = anychart.pie3d(chartData)
    chartRef.current = chart

    chart.innerRadius("40%")
    
    // Remove os espaços em branco que a engine insere por padrão em torno do gráfico
    chart.padding(0)
    chart.margin(0)
    
    // Rótulos nas fatias
    chart.labels().enabled(true)
    chart.labels().format("{%x}")
    chart.labels().position("inside")
    
    // Desativar legenda nativa
    chart.legend().enabled(false)
    
    // Formatar o tooltip
    chart.tooltip().format(function (this: { value: number }) {
      return formatarMoeda(Number(this.value), moeda)
    })

    // Remover background padrão para encaixar no dark mode / light mode do painel
    chart.background().fill("transparent")
    
    if (resolvedTheme === "dark") {
      chart.labels().fontColor("#000") // Labels escuros em cima de fatias coloridas vibrantes costumam ficar bons, mas podemos deixar branco
    }

    chart.container(containerRef.current)
    chart.draw()

    return () => {
      chart.dispose()
      chartRef.current = null
    }
  }, [dados, vazio, moeda, resolvedTheme])

  if (vazio) {
    return (
      <div className="flex h-[200px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Nenhuma venda aprovada neste período.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-[320px] w-full">
      <div ref={containerRef} className="flex-1 min-h-[260px] w-full -mt-4" />
      <div className="shrink-0 text-center text-[11px] sm:text-xs font-semibold text-muted-foreground mt-2">
        {linhas}
      </div>
    </div>
  )
}
