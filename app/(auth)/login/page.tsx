import type { Metadata } from "next"
import { Info } from "lucide-react"

import { estadoDoSetup } from "@/lib/auth/setup"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ThemeToggle } from "@/components/theme-toggle"
import { LoginForm } from "./login-form"
import { SetupForm } from "./setup-form"
import { APP_NAME, BRAND_NAME, pageTitle } from "@/lib/branding"

export const metadata: Metadata = {
  title: pageTitle("Entrar"),
}

// Sem isto o Next pré-renderiza esta página no build — e a resposta "zero
// usuários" ficaria CONGELADA no output, fazendo o formulário de primeiro
// acesso aparecer para sempre num painel já configurado.
export const dynamic = "force-dynamic"

export default async function LoginPage() {
  // Só "vazio" abre o formulário de primeiro acesso. Erro de leitura cai em
  // "indisponivel" e mostra o login — falhar fechado é a regra aqui.
  const estado = await estadoDoSetup()
  const primeiroAcesso = estado === "vazio"

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-end p-4">
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">
              {BRAND_NAME}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {primeiroAcesso ? "Configurar pela primeira vez" : "Painel de tracking"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {primeiroAcesso
                ? "Ninguém tem acesso a este painel ainda. Crie a conta de administrador."
                : "Acesso restrito. Entre com sua conta."}
            </p>
          </div>

          {estado === "indisponivel" ? (
            <Alert className="mb-4" role="status">
              <Info />
              <AlertDescription>
                Não foi possível verificar a instalação. Se você acabou de
                implantar, confira a <code>SUPABASE_SERVICE_ROLE_KEY</code> nas
                variáveis do projeto.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="glass rounded-2xl p-6">
            {primeiroAcesso ? (
              <SetupForm defaultOrgName={BRAND_NAME || APP_NAME} />
            ) : (
              <LoginForm />
            )}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {primeiroAcesso
              ? "Esta tela some assim que a primeira conta existir."
              : "Não há cadastro público. Novas contas são criadas direto no Supabase."}
          </p>
        </div>
      </main>
    </div>
  )
}
