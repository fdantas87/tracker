"use client"

import { useActionState } from "react"
import { AlertCircle, LoaderCircle } from "lucide-react"

import { completeSetup, type SetupState } from "@/lib/auth/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Mora aqui, e não em @/lib/auth/actions, porque um arquivo "use server" só
// pode exportar função assíncrona — mesmo motivo de lib/settings/action-state.ts
// existir. Como este valor não é compartilhado com ninguém, não precisa de
// módulo próprio (é o que login-form.tsx já faz com o dele).
const initialState: SetupState = { error: null }

export function SetupForm({ defaultOrgName }: { defaultOrgName: string }) {
  const [state, formAction, isPending] = useActionState(
    completeSetup,
    initialState
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="org_name">Nome da organização</Label>
        <Input
          id="org_name"
          name="org_name"
          type="text"
          autoComplete="organization"
          autoFocus
          required
          maxLength={60}
          defaultValue={defaultOrgName}
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">
          Aparece no cabeçalho do painel. Dá para corrigir aqui sem refazer o
          deploy.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@exemplo.com"
          className="h-11"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          // `new-password`, nunca `current-password`: senão o gerenciador de
          // senhas oferece a senha de OUTRO painel neste campo.
          autoComplete="new-password"
          required
          minLength={10}
          aria-describedby="password-hint"
          placeholder="••••••••••"
          className="h-11"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          Mínimo de 10 caracteres.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password_confirm">Confirmar senha</Label>
        <Input
          id="password_confirm"
          name="password_confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          placeholder="••••••••••"
          className="h-11"
        />
      </div>

      {state.error ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="mt-2 h-11" disabled={isPending}>
        {isPending ? (
          <>
            <LoaderCircle className="animate-spin" />
            Criando conta...
          </>
        ) : (
          "Criar conta e entrar"
        )}
      </Button>
    </form>
  )
}
