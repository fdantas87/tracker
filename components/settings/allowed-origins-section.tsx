"use client"

import * as React from "react"
import { useActionState } from "react"
import { Globe, LoaderCircle, Save, X, Plus } from "lucide-react"

import { saveAllowedOrigins } from "@/app/(dashboard)/pixels/actions"
import { IDLE_STATE, type ActionState } from "@/lib/settings/action-state"
import type { SettingsRow } from "@/lib/settings/queries"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function AllowedOriginsSection({
  settings,
}: {
  settings: SettingsRow
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveAllowedOrigins,
    IDLE_STATE
  )
  
  const [domains, setDomains] = React.useState<string[]>(settings.allowedOrigins)
  const [inputValue, setInputValue] = React.useState("")

  function addDomain() {
    const val = inputValue.trim()
    if (val && !domains.includes(val)) {
      setDomains([...domains, val])
      setInputValue("")
    }
  }

  function removeDomain(domainToRemove: string) {
    setDomains(domains.filter(d => d !== domainToRemove))
  }

  return (
    <form action={formAction} className="relative flex flex-col items-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-6 text-center sm:p-8 shadow-sm min-h-[380px]">
      {/* Decorative background glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-full max-w-md -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-3xl" />

      <div className="relative z-10 flex w-full flex-col items-center gap-6 flex-1">
        <div className="flex flex-col items-center gap-2">
          <Globe className="size-6 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight">Domínios autorizados</h2>
          <p className="text-[13px] text-muted-foreground text-balance min-h-[40px]">
            Todo site que carrega o <code className="font-mono text-xs">track.js</code> precisa estar aqui. Adicione sem barra final.
          </p>
        </div>

        <div className="flex w-full flex-col gap-4">
          <div className="relative flex w-full items-center justify-center">
            <input type="hidden" name="allowed_origins" value={domains.join("\n")} />
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addDomain()
                }
              }}
              placeholder="https://exemplo.com"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
              className="relative z-10 w-full h-14 rounded-2xl border-primary/20 bg-background/80 px-5 text-center font-mono text-[13px] shadow-sm backdrop-blur transition-colors focus-visible:border-primary/40 focus-visible:ring-0"
            />
            <Button 
              type="button" 
              variant="secondary" 
              onClick={addDomain}
              className="absolute right-2 z-20 h-10 rounded-xl px-4 shadow-sm"
            >
              <Plus className="size-4" />
              <span className="sr-only sm:ml-2 sm:not-sr-only">Add</span>
            </Button>
          </div>

          <Button type="submit" className="w-full gap-2 h-12 rounded-xl" disabled={isPending}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar
          </Button>

          {state.message && (
            <span className={state.ok ? "text-xs font-medium text-primary" : "text-xs font-medium text-destructive"}>
              {state.message}
            </span>
          )}

          {domains.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2 mt-2">
              {domains.map((domain) => (
                <div
                  key={domain}
                  className="flex items-center gap-2 rounded-xl border border-primary/20 bg-background/50 px-3 py-1.5 font-mono text-[13px] shadow-sm backdrop-blur transition-colors hover:border-primary/40"
                >
                  <span>{domain}</span>
                  <button
                    type="button"
                    onClick={() => removeDomain(domain)}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={`Remover ${domain}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </form>
  )
}
