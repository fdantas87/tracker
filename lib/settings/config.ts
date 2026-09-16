/**
 * Descrição dos 3 tipos de conta de destino.
 *
 * As três tabelas têm a mesma forma (label + um ID público + um segredo no
 * Vault), então tudo — validação, CRUD e UI — é escrito uma vez e
 * parametrizado por este objeto. Nada aqui é sigiloso: são nomes de tabela,
 * rótulos e formatos de ID, seguros de mandar pro navegador.
 */

export const ACCOUNT_KINDS = ["pixel", "ga4", "adaccount"] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export type AccountKindConfig = {
  table: string
  publicIdColumn: string
  vaultColumn: string
  /** Precisa bater exatamente: estes IDs vão interpolados em URL de API. */
  publicIdPattern: RegExp
  title: string
  singular: string
  description: string
  publicIdLabel: string
  publicIdPlaceholder: string
  publicIdHint: string
  secretLabel: string
  secretHint: string
}

export const ACCOUNT_CONFIG: Record<AccountKind, AccountKindConfig> = {
  pixel: {
    table: "meta_pixels",
    publicIdColumn: "pixel_id",
    vaultColumn: "capi_token_vault_id",
    publicIdPattern: /^[0-9]+$/,
    title: "Pixels do Meta",
    singular: "pixel",
    description:
      "Cada evento capturado é enviado para todos os pixels ativos, via Conversions API.",
    publicIdLabel: "ID do pixel",
    publicIdPlaceholder: "4534042836884934",
    publicIdHint: "Só dígitos. Events Manager → Fontes de dados.",
    secretLabel: "Token da Conversions API",
    secretHint:
      "Events Manager → Configurações → Conversions API → Gerar token de acesso.",
  },
  ga4: {
    table: "ga4_accounts",
    publicIdColumn: "measurement_id",
    vaultColumn: "api_secret_vault_id",
    publicIdPattern: /^G-[A-Z0-9]+$/,
    title: "Propriedades GA4",
    singular: "propriedade",
    description:
      "O measurement ID alimenta a gtag no navegador; o api secret é usado só para a compra que chega pelo webhook.",
    publicIdLabel: "Measurement ID",
    publicIdPlaceholder: "G-61RK5XGTPS",
    publicIdHint: "Formato G-XXXXXXX. Administrador → Fluxos de dados.",
    secretLabel: "API Secret (Measurement Protocol)",
    secretHint:
      "Administrador → Fluxos de dados → escolha o fluxo → Protocolo de medição.",
  },
  adaccount: {
    table: "meta_ad_accounts",
    publicIdColumn: "ad_account_id",
    vaultColumn: "ads_token_vault_id",
    publicIdPattern: /^act_[0-9]+$/,
    title: "Contas de anúncio",
    singular: "conta de anúncio",
    description:
      "Usadas na tela de Campanhas para ler investimento do Meta Ads e cruzar com a receita.",
    publicIdLabel: "ID da conta",
    publicIdPlaceholder: "act_250904279114545",
    publicIdHint: "Começa com act_. Gerenciador de Anúncios → Configurações.",
    secretLabel: "Token de acesso (Ads)",
    secretHint:
      "Token de system user da Business Manager, com escopo ads_read.",
  },
}

export const MAX_LABEL_LENGTH = 80
export const MAX_SECRET_LENGTH = 1000
export const MAX_PUBLIC_ID_LENGTH = 60

export function isAccountKind(value: unknown): value is AccountKind {
  return (
    typeof value === "string" &&
    (ACCOUNT_KINDS as readonly string[]).includes(value)
  )
}
