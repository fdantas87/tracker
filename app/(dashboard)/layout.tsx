import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserMenu } from "@/components/user-menu"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { TopbarHeader } from "@/components/dashboard/topbar-header"

export default async function DashboardLayout({
  children,
}: LayoutProps<"/">) {
  // Segunda barreira, de propósito: o proxy.ts já redireciona quem não tem
  // sessão, mas a documentação do Next.js é explícita que o proxy é uma
  // checagem otimista e não deve ser a única autorização. Aqui a verificação
  // é contra o servidor de Auth, antes de renderizar qualquer dado.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const email = user.email ?? "sem email"

  return (
    <SidebarProvider>
      <DashboardSidebar userEmail={email} />
      <SidebarInset>
        <TopbarHeader email={email} />
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
