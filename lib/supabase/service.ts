import "server-only"

import { createClient } from "@supabase/supabase-js"

import { supabaseServiceRoleKey, supabaseUrl } from "./env"

/**
 * Cliente com a chave SERVICE_ROLE — ignora RLS por completo (BYPASSRLS).
 *
 * PERIGO: este módulo nunca pode ser importado por um Client Component. O
 * import de `server-only` no topo transforma esse erro em falha de build, e
 * não em vazamento da chave no bundle do navegador. Não remova.
 *
 * Usos legítimos (todos no servidor):
 * - gravar em visitors/events_log/purchases (captura e webhook, fases 5 a 7)
 * - ler/gravar as 4 tabelas de credenciais, que não têm policy de SELECT
 * - chamar as funções do Vault (store/reveal/update/delete_secret)
 *
 * Nunca usar para atender leitura do painel: pra isso existe o cliente de
 * `./server`, que respeita RLS.
 */
export function createServiceClient() {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: {
      // Não há usuário aqui: é uma conexão de máquina, sem sessão nem refresh.
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
