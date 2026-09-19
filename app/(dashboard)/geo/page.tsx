import { PageHeader, PhasePlaceholder } from "@/components/page-header"
import { pageTitle } from "@/lib/branding"

export const metadata = {
  title: pageTitle("Geo"),
}

export default function GeoPage() {
  return (
    <>
      <PageHeader
        title="Geo"
        description="Distribuição de visitantes e compras por região."
      />
      <PhasePlaceholder phase="fase 8">
        Mapa por estado/país, a partir do geo derivado do IP na captura
        (fase 5).
      </PhasePlaceholder>
    </>
  )
}
