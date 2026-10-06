/**
 * POST /api/webhook/[platform]
 *
 * Endereço genérico do webhook de venda: `/api/webhook/bask`,
 * `/api/webhook/custom`, `/api/webhook/stripe`... É o mesmo handler de
 * `/api/webhook/compra/[platform]` — a lógica mora lá, e este arquivo só a
 * expõe num caminho sem a palavra "compra", que não faz sentido para eventos
 * de reembolso, cancelamento e disputa.
 *
 * O caminho antigo NÃO sai: URLs já cadastradas no PerfectPay e no Stripe
 * seguem funcionando. Os dois caminhos são equivalentes em tudo.
 */
export { POST } from "../compra/[platform]/route"

/** Mesma folga do handler original (fala com o Meta e o GA4 no `after()`). */
export const maxDuration = 60
