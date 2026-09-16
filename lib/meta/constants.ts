/**
 * Versão da Graph API do Meta — CONSTANTE ÚNICA do projeto.
 *
 * Tudo que fala com o Meta (Conversions API, Ads Insights, teste de conexão)
 * passa por aqui. Para subir de versão, mude só esta linha e rode os testes
 * de conexão no painel.
 *
 * v26.0 foi lançada em 29/07/2026 e era a mais recente quando isto foi
 * escrito (16/09/2026), confirmada no changelog oficial:
 * https://developers.facebook.com/docs/graph-api/changelog
 *
 * Cada versão fica disponível por cerca de 2 anos. A anterior (v25.0, de
 * 18/02/2026) vai até 29/07/2028.
 */
export const META_GRAPH_API_VERSION = "v26.0"

export const META_GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`

/**
 * Timeout curto para qualquer chamada ao Meta. Evita que um teste de conexão
 * ou um disparo de evento segure a requisição do usuário indefinidamente.
 */
export const META_REQUEST_TIMEOUT_MS = 10_000
