import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { supabaseAnonKey, supabaseUrl } from "./env"

/**
 * Cliente do Supabase para Server Components, Server Actions e Route Handlers
 * do painel. Usa a chave ANON + os cookies da sessão, então **respeita RLS**:
 * só enxerga o que a política de SELECT do usuário autenticado permite.
 *
 * Sempre criar um cliente novo por requisição — nunca reaproveitar entre
 * requisições (a sessão e os headers de cache são por request).
 *
 * Para gravar dados (captura de eventos, webhook) use `createServiceClient()`
 * de `./service`, que ignora RLS e nunca deve chegar perto do navegador.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Components não podem gravar cookies. Tudo bem: o refresh de
          // sessão acontece no proxy.ts, que roda antes e grava lá.
        }
      },
    },
  })
}
