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

  // Verificação de conexão com o banco (RLS)
  const [visitors, events, purchases] = await Promise.all([
    supabase.from("visitors").select("*", { count: "exact", head: true }),
    supabase.from("events_log").select("*", { count: "exact", head: true }),
    supabase.from("purchases").select("*", { count: "exact", head: true }),
  ])
  const dbHasError = Boolean(visitors.error || events.error || purchases.error)
  const dbErrors = [visitors, events, purchases].filter((r) => r.error).map((r) => r.error?.message)

  const email = user.email ?? "sem email"
  // Definido no primeiro acesso (`completeSetup`). Fica em `app_metadata`, e
  // não em `user_metadata`, porque o usuário reescreve o segundo sozinho com a
  // anon key — um nome de marca reescrevível viraria "por que o painel mudou
  // de nome?" sem rastro.
  const orgName =
    typeof user.app_metadata?.org_name === "string"
      ? user.app_metadata.org_name
      : undefined

  return (
    <SidebarProvider>
      <DashboardSidebar userEmail={email} brandName={orgName} dbHasError={dbHasError} dbErrors={dbErrors as string[]} />
      <SidebarInset>
        <TopbarHeader email={email} />
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
