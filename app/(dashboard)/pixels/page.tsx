import { getSettings, listAccounts } from "@/lib/settings/queries"
import { PageHeader } from "@/components/page-header"
import { DestinationsView } from "@/components/settings/destinations-view"
import { pageTitle } from "@/lib/branding"

export const metadata = {
  title: pageTitle("Pixels"),
}

export default async function PixelsPage() {
  const [settings, pixels, ga4Accounts, adAccounts] = await Promise.all([
    getSettings(),
    listAccounts("pixel"),
    listAccounts("ga4"),
    listAccounts("adaccount"),
  ])

  return (
    <>
      <PageHeader
        title="Pixels"
        description="Destinos de envio e credenciais. Os segredos são gravados cifrados no Vault e nunca voltam para a tela."
      />

      <DestinationsView 
        pixels={pixels} 
        ga4Accounts={ga4Accounts} 
        adAccounts={adAccounts} 
      />
    </>
  )
}
