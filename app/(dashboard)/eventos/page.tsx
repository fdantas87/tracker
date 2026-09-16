import { PageHeader, PhasePlaceholder } from "@/components/page-header"

export const metadata = {
  title: "Eventos · Negou Tracking",
}

export default function EventosPage() {
  return (
    <>
      <PageHeader
        title="Eventos"
        description="Tabela filtrável de eventos capturados, com o payload e a resposta de cada destino."
      />
      <PhasePlaceholder phase="fase 8">
        A tabela de eventos e o modal com payload/resposta de Meta e GA4 entram
        aqui. Antes disso, as fases 5 e 6 constroem a captura e o disparo.
      </PhasePlaceholder>
    </>
  )
}
