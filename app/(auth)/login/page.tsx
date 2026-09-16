import type { Metadata } from "next"

import { ThemeToggle } from "@/components/theme-toggle"
import { LoginForm } from "./login-form"

export const metadata: Metadata = {
  title: "Entrar · Negou Tracking",
}

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-end p-4">
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">
              Negou
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Painel de tracking
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Acesso restrito. Entre com sua conta.
            </p>
          </div>

          <div className="glass rounded-2xl p-6">
            <LoginForm />
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Não há cadastro público. Novas contas são criadas direto no
            Supabase.
          </p>
        </div>
      </main>
    </div>
  )
}
