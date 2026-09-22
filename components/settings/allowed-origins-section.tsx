"use client"

import { useActionState } from "react"
import { Globe, LoaderCircle, Save } from "lucide-react"

import { saveAllowedOrigins } from "@/app/(dashboard)/configuracoes/actions"
import { IDLE_STATE, type ActionState } from "@/lib/settings/action-state"
import type { SettingsRow } from "@/lib/settings/queries"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function AllowedOriginsSection({
  settings,
}: {
  settings: SettingsRow
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveAllowedOrigins,
    IDLE_STATE
  )

  return (
    <form action={formAction} className="glass flex flex-col gap-4 rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <Globe className="size-5 text-primary" />
        <h2 className="text-base font-medium">Domínios liberados para captura</h2>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">
        Todo site que carrega o <code className="font-mono">track.js</code> precisa estar aqui —
        sem isso o navegador bloqueia a captura inteira, silenciosamente. Um domínio por linha,
        com <code className="font-mono text-xs">https://</code> e sem barra final. Subdomínio não
        herda — liste cada um.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="allowed_origins">Origens</Label>
        <Textarea
          id="allowed_origins"
          name="allowed_origins"
          defaultValue={settings.allowedOrigins.join("\n")}
          placeholder={"https://www.exemplo.com\nhttps://checkout.exemplo.com"}
          rows={6}
          className="font-mono text-sm"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Soma-se à variável <code className="font-mono">TRACKING_ALLOWED_ORIGINS</code> da Vercel
        — não a substitui. Efeito em até 60s, sem novo deploy.
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
          Salvar
        </Button>
        {state.message ? (
          <span
            className={
              state.ok ? "text-sm text-primary" : "text-sm text-destructive"
            }
          >
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  )
}
