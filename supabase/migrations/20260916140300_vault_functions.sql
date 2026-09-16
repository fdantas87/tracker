-- ============================================================================
-- Fase 2 · 4/5 — Funções do Vault
-- ============================================================================
-- O schema `vault` não é exposto via PostgREST/RPC por padrão. Estas 4
-- funções SECURITY DEFINER são a única porta de entrada para gravar/ler/
-- atualizar/apagar um segredo, e só `service_role` pode executá-las — nunca
-- `anon`/`authenticated`. A Server Action de "salvar credencial" (fase 4)
-- chama store_secret() e grava só o uuid retornado na coluna *_vault_id da
-- tabela correspondente; o disparo pro Meta/GA4 (fase 6) chama reveal_secret()
-- no momento exato do envio, usa o valor só em memória e nunca loga.
--
-- Se este arquivo der erro em "vault.create_secret"/"vault.decrypted_secrets"
-- não existir: vá em Database -> Extensions no painel do Supabase, habilite
-- "Supabase Vault" e rode este arquivo de novo.
-- ============================================================================

create or replace function public.store_secret(p_secret text, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return vault.create_secret(p_secret, coalesce(p_name, gen_random_uuid()::text));
end;
$$;

revoke all on function public.store_secret(text, text) from public;
grant execute on function public.store_secret(text, text) to service_role;

create or replace function public.reveal_secret(p_secret_id uuid)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_secret_id;
$$;

revoke all on function public.reveal_secret(uuid) from public;
grant execute on function public.reveal_secret(uuid) to service_role;

-- Rotação/edição de um segredo já existente (usado pelo botão "Substituir"
-- no painel de configurações, fase 4).
create or replace function public.update_secret(p_secret_id uuid, p_new_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform vault.update_secret(p_secret_id, p_new_secret);
end;
$$;

revoke all on function public.update_secret(uuid, text) from public;
grant execute on function public.update_secret(uuid, text) to service_role;

-- Remoção de um segredo (usado pelo botão "Remover" no painel, fase 4 — a
-- ordem correta na Server Action é: apagar a linha da tabela (ga4_accounts/
-- meta_pixels/meta_ad_accounts) primeiro, DEPOIS chamar delete_secret() com
-- o vault_id que ela guardava. Não há FK entre as duas, então nada força
-- essa ordem no banco — é responsabilidade do código da fase 4).
create or replace function public.delete_secret(p_secret_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = p_secret_id;
end;
$$;

revoke all on function public.delete_secret(uuid) from public;
grant execute on function public.delete_secret(uuid) to service_role;
