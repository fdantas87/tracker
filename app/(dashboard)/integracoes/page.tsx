import type { Metadata } from "next"
import Link from "next/link"
import { Bot, Plug, ShoppingBag, TriangleAlert, Webhook } from "lucide-react"

import { pageTitle } from "@/lib/branding"
import { getSettings, getStripeAccount, type StripeAccountRow } from "@/lib/settings/queries"
import {
  IntegrationCard,
  IntegrationSection,
} from "@/components/integrations/integration-card"
import { StripeCard } from "@/components/integrations/stripe-card"

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
export default async function IntegracoesPage() {
  const [stripe, settings] = await Promise.all([
    lerStripe(),
    getSettings().catch(() => null),
  ])

  const hasWebhookToken = settings?.hasWebhookToken ?? false

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

      <IntegrationSection
        title="Plataformas de vendas"
        description="De onde vêm as compras. Cada venda recebida é gravada, casada com a visita que a originou e enviada como Purchase para o Meta e para o GA4."
      >
        <StripeCard account={stripe.account} hasWebhookToken={hasWebhookToken} />

        <IntegrationCard
          name="PerfectPay"
          icon={ShoppingBag}
          status={hasWebhookToken ? "conectado" : "disponivel"}
          description="Recebe as compras pelo PostBack. Não tem credencial própria: a autenticação é o token de webhook do painel."
        >
          <div className="rounded-xl border bg-background/40 p-4">
            <p className="text-xs text-muted-foreground">
              {hasWebhookToken ? (
                <>
                  A URL e o token ficam em{" "}
                  <Link
                    href="/configuracoes"
                    className="font-medium text-primary hover:underline"
                  >
                    Configurações → Geral
                  </Link>
                  , onde o token também pode ser trocado. Ele é o mesmo para
                  todas as plataformas — trocá-lo exige recadastrar a URL em
                  cada uma.
                </>
              ) : (
                <>
                  Ainda não existe token de webhook neste painel. Gere um em{" "}
                  <Link
                    href="/configuracoes"
                    className="font-medium text-primary hover:underline"
                  >
                    Configurações → Geral
                  </Link>{" "}
                  para começar a receber compras.
                </>
              )}
            </p>
          </div>
        </IntegrationCard>
      </IntegrationSection>

      <IntegrationSection
        title="Próximas integrações"
        description="Ainda não construídas. Estão listadas para deixar claro o que esta tela vai reunir, e não para serem configuradas agora."
      >
        <IntegrationCard
          name="Webhooks livres"
          icon={Webhook}
          status="em-breve"
          description="Receber eventos de qualquer sistema, com mapeamento de campos configurável em vez de um adaptador em código."
        />
        <IntegrationCard
          name="Ferramentas de automação"
          icon={Plug}
          status="em-breve"
          description="Enviar visitantes, eventos e vendas para automações externas conforme eles acontecem."
        />
        <IntegrationCard
          name="MCP"
          icon={Bot}
          status="em-breve"
          description="Expor os dados do painel para agentes de IA consultarem direto, sem exportação manual."
        />
      </IntegrationSection>
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
