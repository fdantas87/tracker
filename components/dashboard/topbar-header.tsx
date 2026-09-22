"use client"

import { usePathname } from "next/navigation"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserMenu } from "@/components/user-menu"
import { TopbarPeriodSelector } from "@/components/dashboard/topbar-period-selector"

const META = {
  "/": {
    title: "Visão geral",
    description: "Funil, conversão e volume de eventos aparecem aqui quando a captura estiver ligada.",
  },
  "/eventos": {
    title: "Eventos",
    description: "Tudo que foi capturado e o que aconteceu com cada envio para a Conversions API.",
  },
  "/leads": {
    title: "Leads",
    description: "Todo visitante que já passou pelo track.js, identificado ou não — e a ficha completa de cada um.",
  },
  "/vendas": {
    title: "Análise de Vendas",
    description: "Faturamento, reembolsos e formas de pagamento — direto das compras que chegaram pelo webhook.",
  },
  "/campanhas": {
    title: "Campanhas",
    description: "Desempenho das campanhas de anúncios.",
  },
  "/geo": {
    title: "Geolocalização",
    description: "De onde vêm os seus visitantes.",
  },
  "/integracoes": {
    title: "Integrações",
    description:
      "Plataformas de venda, webhooks e automações conectadas ao tracker.",
  },
  "/configuracoes": {
    title: "Configurações",
    description: "Ajustes do painel e conta.",
  },
}

export function TopbarHeader({ email }: { email: string }) {
  const pathname = usePathname()
  // Trata rotas filhas também se precisar, mas no momento é match direto
  const info = META[pathname as keyof typeof META]

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-md">
      <SidebarTrigger className="-ml-1" />

      {info && (
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            {info.title}
          </h1>
          {info.description && (
            <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
              {info.description}
            </p>
          )}
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <TopbarPeriodSelector />
        <div className="h-4 w-px shrink-0 bg-border hidden sm:block mx-1" aria-hidden />
        <ThemeToggle />
        <UserMenu email={email} />
      </div>
    </header>
  )
}
