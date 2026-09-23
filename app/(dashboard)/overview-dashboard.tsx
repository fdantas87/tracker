"use client"

import { motion } from "framer-motion"
import { NeuroNoise } from "@paper-design/shaders-react"
import { ShaderCard } from "@/components/ui/shader-card"

export interface OverviewData {
  faturamento: number
  roas: number
  vendas: number
  cpa: number
  visitantes: number
  novosClientes: number
  ticketMedio: number
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
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  }

  // Formatadores
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
  const formatNumber = (value: number) => new Intl.NumberFormat("pt-BR").format(value)
  const formatPercent = (value: number) => `${value.toFixed(1)}%`

  return (
    <div className="relative">
      {/* NeuroNoise background — só na Visão Geral */}
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

    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="relative z-[1] flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center gap-6 py-4 lg:gap-8 lg:py-0"
    >
      {/* Camada 1: Faturamento */}
      <motion.div variants={item} className="relative flex flex-col items-center text-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 opacity-50 blur-[100px]" />
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground/80">
          Faturamento
        </p>
        <h1 className="relative mt-2 font-mono text-6xl font-semibold tracking-tighter text-foreground sm:text-8xl lg:text-[8rem]">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Chip label="Visitantes" value={formatNumber(data.visitantes)} />
          <Chip label="Novos Clientes" value={formatNumber(data.novosClientes)} />
          <Chip label="Ticket Médio" value={formatCurrency(data.ticketMedio)} />
        </div>
      </motion.div>

      {/* Camada 4: 8 Colunas Bootstrap (66% max width) -> 3 items */}
      <motion.div variants={item} className="w-full max-w-5xl">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Chip label="Por Visitante" value={formatCurrency(data.valorPorVisitante)} />
          <Chip label="Por Lead" value={formatCurrency(data.valorPorLead)} />
          <Chip label="Por Cliente" value={formatCurrency(data.valorPorCliente)} />
        </div>
      </motion.div>

      {/* Camada 5: 12 Colunas Bootstrap (100% max width) -> 6 items */}
      <motion.div variants={item} className="w-full">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <SmallChip label="Connect Rate" value={formatPercent(data.connectRate)} />
          <SmallChip label="Conv. Leads" value={formatPercent(data.conversaoLeads)} />
          <SmallChip label="Conv. Clientes" value={formatPercent(data.conversaoClientes)} />
          <SmallChip label="CPL (Lead)" value={formatCurrency(data.cpl)} />
          <SmallChip label="CAC" value={formatCurrency(data.cac)} />
          <SmallChip label="Top Produto" value={data.produtoMaisVendido} isText />
        </div>
      </motion.div>
    </motion.div>
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-b from-primary/5 to-transparent p-6 text-center shadow-sm backdrop-blur-sm transition-colors">
      <ShaderCard roundness="lg" />
      <div className="pointer-events-none absolute -top-12 left-1/2 h-24 w-full max-w-[150px] -translate-x-1/2 rounded-full bg-primary/10 opacity-40 blur-2xl z-0" />
      <p className="relative z-10 text-sm font-medium tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="relative z-10 mt-2 font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {value}
      </p>
    </div>
  )
}

function SmallChip({ label, value, isText = false }: { label: string; value: string; isText?: boolean }) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-b from-primary/5 to-transparent p-4 text-center shadow-sm backdrop-blur-sm transition-colors">
      <ShaderCard roundness="md" />
      <p className="relative z-10 text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
        {label}
      </p>
      <p className={`relative z-10 mt-1 tracking-tight text-foreground ${isText ? "text-lg font-medium" : "font-mono text-xl font-semibold"}`}>
        {value}
      </p>
    </div>
  )
}
