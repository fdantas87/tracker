import type { Metadata } from "next"
import { TriangleAlert } from "lucide-react"

import { pageTitle } from "@/lib/branding"
import { getSettings, getStripeAccount, type StripeAccountRow } from "@/lib/settings/queries"
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
  const [stripe, settings] = await Promise.all([
    lerStripe(),
    getSettings().catch(() => null),
  ])

  const hasWebhookToken = settings?.hasWebhookToken ?? false
  const isStripeConfigured = Boolean(stripe.account?.hasSecretKey && stripe.account?.hasWebhookSecret)
  const isPerfectPayConfigured = hasWebhookToken

  return (
    <div className="flex flex-col gap-8">
      {stripe.erro ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber/40 bg-amber/5 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              Não foi possível ler a integração do Stripe
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Se este painel acabou de ser atualizado, a migration
              <code className="mx-1 font-mono">20260921130000_stripe_integration.sql</code>
              ainda não foi aplicada no banco. Rode-a no SQL Editor do Supabase e
              recarregue. Detalhe: {stripe.erro}
            </p>
          </div>
        </div>
      ) : null}

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
              <StripeCard account={stripe.account} hasWebhookToken={hasWebhookToken} />
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

          <PlatformManager stripeAccount={stripe.account} hasWebhookToken={hasWebhookToken} />


        </TabsContent>

        <TabsContent value="webhook" className="mt-4">
          <WebhookTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * A leitura do Stripe é isolada porque ela é a única que pode falhar por falta
 * de migration. Falhando, a tela INTEIRA não pode sumir: o card do PerfectPay
 * e o aviso do que fazer valem mais do que uma página de erro.
 */
async function lerStripe(): Promise<{
  account: StripeAccountRow | null
  erro: string | null
}> {
  try {
    return { account: await getStripeAccount(), erro: null }
  } catch (error) {
    return {
      account: null,
      erro: error instanceof Error ? error.message : "erro desconhecido",
    }
  }
}
