"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { BRAND_NAME } from "@/lib/branding"
import {
  Activity,
  Globe,
  LayoutDashboard,
  Megaphone,
  Plug,
  Settings,
  ShoppingCart,
  Users,
  CheckCircle2,
  XCircle,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const NAV_ITEMS = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/eventos", label: "Eventos", icon: Activity },
  { href: "/leads", label: "Visitantes", icon: Users },
  { href: "/vendas", label: "Vendas", icon: ShoppingCart },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/geo", label: "Geo", icon: Globe },
  { href: "/integracoes", label: "Integrações", icon: Plug },
  { href: "/pixels", label: "Pixels", icon: Settings },
] as const

export function DashboardSidebar({
  userEmail,
  brandName,
  dbHasError = false,
  dbErrors = [],
}: {
  userEmail: string
  /**
   * Nome da organização, definido no primeiro acesso e guardado no
   * `app_metadata` do usuário. Vem daí, e não de `NEXT_PUBLIC_BRAND_NAME`,
   * porque a variável é inlinada em tempo de build: corrigir o nome por ela
   * exigiria um novo deploy. Sem valor, cai para a variável.
   */
  brandName?: string
  dbHasError?: boolean
  dbErrors?: string[]
}) {
  const pathname = usePathname()
  const { setOpenMobile, isMobile } = useSidebar()

  // No celular a navegação é um drawer: fecha sozinho ao escolher um item.
  function handleNavigate() {
    if (isMobile) setOpenMobile(false)
  }

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-[72px] flex flex-row items-center justify-between px-4 py-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
        <Link
          href="/"
          onClick={handleNavigate}
          className="flex flex-col gap-0.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 group-data-[collapsible=icon]:hidden"
        >
          <span className="font-mono text-[0.65rem] tracking-[0.2em] text-primary uppercase">
            {brandName || BRAND_NAME}
          </span>
          <span className="text-sm font-semibold tracking-tight">Tracking</span>
        </Link>
        <SidebarTrigger />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Painel</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.label}
                    size="lg"
                  >
                    <Link href={item.href} onClick={handleNavigate}>
                      <item.icon />
                      <span className="truncate transition-all duration-300 ease-in-out group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
                        {item.label}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="flex flex-col items-start gap-3 p-3 group-data-[collapsible=icon]:items-center">
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="flex shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/20"
              title="Status de Conexão"
            >
              {!dbHasError ? (
                <div className="relative flex items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 opacity-75"></span>
                  <CheckCircle2 className="relative size-4 text-primary" />
                </div>
              ) : (
                <div className="relative flex items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/40 opacity-75"></span>
                  <XCircle className="relative size-4 text-destructive" />
                </div>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="right" className="w-80">
            <div className="flex flex-col gap-2">
              <h4 className="font-medium leading-none">
                {!dbHasError ? "Tudo OK" : "Problema Detectado"}
              </h4>
              <p className="text-sm text-muted-foreground">
                {!dbHasError
                  ? "As tabelas responderam com a sessão do usuário, passando por RLS. Estão vazias porque a captura de eventos ainda não foi construída."
                  : dbErrors.join(" · ")}
              </p>
            </div>
          </PopoverContent>
        </Popover>

        <p
          className="truncate font-mono text-xs text-muted-foreground group-data-[collapsible=icon]:hidden w-full text-left"
          title={userEmail}
        >
          {userEmail}
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
