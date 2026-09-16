import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserMenu } from "@/components/user-menu"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

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
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu email={email} />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
