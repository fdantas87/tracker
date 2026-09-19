/**
 * Nome do produto e da marca, por deploy.
 *
 * POR QUE ESTE MÓDULO EXISTE: o mesmo repositório é implantado uma vez por
 * cliente (ver "Arquitetura multi-cliente" no CLAUDE.md). O nome que aparece na
 * aba do navegador e no cabeçalho do painel não pode ser o de outro cliente, e
 * a única coisa que distingue um deploy do outro é a variável de ambiente.
 *
 * As duas são `NEXT_PUBLIC_` porque o nome do painel é público por natureza —
 * ele é renderizado na tela. Nenhum segredo passa por aqui.
 *
 * Os defaults são GENÉRICOS de propósito: um deploy que esqueceu de configurar
 * mostra "Tracking", nunca a marca de outro cliente. Um default com a marca da
 * Negou seria pior do que nenhum, porque o erro passaria despercebido.
 */

/** Nome completo, usado no <title> de todas as páginas. Ex.: "Negou Tracking". */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Tracking"

/**
 * Só a marca, usada no wordmark do painel e do login. Ex.: "Negou".
 *
 * Cai para o APP_NAME quando não configurada: um cliente que preencheu apenas
 * uma das duas variáveis continua vendo algo coerente, em vez de um espaço em
 * branco no topo da sidebar.
 */
export const BRAND_NAME =
  process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || APP_NAME

/**
 * Título de página, no formato "Seção · Nome do app".
 *
 * Existe para o nome não ficar repetido em nove `page.tsx` — foi exatamente
 * essa repetição que deixou a marca da Negou espalhada pelo código.
 */
export function pageTitle(secao?: string): string {
  return secao ? `${secao} · ${APP_NAME}` : APP_NAME
}
