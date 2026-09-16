import { PageHeader, PhasePlaceholder } from "@/components/page-header"

export const metadata = {
  title: "Configurações · Negou Tracking",
}

export default function ConfiguracoesPage() {
  return (
    <>
      <PageHeader
        title="Configurações"
        description="Pixels do Meta, propriedades do GA4, contas de anúncio e o token do webhook."
      />
      <PhasePlaceholder phase="fase 4">
        Aqui você vai cadastrar, editar e remover cada conta (com os segredos
        mascarados e guardados cifrados no Vault), além de testar a conexão de
        cada destino. É nesta tela que os valores dos arquivos em
        .credenciais-locais entram no sistema.
      </PhasePlaceholder>
    </>
  )
}
