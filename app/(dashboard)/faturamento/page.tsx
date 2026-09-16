import { PageHeader, PhasePlaceholder } from "@/components/page-header"

export const metadata = {
  title: "Faturamento · Negou Tracking",
}

export default function FaturamentoPage() {
  return (
    <>
      <PageHeader
        title="Faturamento"
        description="Receita, ticket médio, reembolsos e a lista de compras."
      />
      <PhasePlaceholder phase="fase 8">
        Alimentado pelas compras que chegam no webhook do PerfectPay (fase 7).
      </PhasePlaceholder>
    </>
  )
}
