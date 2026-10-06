"use client"

import { motion, type Variants } from "framer-motion"
import { NeuroNoise } from "@paper-design/shaders-react"
import { ShaderCard } from "@/components/ui/shader-card"
import { formatarMoeda } from "@/lib/dashboard/format"
import { useIsMobile } from "@/hooks/use-mobile"

export interface OverviewData {
  /** Moeda das vendas do período (ISO 4217). */
  moeda: string
  faturamento: number
  roas: number
  vendas: number
  cpa: number
  visitantes: number
  novosClientes: number
  ticketMedio: number
  custoPorVisitante: number
  valorPorVisitante: number
  valorPorLead: number
  valorPorCliente: number
  connectRate: number
  conversaoLeads: number
  conversaoClientes: number
  cpl: number
  cac: number
  produtoMaisVendido: string
}

export function OverviewDashboard({ data }: { data: OverviewData }) {
  // No celular os shaders saem: são 13 contextos WebGL animados (fundo + 12
  // bordas), acima do limite de contextos de muitos navegadores móveis, e o
  // custo de bateria não paga um efeito decorativo.
  const isMobile = useIsMobile()
  const shaders = !isMobile

  const container: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const item: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  }

  // Formatadores
  const formatCurrency = (value: number) => formatarMoeda(value, data.moeda)
  const formatNumber = (value: number) => new Intl.NumberFormat("pt-BR").format(value)
  const formatPercent = (value: number) => `${value.toFixed(1)}%`

  return (
    <div className="relative">
      {/* NeuroNoise background — só na Visão Geral */}
      {shaders && (
        <div className="pointer-events-none fixed inset-0 z-0">
          <NeuroNoise
            style={{ width: "100%", height: "100%" }}
            colorFront="#007a58"
            colorMid="#009e0d"
            colorBack="#000000"
            brightness={0.09}
            contrast={0.2}
            speed={0.32}
            scale={1.08}
            rotation={24}
          />
        </div>
      )}

    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="relative z-[1] flex min-h-[calc(100svh-12rem)] flex-col items-center justify-center gap-6 py-4 lg:gap-8 lg:py-0"
    >
      {/* Camada 1: Faturamento */}
      <motion.div variants={item} className="relative flex w-full min-w-0 flex-col items-center text-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 opacity-50 blur-[100px]" />
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground/80">
          Faturamento
        </p>
        {/* 11vw: "R$ 12.345,67" cabe numa linha em 360px; text-6xl fixo
            passava de 400px e estourava a tela. */}
        <h1 className="relative mt-2 max-w-full break-words font-mono text-[clamp(2rem,11vw,3.75rem)] leading-tight font-semibold tracking-tighter text-foreground sm:text-8xl lg:text-[8rem]">
          {formatCurrency(data.faturamento)}
        </h1>
      </motion.div>

      {/* Camada 2: ROAS, Vendas, CPA */}
      <motion.div variants={item} className="relative z-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:gap-x-16">
        <div className="flex flex-col items-center text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">ROAS</p>
          <p className="font-mono text-xl font-medium tracking-tight sm:text-2xl">{data.roas.toFixed(2)}x</p>
        </div>
        <div className="flex flex-col items-center text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Vendas</p>
          <p className="font-mono text-xl font-medium tracking-tight sm:text-2xl">{formatNumber(data.vendas)}</p>
        </div>
        <div className="flex flex-col items-center text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">CPA</p>
          <p className="font-mono text-xl font-medium tracking-tight sm:text-2xl">{formatCurrency(data.cpa)}</p>
        </div>
      </motion.div>

      {/* Camada 3: 6 Colunas Bootstrap (50% max width) -> 3 items */}
      <motion.div variants={item} className="w-full max-w-3xl">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <Chip label="Visitantes únicos" value={formatNumber(data.visitantes)} shader={shaders} />
          <Chip label="Novos Clientes" value={formatNumber(data.novosClientes)} shader={shaders} />
          <Chip label="Ticket Médio" value={formatCurrency(data.ticketMedio)} shader={shaders} />
        </div>
      </motion.div>

      {/* Camada 4: custo por (esquerda, vermelho) e arrecadado por (direita) */}
      <motion.div variants={item} className="w-full max-w-6xl">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          <Chip label="Custo por Visitante" value={formatCurrency(data.custoPorVisitante)} shader={shaders} tone="danger" compact />
          <Chip label="Custo por Lead" value={formatCurrency(data.cpl)} shader={shaders} tone="danger" compact />
          <Chip label="Custo por Cliente" value={formatCurrency(data.cac)} shader={shaders} tone="danger" compact />
          <Chip label="Arrecadado por Visitante" value={formatCurrency(data.valorPorVisitante)} shader={shaders} compact />
          <Chip label="Arrecadado por Lead" value={formatCurrency(data.valorPorLead)} shader={shaders} compact />
          <Chip label="Arrecadado por Cliente" value={formatCurrency(data.valorPorCliente)} shader={shaders} compact />
        </div>
      </motion.div>

      {/* Camada 5: 12 Colunas Bootstrap (100% max width) -> 6 items */}
      <motion.div variants={item} className="w-full">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
          <SmallChip label="Connect Rate" value={formatPercent(data.connectRate)} shader={shaders} />
          <SmallChip label="Conv. Leads" value={formatPercent(data.conversaoLeads)} shader={shaders} />
          <SmallChip label="Conv. Clientes" value={formatPercent(data.conversaoClientes)} shader={shaders} />
          <SmallChip label="CPL (Lead)" value={formatCurrency(data.cpl)} shader={shaders} />
          <SmallChip label="CAC" value={formatCurrency(data.cac)} shader={shaders} />
          <SmallChip label="Top Produto" value={data.produtoMaisVendido} shader={shaders} isText />
        </div>
      </motion.div>
    </motion.div>
    </div>
  )
}

