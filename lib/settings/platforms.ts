/**
 * Plataformas de venda que aparecem como tag em Integrações → Plataformas.
 *
 * Sem `server-only`: a lista é importada pelos Client Components da tela.
 * PerfectPay e Bask guardam o estado em `platform_integrations`; o Stripe, em
 * `stripe_accounts.is_active`, ao lado das credenciais.
 */
export const PLATAFORMAS_SEM_CREDENCIAL = ["perfectpay", "bask"] as const

export type PlataformaSemCredencial = (typeof PLATAFORMAS_SEM_CREDENCIAL)[number]

export type PlatformStates = Record<PlataformaSemCredencial, boolean>

export function isPlataformaSemCredencial(value: string): value is PlataformaSemCredencial {
  return (PLATAFORMAS_SEM_CREDENCIAL as readonly string[]).includes(value)
}
