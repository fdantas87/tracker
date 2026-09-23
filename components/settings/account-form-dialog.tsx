"use client"

import * as React from "react"
import { useActionState } from "react"
import { LoaderCircle, ChevronLeft, Globe } from "lucide-react"
import { SiMeta, SiGoogleanalytics, SiGoogleads, SiTiktok, SiPinterest } from "react-icons/si"

import { saveAccount } from "@/app/(dashboard)/pixels/actions"
import { IDLE_STATE, type ActionState } from "@/lib/settings/action-state"
import { ACCOUNT_CONFIG, type AccountKind } from "@/lib/settings/config"
import type { AccountRow } from "@/lib/settings/queries"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type PlatformOption = {
  id: string
  name: string
  icon: React.ReactNode
  available: boolean
  kind?: AccountKind
}

const PLATFORMS: PlatformOption[] = [
  { id: "meta", name: "Meta Pixel", icon: <SiMeta className="size-6 text-[#0668E1]" />, available: true, kind: "pixel" },
  { id: "ga4", name: "Google Analytics 4", icon: <SiGoogleanalytics className="size-6 text-[#E37400]" />, available: true, kind: "ga4" },
  { id: "ads", name: "Contas de Anúncio", icon: <SiGoogleads className="size-6 text-[#F4B400]" />, available: true, kind: "adaccount" },
  { id: "tiktok", name: "TikTok Pixel", icon: <SiTiktok className="size-6 text-foreground" />, available: false },
  { id: "pinterest", name: "Pinterest Tag", icon: <SiPinterest className="size-6 text-[#E60023]" />, available: false },
  { id: "taboola", name: "Taboola Pixel", icon: <Globe className="size-6 text-[#0B4075] dark:text-[#3775b8]" />, available: false },
]

export function AccountFormDialog({
  initialKind,
  account,
  open,
  onOpenChange,
}: {
  initialKind?: AccountKind
  account?: AccountRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEditing = Boolean(account)
  
  // Se está editando, ou se já passou a origin (futuramente), pula direto pro formulário
  const defaultStep = isEditing || initialKind ? "form" : "select"
  
  const [step, setStep] = React.useState<"select" | "form">(defaultStep)
  const [selectedKind, setSelectedKind] = React.useState<AccountKind | undefined>(initialKind)

  // Reseta estado sempre que reabrir, se necessário
  React.useEffect(() => {
    if (open) {
      setStep(isEditing || initialKind ? "form" : "select")
      setSelectedKind(initialKind)
    }
  }, [open, isEditing, initialKind])

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveAccount,
    IDLE_STATE
  )

  React.useEffect(() => {
    if (state.ok) onOpenChange(false)
  }, [state.ok, onOpenChange])

  function handleSelectPlatform(platform: PlatformOption) {
    if (!platform.available || !platform.kind) return
    setSelectedKind(platform.kind)
    setStep("form")
  }

  const config = selectedKind ? ACCOUNT_CONFIG[selectedKind] : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("transition-all duration-300", step === "select" ? "sm:max-w-2xl" : "sm:max-w-md")}>
        {step === "select" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">Adicionar Destino</DialogTitle>
              <DialogDescription>
                Selecione a plataforma para a qual os eventos serão enviados.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 mt-2 sm:grid-cols-3">
              {PLATFORMS.map((plat) => (
                <button
                  key={plat.id}
                  type="button"
                  onClick={() => handleSelectPlatform(plat)}
                  disabled={!plat.available}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-4 rounded-2xl border p-6 text-center transition-all",
                    plat.available 
                      ? "hover:border-primary/40 hover:bg-muted/50 cursor-pointer shadow-sm" 
                      : "opacity-60 cursor-not-allowed bg-muted/20 grayscale"
                  )}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm border border-border/50">
                    {plat.icon}
                  </div>
                  <span className="text-sm font-medium">{plat.name}</span>
                  {!plat.available && (
                    <Badge variant="secondary" className="absolute top-3 right-3 text-[10px] px-1.5 py-0">
                      Em breve
                    </Badge>
                  )}
                </button>
              ))}
            </div>
            
            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 -ml-2 mb-2">
                {!isEditing && !initialKind && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setStep("select")} className="text-muted-foreground h-8 w-8">
                    <ChevronLeft className="size-4" />
                  </Button>
                )}
                <DialogTitle>
                  {isEditing ? "Editar" : "Adicionar"} {config?.singular}
                </DialogTitle>
              </div>
              <DialogDescription>{config?.description}</DialogDescription>
            </DialogHeader>

            {config && (
              <form action={formAction} className="flex flex-col gap-4 mt-2">
                <input type="hidden" name="kind" value={selectedKind} />
                {account ? (
                  <input type="hidden" name="id" value={account.id} />
                ) : null}

                <div className="flex flex-col gap-2">
                  <Label htmlFor="label">Nome</Label>
                  <Input
                    id="label"
                    name="label"
                    defaultValue={account?.label ?? ""}
                    placeholder="Ex.: Conta principal"
                    required
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Só para você identificar na lista.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="public_id">{config.publicIdLabel}</Label>
                  <Input
                    id="public_id"
                    name="public_id"
                    defaultValue={account?.publicId ?? ""}
                    placeholder={config.publicIdPlaceholder}
                    required
                    className="h-10 font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    {config.publicIdHint}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="secret">{config.secretLabel}</Label>
                  <Input
                    id="secret"
                    name="secret"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      isEditing ? "Deixe em branco para manter o atual" : "Cole aqui"
                    }
                    required={!isEditing}
                    className="h-10 font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    {isEditing
                      ? "O valor salvo não pode ser consultado — preencha só se for substituir."
                      : config.secretHint}
                  </p>
                </div>

                {state.message && !state.ok ? (
                  <p className="text-sm text-destructive">{state.message}</p>
                ) : null}

                <DialogFooter className="mt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? <LoaderCircle className="animate-spin mr-2 size-4" /> : null}
                    {isEditing ? "Salvar" : "Adicionar"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