// No celular o Chip vira uma linha (rótulo à esquerda, valor à direita): os 6
// empilhados em formato de card ocupavam mais de uma tela de rolagem.
function Chip({
  label,
  value,
  shader,
  tone = "default",
  compact = false,
}: {
  label: string
  value: string
  shader: boolean
  tone?: "default" | "danger"
  /** Valor menor no desktop, para caber 6 chips numa linha. */
  compact?: boolean
}) {
  return (
    <div className={`relative flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-b from-primary/5 to-transparent px-4 py-3 shadow-sm backdrop-blur-sm transition-colors sm:flex-col sm:justify-center sm:gap-0 sm:rounded-3xl sm:text-center ${compact ? "sm:p-4" : "sm:p-6"}`}>
      {shader && <ShaderCard roundness="lg" />}
      <div className="pointer-events-none absolute -top-12 left-1/2 h-24 w-full max-w-[150px] -translate-x-1/2 rounded-full bg-primary/10 opacity-40 blur-2xl z-0" />
      <p className={`relative z-10 font-medium tracking-wide text-muted-foreground ${compact ? "text-sm sm:text-xs" : "text-sm"}`}>
        {label}
      </p>
      <p
        className={`relative z-10 min-w-0 max-w-full truncate font-mono text-xl font-semibold tracking-tight sm:mt-2 ${tone === "danger" ? "text-red-500" : "text-foreground"} ${compact ? "sm:text-xl xl:text-2xl" : "sm:text-3xl"}`}
      >
        {value}
      </p>
    </div>
  )
}

function SmallChip({
  label,
  value,
  shader,
  isText = false,
}: {
  label: string
  value: string
  shader: boolean
  isText?: boolean
}) {
  return (
    <div className="relative flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-b from-primary/5 to-transparent p-3 text-center shadow-sm backdrop-blur-sm transition-colors sm:p-4">
      {shader && <ShaderCard roundness="md" />}
      <p className="relative z-10 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 sm:text-xs">
        {label}
      </p>
      <p
        title={isText ? value : undefined}
        className={`relative z-10 mt-1 max-w-full truncate tracking-tight text-foreground ${isText ? "text-base font-medium sm:text-lg" : "font-mono text-lg font-semibold sm:text-xl"}`}
      >
        {value}
      </p>
    </div>
  )
}
