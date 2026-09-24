"use client"

import * as React from "react"
import { Plus, CreditCard, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { StripeFormDialog } from "./stripe-card"
import type { StripeAccountRow } from "@/lib/settings/queries"

export function PlatformManager({ 
  stripeAccount, 
  hasWebhookToken 
}: { 
  stripeAccount: StripeAccountRow | null
  hasWebhookToken: boolean 
}) {
  const [stripeOpen, setStripeOpen] = React.useState(false)
  const isStripeConfigured = Boolean(stripeAccount?.hasSecretKey && stripeAccount?.hasWebhookSecret)

  return (
    <div className="flex justify-center my-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="lg" className="h-14 rounded-2xl px-12 text-base font-medium shadow-sm">
            <Plus className="mr-2 size-5" />
            INTEGRAR PLATAFORMA
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-56 rounded-xl">
          {!isStripeConfigured && (
            <DropdownMenuItem onSelect={() => setStripeOpen(true)} className="gap-2 cursor-pointer h-10">
              <CreditCard className="size-4" />
              Stripe
            </DropdownMenuItem>
          )}
          {!hasWebhookToken && (
            <DropdownMenuItem disabled className="gap-2 h-10">
              <ShoppingBag className="size-4" />
              PerfectPay (Gere token no Webhook)
            </DropdownMenuItem>
          )}
          {isStripeConfigured && hasWebhookToken && (
            <DropdownMenuItem disabled className="h-10 text-center justify-center">
              Todas configuradas
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <StripeFormDialog 
        open={stripeOpen} 
        onOpenChange={setStripeOpen} 
        account={stripeAccount} 
        hasWebhookToken={hasWebhookToken}
      />
    </div>
  )
}
