"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

import { BRAND_NAME } from "@/lib/branding"
import { useIsTabletRange } from "@/hooks/use-tablet-range"
import {
  Activity,
  Globe,
  LayoutDashboard,
  Plug,
  Settings,
  ShoppingCart,
  Users,
  CheckCircle2,
  TriangleAlert,
  XCircle,
} from "lucide-react"

import type { HealthIssue, HealthLevel } from "@/lib/health/types"

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
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const NAV_ITEMS = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/eventos", label: "Eventos", icon: Activity },
  { href: "/leads", label: "Visitantes", icon: Users },
  { href: "/vendas", label: "Vendas", icon: ShoppingCart },
  { href: "/geo", label: "Geo", icon: Globe },
  { href: "/integracoes", label: "Integrações", icon: Plug },
  { href: "/pixels", label: "Pixels", icon: Settings },
] as const

const HEALTH_VIEW = {
  ok: { icon: CheckCircle2, color: "text-primary", ring: "bg-primary/40", title: "Tudo OK" },
  warn: { icon: TriangleAlert, color: "text-amber", ring: "bg-amber/40", title: "Atenção" },
  error: { icon: XCircle, color: "text-destructive", ring: "bg-destructive/40", title: "Problema detectado" },
} as const

export function DashboardSidebar({
  userEmail,
  brandName,
  healthLevel = "ok",
  healthIssues = [],
  hasStoredPreference = false,
}: {
  userEmail: string
  /**
   * Nome da organização, definido no primeiro acesso e guardado no
   * `app_metadata` do usuário. Vem daí, e não de `NEXT_PUBLIC_BRAND_NAME`,
   * porque a variável é inlinada em tempo de build: corrigir o nome por ela
   * exigiria um novo deploy. Sem valor, cai para a variável.
   */
  brandName?: string
  healthLevel?: HealthLevel
  healthIssues?: HealthIssue[]
  /**
   * Flag do servidor indicando se já existe uma preferência de sidebar salva
   * em cookie. Usado para decidir se o auto-colapso em tablet deve ser aplicado.
   */
  hasStoredPreference?: boolean
}) {
  const pathname = usePathname()
  const health = HEALTH_VIEW[healthLevel]
  const HealthIcon = health.icon
  const { setOpenMobile, isMobile, open, setOpen } = useSidebar()
  const isTabletRange = useIsTabletRange()
  const hasAutoCollapsedRef = useRef(false)

  // Auto-colapso de tablet na primeira visita (sem cookie salvo).
  // Roda uma única vez no mount, nunca de novo em resize.
  useEffect(() => {
    if (
      !hasAutoCollapsedRef.current &&
      !hasStoredPreference &&
      isTabletRange &&
      open === true
    ) {
      hasAutoCollapsedRef.current = true
      setOpen(false)
    }
  }, [hasStoredPreference, isTabletRange, open, setOpen])

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
              title="Status de funcionamento"
              aria-label={`Status de funcionamento: ${health.title}`}
            >
              <div className="relative flex items-center justify-center">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${health.ring}`}></span>
                <HealthIcon className={`relative size-4 ${health.color}`} />
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="right" className="w-80">
            <div className="flex flex-col gap-3">
              <h4 className="font-medium leading-none">{health.title}</h4>
              {healthIssues.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  O banco respondeu com a sessão do usuário, passando por RLS.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {healthIssues.map((issue) => {
                    const view = HEALTH_VIEW[issue.level]
                    const IssueIcon = view.icon
                    return (
                      <li key={issue.title} className="flex items-start gap-2">
                        <IssueIcon className={`mt-0.5 size-4 shrink-0 ${view.color}`} aria-hidden />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{issue.title}</p>
                          <p className="mt-0.5 break-words text-xs text-muted-foreground">
                            {issue.message}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
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

      <SidebarRail />
    </Sidebar>
  )
}
