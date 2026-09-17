import { getQueueDepth, getSettings, listAccounts } from "@/lib/settings/queries"
import { PageHeader } from "@/components/page-header"
import { AccountsTab } from "@/components/settings/accounts-tab"
import { DispatchTab } from "@/components/settings/dispatch-tab"
import { GeneralTab } from "@/components/settings/general-tab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const metadata = {
  title: "Configurações · Negou Tracking",
}

export default async function ConfiguracoesPage() {
  // Leituras via service_role (as tabelas de credencial não têm policy de
  // SELECT). A página só renderiza atrás do layout autenticado, que valida a
  // sessão antes — e cada Server Action revalida por conta própria.
  const [settings, pixels, ga4Accounts, adAccounts, queue] = await Promise.all([
    getSettings(),
    listAccounts("pixel"),
    listAccounts("ga4"),
    listAccounts("adaccount"),
    getQueueDepth(),
  ])

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Destinos de envio e credenciais. Os segredos são gravados cifrados no Vault e nunca voltam para a tela."
      />

      <Tabs defaultValue="geral" className="gap-4">
        <TabsList className="w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="disparo">Disparo</TabsTrigger>
          <TabsTrigger value="pixel">
            Pixels
            {pixels.length > 0 ? (
              <span className="ml-1 font-mono text-xs tabular-nums opacity-70">
                {pixels.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="ga4">
            GA4
            {ga4Accounts.length > 0 ? (
              <span className="ml-1 font-mono text-xs tabular-nums opacity-70">
                {ga4Accounts.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="adaccount">
            Anúncios
            {adAccounts.length > 0 ? (
              <span className="ml-1 font-mono text-xs tabular-nums opacity-70">
                {adAccounts.length}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral">
          <GeneralTab settings={settings} />
        </TabsContent>
        <TabsContent value="disparo">
          <DispatchTab settings={settings} queue={queue} />
        </TabsContent>
        <TabsContent value="pixel">
          <AccountsTab kind="pixel" accounts={pixels} />
        </TabsContent>
        <TabsContent value="ga4">
          <AccountsTab kind="ga4" accounts={ga4Accounts} />
        </TabsContent>
        <TabsContent value="adaccount">
          <AccountsTab kind="adaccount" accounts={adAccounts} />
        </TabsContent>
      </Tabs>
    </>
  )
}
