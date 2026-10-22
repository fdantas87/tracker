import type { User } from "@supabase/supabase-js"

/**
 * Só quem tem `app_metadata.role = "admin"` entra no painel.
 *
 * Ter sessão NÃO basta: o signup do Supabase Auth vem ligado por padrão em
 * projeto hospedado, e com a anon key (pública) qualquer pessoa cria conta
 * direto em `/auth/v1/signup`, sem passar pelo app. `app_metadata` só é
 * escrito pelo service_role — o usuário não consegue se promover sozinho. A
 * mesma regra vale no banco (`public.is_admin()`, usada pelas policies RLS).
 *
 * Conta criada no Supabase Studio nasce SEM o papel; promova com:
 *   update auth.users set raw_app_meta_data =
 *     coalesce(raw_app_meta_data, '{}') || '{"role":"admin"}' where email = '...';
 */
export function isAdmin(user: User | null | undefined): user is User {
  return user?.app_metadata?.role === "admin"
}
