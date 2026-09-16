/**
 * Leitura das variáveis de infra do Supabase.
 *
 * Lidas sob demanda (não no topo do módulo) de propósito: uma exceção em
 * tempo de import quebraria o `next build` em vez de dar um erro claro na
 * requisição. Só a URL e a anon key são públicas; a service_role key é lida
 * apenas em `lib/supabase/service.ts`, que é `server-only`.
 */

function requiredEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Variável de ambiente ${name} não configurada. ` +
        `Preencha o .env.local com os dados do projeto Supabase (ver CLAUDE.md).`
    )
  }
  return value
}

export function supabaseUrl(): string {
  return requiredEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  )
}

export function supabaseAnonKey(): string {
  return requiredEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export function supabaseServiceRoleKey(): string {
  return requiredEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}
