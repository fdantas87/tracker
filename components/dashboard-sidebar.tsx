"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  Globe,
  LayoutDashboard,
  Megaphone,
  Receipt,
  Settings,
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
  useSidebar,
} from "@/components/ui/sidebar"

const NAV_ITEMS = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/eventos", label: "Eventos", icon: Activity },
  { href: "/faturamento", label: "Faturamento", icon: Receipt },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/geo", label: "Geo", icon: Globe },
] as const

export function DashboardSidebar({ userEmail }: { userEmail: string }) {
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
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-4 py-4">
        <Link
          href="/"
          onClick={handleNavigate}
          className="flex flex-col gap-0.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="font-mono text-[0.65rem] tracking-[0.2em] text-primary uppercase">
            Negou
          </span>
          <span className="text-sm font-semibold tracking-tight">Tracking</span>
        </Link>
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
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive("/configuracoes")}
              tooltip="Configurações"
              size="lg"
            >
              <Link href="/configuracoes" onClick={handleNavigate}>
                <Settings />
                <span>Configurações</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <p
          className="truncate px-2 pt-2 pb-1 font-mono text-xs text-muted-foreground"
          title={userEmail}
        >
          {userEmail}
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
