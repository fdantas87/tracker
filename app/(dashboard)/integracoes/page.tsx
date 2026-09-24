import type { Metadata } from "next"

import { pageTitle } from "@/lib/branding"
import { getSettings, getStripeAccount } from "@/lib/settings/queries"
import {
  IntegrationCard,
  IntegrationSection,
} from "@/components/integrations/integration-card"
import { StripeCard } from "@/components/integrations/stripe-card"
import { WebhookTab } from "@/components/integrations/webhook-tab"
import { SiteTab } from "@/components/integrations/site-tab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlatformManager } from "@/components/integrations/platform-manager"
import { PerfectPayCard } from "@/components/integrations/perfectpay-card"
import { Button } from "@/components/ui/button"
import { Pencil } from "lucide-react"

export const metadata: Metadata = {
  title: pageTitle("Integrações"),
}

/**
 * Integrações.
 *
 * Aqui ficam as plataformas que falam COM o tracker (plataforma de venda,
 * webhook, automação), enquanto Configurações cuida dos destinos para onde o
 * tracker manda evento (Meta, GA4). São direções opostas do mesmo fluxo, e
 * misturá-las numa tela só foi o que motivou esta separação.
 */
export default async function IntegrationsPage() {
  // Falha na leitura do Stripe vira "não conectado" aqui; o diagnóstico vai pro ícone de status.
  const [stripeAccount, settings] = await Promise.all([
    getStripeAccount().catch(() => null),
    getSettings().catch(() => null),
  ])

  const hasWebhookToken = settings?.hasWebhookToken ?? false
  const isStripeConfigured = Boolean(stripeAccount?.hasSecretKey && stripeAccount?.hasWebhookSecret)
  const isPerfectPayConfigured = hasWebhookToken

  return (
    <div className="flex flex-col gap-8">
      <Tabs defaultValue="site" className="gap-4">
        <TabsList className="w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="site">Site</TabsTrigger>
          <TabsTrigger value="plataformas">Plataformas</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
        </TabsList>

        <TabsContent value="site" className="mt-4">
          <SiteTab settings={settings} />
        </TabsContent>

        <TabsContent value="plataformas" className="mt-4 flex flex-col gap-8">
          <IntegrationSection
            title="Plataformas de vendas"
            description="De onde vêm as compras. Cada venda recebida é gravada, casada com a visita que a originou e enviada como Purchase para o Meta e para o GA4."
          >
            {isStripeConfigured && (
              <StripeCard account={stripeAccount} hasWebhookToken={hasWebhookToken} />
            )}

            {isPerfectPayConfigured && (
              <PerfectPayCard />
            )}

            {!isStripeConfigured && !isPerfectPayConfigured && (
              <div className="col-span-full flex flex-col items-center justify-center p-12 text-center rounded-3xl border border-dashed border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
                <p className="text-muted-foreground text-sm">Nenhuma plataforma configurada.</p>
              </div>
            )}
          </IntegrationSection>

          <PlatformManager stripeAccount={stripeAccount} hasWebhookToken={hasWebhookToken} />


        </TabsContent>

        <TabsContent value="webhook" className="mt-4">
          <WebhookTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
