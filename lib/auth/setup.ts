import "server-only"

import { createServiceClient } from "@/lib/supabase/service"

/**
 * Estado da instalação, do ponto de vista do primeiro acesso.
 *
 * `"vazio"` é o ÚNICO valor que libera o formulário de "Configurar pela
 * primeira vez". Os outros dois mostram o login normal. Isso é deliberado:
 * qualquer dúvida sobre o estado do banco tem que fechar a porta, nunca abrir.
 */
export type EstadoSetup = "vazio" | "com-usuario" | "indisponivel"

/**
 * Existe algum usuário no Auth deste projeto?
 *
 * `auth.users` pertence ao Supabase Auth e nasce com o projeto — não depende
 * das nossas migrations. Então esta checagem funciona mesmo num banco onde o
 * `supabase/setup.sql` ainda não rodou.
 *
 * TRÊS ARMADILHAS, todas verificadas na fonte do @supabase/auth-js:
 *
 * 1. `data.total` MENTE. Em `GoTrueAdminApi.listUsers`, `pagination.total` só é
 *    populado dentro de um `if (links.length > 0)` — ou seja, só quando a
 *    resposta traz header `Link`. Com 0 ou 1 usuário não há paginação, não há
 *    header, e `total` fica 0 mesmo havendo usuário. Isso seria um falso "banco
 *    vazio" reabrindo o setup num painel já configurado. Use `users.length`.
 *
 * 2. Em erro, `listUsers` NÃO lança: devolve `{ data: { users: [] }, error }`.
 *    Chave errada, rede caindo ou projeto pausado dariam lista vazia, e um
 *    `length === 0` ingênuo falharia ABERTO — exatamente o oposto do que se
 *    quer num endpoint que cria administrador. Por isso o `error` é checado
 *    antes do array.
 *
 * 3. `createServiceClient()` fica DENTRO do try: `supabaseServiceRoleKey()`
 *    lança quando a variável de ambiente não existe (o caso de um deploy
 *    recém-criado com a variável faltando), e essa exceção precisa virar
 *    `"indisponivel"`, não um 500 na tela de login.
 */
export async function estadoDoSetup(): Promise<EstadoSetup> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    })

    if (error) return "indisponivel"

    return data.users.length === 0 ? "vazio" : "com-usuario"
  } catch {
    return "indisponivel"
  }
}
