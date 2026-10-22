-- Papel de admin: ter sessão no Supabase Auth deixa de bastar.
--
-- As policies de leitura eram `using (true)` para `authenticated`. Com o signup
-- do Supabase Auth ligado (padrão em projeto hospedado), qualquer pessoa criava
-- conta pela anon key em /auth/v1/signup e lia visitors, events_log, purchases e
-- visitor_touches direto pelo PostgREST — sem passar pelo app. Agora só lê quem
-- tem `app_metadata.role = 'admin'`, que só o service_role (ou o SQL Editor)
-- escreve. O app aplica a mesma regra em lib/auth/is-admin.ts.
--
-- is_admin() lê auth.users, não o JWT: um token emitido antes desta migration
-- não carrega o papel, e o painel ficaria vazio até o refresh.

-- 1. Promove as contas que JÁ existem. Confira a lista em Authentication →
--    Users antes de rodar: toda conta presente vira admin, inclusive uma que
--    tenha sido criada por signup indevido.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where coalesce(raw_app_meta_data->>'role', '') <> 'admin';

-- 2. Função usada pelas policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and raw_app_meta_data->>'role' = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- 3. Policies. `(select ...)` faz o Postgres avaliar uma vez por consulta, não
--    uma vez por linha.
drop policy if exists "authenticated_read_visitors" on public.visitors;
create policy "authenticated_read_visitors"
  on public.visitors for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "authenticated_read_events_log" on public.events_log;
create policy "authenticated_read_events_log"
  on public.events_log for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "authenticated_read_purchases" on public.purchases;
create policy "authenticated_read_purchases"
  on public.purchases for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "authenticated_read_visitor_touches" on public.visitor_touches;
create policy "authenticated_read_visitor_touches"
  on public.visitor_touches for select
  to authenticated
  using ((select public.is_admin()));
