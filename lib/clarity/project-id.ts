/**
 * Extrai o Project ID do Clarity do que a pessoa colou.
 *
 * Ninguém precisa saber o que é "Project ID": quem abre o Clarity tem à mão a
 * URL do projeto ou o código de rastreamento, e é isso que costuma colar. Este
 * módulo aceita qualquer um dos três e devolve só o ID.
 *
 *   3t0wlogvdz
 *   https://clarity.microsoft.com/projects/view/3t0wlogvdz/dashboard?date_d=...
 *   (function(c,l,a,r,i,t,y){...})(window, document, "clarity", "script", "3t0wlogvdz");
 *   https://www.clarity.ms/tag/3t0wlogvdz
 *
 * O formato final é o MESMO do CHECK de `clarity_accounts` e do regex do
 * `track.js`: o ID vai interpolado na URL do script carregado em todo site do
 * cliente, então só passa o que casa com o padrão exato — nunca texto livre.
 *
 * SEM `server-only`: o formulário valida no cliente para responder na hora, e a
 * action valida de novo no servidor (a barreira de verdade).
 */

export const CLARITY_PROJECT_ID_PATTERN = /^[a-z0-9]{6,20}$/

/** `projects/view/<id>` e `clarity.ms/tag/<id>`: o ID vem logo depois. */
const DENTRO_DE_URL = [
  /clarity\.microsoft\.com\/(?:demo\/)?projects\/view\/([a-z0-9]{6,20})(?=[/?#\s"']|$)/i,
  /clarity\.ms\/tag\/([a-z0-9]{6,20})(?=[/?#\s"']|$)/i,
]

/** O código de rastreamento termina com `"clarity","script","<id>"`. */
const DENTRO_DO_SNIPPET = /["']clarity["']\s*,\s*["']script["']\s*,\s*["']([a-z0-9]{6,20})["']/i

export function extrairProjectId(bruto: string): string | null {
  const texto = bruto.trim()
  if (!texto) return null

  // O ID puro vem primeiro: um ID de 10 letras não pode ser lido como outra coisa.
  const puro = texto.toLowerCase()
  if (CLARITY_PROJECT_ID_PATTERN.test(puro)) return puro

  const doSnippet = DENTRO_DO_SNIPPET.exec(texto)
  if (doSnippet) return doSnippet[1].toLowerCase()

  for (const padrao of DENTRO_DE_URL) {
    const achou = padrao.exec(texto)
    if (achou) return achou[1].toLowerCase()
  }

  return null
}

export const MENSAGEM_PROJECT_ID =
  "Não achei o Project ID no que você colou. Cole o endereço do projeto no Clarity (clarity.microsoft.com/projects/view/…) ou o código de rastreamento inteiro."
