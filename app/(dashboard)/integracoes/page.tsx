import type { Metadata } from "next"

import { pageTitle } from "@/lib/branding"
import { DesktopOnly } from "@/components/desktop-only"
import { getPlatformStates, getSettings, getStripeAccount } from "@/lib/settings/queries"
import { WebhookTab } from "@/components/integrations/webhook-tab"
import { SiteTab } from "@/components/integrations/site-tab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlatformManager } from "@/components/integrations/platform-manager"

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
  const [stripeAccount, settings, platformStates] = await Promise.all([
    getStripeAccount().catch(() => null),
    getSettings().catch(() => null),
    getPlatformStates(),
  ])

  const hasWebhookToken = settings?.hasWebhookToken ?? false

  return (
    <DesktopOnly acao="configurar integrações">
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
            <PlatformManager
              stripeAccount={stripeAccount}
              hasWebhookToken={hasWebhookToken}
              platformStates={platformStates}
            />

          </TabsContent>

          <TabsContent value="webhook" className="mt-4">
            <WebhookTab />
          </TabsContent>
        </Tabs>
      </div>
    </DesktopOnly>
  )
}
