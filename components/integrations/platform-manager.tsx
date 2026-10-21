"use client"

import * as React from "react"
import { CreditCard, LoaderCircle, Pencil, Plus, ShoppingBag, Stethoscope } from "lucide-react"

import { setPlatformActive, toggleStripeActive } from "@/app/(dashboard)/integracoes/actions"
import { IDLE_STATE } from "@/lib/settings/action-state"
import type { PlataformaSemCredencial, PlatformStates } from "@/lib/settings/platforms"
import type { StripeAccountRow } from "@/lib/settings/queries"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { BaskDialog } from "./bask-dialog"
import { IntegrationCard, IntegrationSection } from "./integration-card"
import { PerfectPayDialog } from "./perfectpay-card"
import { StripeCard, StripeFormDialog } from "./stripe-card"

type Plataforma = PlataformaSemCredencial | "stripe"

const NOMES: Record<Plataforma, string> = {
  stripe: "Stripe",
  perfectpay: "PerfectPay",
  bask: "Bask",
}

const AVISO_DESATIVAR: Record<PlataformaSemCredencial, string> = {
  perfectpay:
    "As vendas da PerfectPay passam a ser ignoradas até você religar. A configuração e a URL cadastrada lá continuam valendo.",
  bask:
    "Os webhooks de pagamento da Bask passam a ser ignorados até você religar. Os eventos do questionário (Lead, InitiateCheckout, SubmitApplication) vêm da tag no GTM e continuam chegando enquanto ela estiver publicada: pause a tag lá para parar também.",
}

/**
 * Integrações → Plataformas: uma tag por plataforma, sempre visível. Apagada =
 * desativada neste projeto (clique para configurar e ativar); acesa = ativa,
 * com o botão de desligar. Desligar guarda a configuração e faz o webhook da
 * plataforma ser ignorado.
 */
export function PlatformManager({
  stripeAccount,
  hasWebhookToken,
  platformStates,
}: {
  stripeAccount: StripeAccountRow | null
  hasWebhookToken: boolean
  platformStates: PlatformStates
}) {
  const [aberto, setAberto] = React.useState<Plataforma | null>(null)
  const [desligar, setDesligar] = React.useState<PlataformaSemCredencial | null>(null)
  const [pending, startTransition] = React.useTransition()

  const stripeConfigurado = Boolean(stripeAccount?.hasSecretKey && stripeAccount?.hasWebhookSecret)
  const ativas: Record<Plataforma, boolean> = {
    stripe: stripeConfigurado && Boolean(stripeAccount?.isActive),
    ...platformStates,
  }
  const desativadas = (Object.keys(NOMES) as Plataforma[]).filter((p) => !ativas[p])

  function abrir(p: Plataforma) {
    if (p === "stripe" && stripeConfigurado) {
      const formData = new FormData()
      formData.set("next_active", "true")
      startTransition(async () => {
        await toggleStripeActive(IDLE_STATE, formData)
      })
      return
    }
    setAberto(p)
  }

  function definir(p: PlataformaSemCredencial, active: boolean, depois?: () => void) {
    startTransition(async () => {
      await setPlatformActive(p, active)
      depois?.()
    })
  }

  function botaoAtivar(p: PlataformaSemCredencial) {
    if (ativas[p]) return null
    return (
      <DialogFooter className="pt-2">
        <Button
          className="h-12 rounded-xl px-8"
          disabled={pending}
          onClick={() => definir(p, true, () => setAberto(null))}
        >
          {pending ? <LoaderCircle className="animate-spin size-4" /> : null}
          Ativar {NOMES[p]}
        </Button>
      </DialogFooter>
    )
  }

  function cardSemCredencial(p: PlataformaSemCredencial, icon: React.ComponentProps<typeof IntegrationCard>["icon"]) {
    const ativa = ativas[p]
    return (
      <IntegrationCard
        key={p}
        name={NOMES[p]}
        icon={icon}
        status="conectado"
        isActive={ativa}
        onOpen={ativa ? undefined : () => setAberto(p)}
        headerAction={
          <Switch
            checked={ativa}
            disabled={pending}
            onCheckedChange={(next) => (next ? definir(p, true) : setDesligar(p))}
            aria-label={ativa ? `Desativar ${NOMES[p]}` : `Ativar ${NOMES[p]}`}
            className="shrink-0 mt-2"
          />
        }
        actions={
          <Button variant="ghost" size="icon-sm" onClick={() => setAberto(p)} aria-label={`Configurar ${NOMES[p]}`}>
            <Pencil className="size-4 text-muted-foreground" />
          </Button>
        }
      />
    )
  }

  return (
    <>
      <IntegrationSection
        title="Plataformas de vendas"
        description="De onde vêm as compras. Só as plataformas ativas são ouvidas: cada venda recebida é gravada, casada com a visita que a originou e enviada como Purchase para o Meta e para o GA4."
      >
        {stripeConfigurado ? (
          <StripeCard account={stripeAccount} hasWebhookToken={hasWebhookToken} />
        ) : (
          <IntegrationCard
            name="Stripe"
            icon="/logos/stripe-icon.svg"
            status="conectado"
            isActive={false}
            onOpen={() => setAberto("stripe")}
          />
        )}
        {cardSemCredencial("perfectpay", "/logos/perfectpay-icon.png")}
        {cardSemCredencial("bask", Stethoscope)}
      </IntegrationSection>

      {desativadas.length > 0 ? (
        <div className="flex justify-center my-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="lg" className="h-14 rounded-2xl px-12 text-base font-medium shadow-sm">
                <Plus className="mr-2 size-5" />
                INTEGRAR PLATAFORMA
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-56 rounded-xl">
              {desativadas.map((p) => {
                const Icon = p === "stripe" ? CreditCard : p === "perfectpay" ? ShoppingBag : Stethoscope
                return (
                  <DropdownMenuItem key={p} onSelect={() => abrir(p)} className="gap-2 cursor-pointer h-10">
                    <Icon className="size-4" />
                    {NOMES[p]}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <StripeFormDialog
        open={aberto === "stripe"}
        onOpenChange={(open) => setAberto(open ? "stripe" : null)}
        account={stripeAccount}
        hasWebhookToken={hasWebhookToken}
      />
      <PerfectPayDialog
        open={aberto === "perfectpay"}
        onOpenChange={(open) => setAberto(open ? "perfectpay" : null)}
        footer={botaoAtivar("perfectpay")}
      />
      <BaskDialog
        open={aberto === "bask"}
        onOpenChange={(open) => setAberto(open ? "bask" : null)}
        hasWebhookToken={hasWebhookToken}
        footer={botaoAtivar("bask")}
      />

      <AlertDialog open={desligar !== null} onOpenChange={(open) => !open && setDesligar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar {desligar ? NOMES[desligar] : ""}?</AlertDialogTitle>
            <AlertDialogDescription>{desligar ? AVISO_DESATIVAR[desligar] : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => desligar && definir(desligar, false, () => setDesligar(null))}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
