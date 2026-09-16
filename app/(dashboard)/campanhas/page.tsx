import { PageHeader, PhasePlaceholder } from "@/components/page-header"

export const metadata = {
  title: "Campanhas · Negou Tracking",
}

export default function CampanhasPage() {
  return (
    <>
      <PageHeader
        title="Campanhas"
        description="Investimento do Meta Ads cruzado com a receita por UTM, em árvore campanha → conjunto → anúncio."
      />
      <PhasePlaceholder phase="fase 9">
        ROAS e CPA por conta de anúncio, com cache e um limite de requisições
        conservador para não abusar da API do Meta.
      </PhasePlaceholder>
    </>
  )
}
