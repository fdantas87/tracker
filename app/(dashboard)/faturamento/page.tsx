import { redirect } from "next/navigation"

/**
 * A tela de Faturamento virou a de Vendas (fase 8b).
 *
 * O redirect fica para não quebrar link salvo nem aba aberta de quem já usava
 * o caminho antigo — e porque ter duas rotas de receita, ainda que uma delas
 * fosse só um placeholder, era convite a dois números divergentes na mesma
 * tela.
 */
export default function FaturamentoPage() {
  redirect("/vendas")
}
