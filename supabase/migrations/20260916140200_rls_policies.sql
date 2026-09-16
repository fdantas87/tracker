-- ============================================================================
-- Fase 2 · 3/5 — RLS
-- ============================================================================
-- Regra geral: leitura só por usuário autenticado (painel); escrita só pelo
-- servidor (service_role, que ignora RLS via BYPASSRLS — não precisa de
-- política de escrita nenhuma pra isso funcionar).
--
-- Refinamento de segurança para as 4 tabelas de credenciais: elas NÃO têm
-- nenhuma política de SELECT, nem para `authenticated`. Ninguém lê
-- settings/ga4_accounts/meta_pixels/meta_ad_accounts pelo client do
-- navegador — toda leitura (já mascarada) passa por Server Action com
-- service_role. Isso é defesa em profundidade: mesmo que um componente
-- client tente `supabase.from('meta_pixels').select()` por engano, RLS
-- devolve zero linhas. NÃO adicione uma política de SELECT aqui achando
-- que "faltou" — foi proposital.
-- ============================================================================

alter table public.settings enable row level security;
alter table public.ga4_accounts enable row level security;
alter table public.meta_pixels enable row level security;
alter table public.meta_ad_accounts enable row level security;
alter table public.visitors enable row level security;
alter table public.events_log enable row level security;
alter table public.purchases enable row level security;

-- Tabelas de credenciais: nega tudo pra anon/authenticated (só service_role
-- acessa, e service_role ignora RLS de qualquer forma — isto aqui é sobre
-- fechar o acesso via PostgREST/client mesmo que RLS um dia mude).
revoke all on public.settings from anon, authenticated;
revoke all on public.ga4_accounts from anon, authenticated;
revoke all on public.meta_pixels from anon, authenticated;
revoke all on public.meta_ad_accounts from anon, authenticated;

-- Tabelas de dados do dashboard: leitura para authenticated (empresa única,
-- sem multi-tenant, por isso `using (true)`), sem política de escrita.
create policy "authenticated_read_visitors"
  on public.visitors for select
  to authenticated
  using (true);

create policy "authenticated_read_events_log"
  on public.events_log for select
  to authenticated
  using (true);

create policy "authenticated_read_purchases"
  on public.purchases for select
  to authenticated
  using (true);

revoke insert, update, delete on public.visitors from anon, authenticated;
revoke insert, update, delete on public.events_log from anon, authenticated;
revoke insert, update, delete on public.purchases from anon, authenticated;
