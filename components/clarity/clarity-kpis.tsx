"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { StatCard } from "@/components/dashboard/stat-card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { fmtDecimal, fmtDuracao, fmtInteiro, fmtPct } from "@/lib/clarity/format"
import type { PontoTendencia } from "@/lib/clarity/queries"

export type MetricaKpi = "sessoes" | "usuarios" | "paginasPorSessao" | "scroll" | "tempoAtivo"

export type Kpi = {
  metrica: MetricaKpi
  label: string
  valor: string
  /** Texto do balão de informação. Montado no servidor (leva números do período). */
  info: string
}

const FORMATO: Record<MetricaKpi, (v: number | null) => string> = {
  sessoes: fmtInteiro,
  usuarios: fmtInteiro,
  paginasPorSessao: fmtDecimal,
  scroll: fmtPct,
  tempoAtivo: fmtDuracao,
}

const CHAVE = "clarity-tendencia-visivel"

/**
 * Toggle num store externo (localStorage), pelo mesmo motivo de
 * `events-chart-widget.tsx`: ler no mount com `useEffect` + `setState` é o que
 * o lint do React 19 recusa. Um toggle só para os cinco cards — recolher um a
 * um deixaria a fileira com alturas desencontradas.
 */
const ouvintes = new Set<() => void>()

function subscribe(aoMudar: () => void) {
  ouvintes.add(aoMudar)
  return () => {
    ouvintes.delete(aoMudar)
  }
}

/** Padrão é visível: storage bloqueado não pode esconder o gráfico. */
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

function diaCurto(iso: string) {
  const [, mes, dia] = iso.split("-")
  return `${dia}/${mes}`
}

/** Os `dias` dias de calendário que terminam em `hoje` ("2026-10-05"), em ordem. */
function diasAteHoje(hoje: string, dias: number): string[] {
  const [ano, mes, dia] = hoje.split("-").map(Number)
  const saida: string[] = []
  for (let i = dias - 1; i >= 0; i--) {
    // UTC puro: só aritmética de calendário, sem fuso no caminho.
    saida.push(new Date(Date.UTC(ano, mes - 1, dia - i)).toISOString().slice(0, 10))
  }
  return saida
}

/** Escala do eixo Y sem sufixo longo: o card é estreito e o tooltip tem o valor exato. */
function fmtEixo(v: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v)
}

/** Primeiro, do meio e último dia: com mais que isso os rótulos viram borrão num card estreito. */
function ticksDoEixo(dias: string[]): string[] {
  if (dias.length <= 3) return dias
  return [dias[0], dias[Math.floor((dias.length - 1) / 2)], dias[dias.length - 1]]
}

function Tendencia({
  metrica,
  label,
  serie,
  hoje,
  dias,
}: {
  metrica: MetricaKpi
  label: string
  serie: PontoTendencia[]
  hoje: string
  dias: number
}) {
  const gradId = `grad-${React.useId().replace(/:/g, "")}`
  const dados = serie.map((p) => ({ dia: p.dia, valor: p[metrica] }))
  // Sem pontos suficientes para uma linha, o gráfico continua aí, vazio: eixos,
  // grade e as datas do período, como o Clarity. Os valores ficam `null` (não 0):
  // ausência de dado não é "zero sessões".
  const vazio = dados.filter((d) => d.valor !== null).length < 2
  const pontos = vazio
    ? diasAteHoje(hoje, dias).map((dia) => ({ dia, valor: null as number | null, base: 0 }))
    : dados.map((d) => ({ ...d, base: null as number | null }))

  const formatar = FORMATO[metrica]
  const comPontos = pontos.length <= 10

  return (
    <ChartContainer
      config={{ valor: { label, color: "var(--primary)" } }}
      className="aspect-auto h-40 w-full"
    >
      <AreaChart data={pontos} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-valor)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-valor)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
        <YAxis
          width={32}
          domain={vazio ? [0, 4] : [0, "auto"]}
          ticks={vazio ? [0, 1, 2, 3, 4] : undefined}
          tickCount={4}
          allowDecimals={!vazio && metrica !== "sessoes" && metrica !== "usuarios"}
          tickFormatter={fmtEixo}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          tick={{ fontSize: 10 }}
        />
        <XAxis
          dataKey="dia"
          ticks={ticksDoEixo(pontos.map((p) => p.dia))}
          interval={0}
          padding={{ left: 8, right: 8 }}
          tickLine={{ stroke: "var(--border)" }}
          axisLine={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.5 }}
          tickSize={4}
          tickMargin={6}
          tickFormatter={diaCurto}
          tick={{ fontSize: 10 }}
        />
        {vazio ? null : (
          <ChartTooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4, strokeDasharray: "3 3" }}
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(valor) =>
                  new Date(`${valor}T12:00:00`).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                  })
                }
                formatter={(valor) => (
                  <span className="font-mono tabular-nums">{formatar(Number(valor))}</span>
                )}
              />
            }
          />
        )}
        <Area
          dataKey="valor"
          type="monotone"
          stroke="var(--color-valor)"
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          dot={
            comPontos
              ? { r: 3.5, fill: "var(--background)", stroke: "var(--color-valor)", strokeWidth: 2 }
              : false
          }
          activeDot={{ r: 5, fill: "var(--color-valor)", stroke: "var(--background)", strokeWidth: 2 }}
          connectNulls
          isAnimationActive={false}
        />
        {vazio ? (
          // O Recharts não desenha o eixo Y quando a única série é toda `null`.
          // Esta série invisível no zero mantém escala e grade sem inventar dado.
          <Area dataKey="base" stroke="none" fill="none" isAnimationActive={false} legendType="none" />
        ) : null}
      </AreaChart>
    </ChartContainer>
  )
}

/**
 * Os KPIs do Clarity, cada um com a própria tendência diária embaixo — como no
 * painel do Clarity. Sem legenda dentro do card: o contexto de cada número vive
 * no balão de informação ao lado do título.
 */
export function ClarityKpis({
  kpis,
  serie,
  dias,
  hoje,
}: {
  kpis: Kpi[]
  serie: PontoTendencia[]
  dias: number
  /** Dia de calendário atual no fuso do painel; ancora o eixo do gráfico vazio. */
  hoje: string
}) {
  const visivel = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  // "Hoje" tem um ponto só: não existe tendência a mostrar, nem toggle a oferecer.
  const temTendencia = dias > 1

  return (
    <section className="flex flex-col gap-3">
      {temTendencia ? (
        <div className="flex items-center justify-end gap-2">
          <Label htmlFor="clarity-tendencia-toggle" className="text-xs text-muted-foreground">
            Tendência
          </Label>
          <Switch
            id="clarity-tendencia-toggle"
            size="sm"
            checked={visivel}
            onCheckedChange={definirVisivel}
            aria-label={visivel ? "Ocultar tendência" : "Exibir tendência"}
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <StatCard key={k.metrica} label={k.label} valor={k.valor} info={k.info}>
            {temTendencia && visivel ? (
              <Tendencia
                metrica={k.metrica}
                label={k.label}
                serie={serie}
                hoje={hoje}
                dias={dias}
              />
            ) : null}
          </StatCard>
        ))}
      </div>
    </section>
  )
}
