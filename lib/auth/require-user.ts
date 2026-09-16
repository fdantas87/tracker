import "server-only"

import { createClient } from "@/lib/supabase/server"

/**
 * Exige sessão válida. Use no início de TODA Server Action.
 *
 * Isto não é redundante com o proxy nem com o layout: uma Server Action é, na
 * prática, um endpoint HTTP público — quem descobrir o id da action pode
 * chamá-la direto, sem passar por página nenhuma. Sem esta checagem, as
 * actions de configuração seriam um caminho aberto para gravar credenciais e
 * disparar testes de conexão sem login.
 */
export async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Sessão expirada. Entre de novo para continuar.")
  }

  return user
}
