-- ============================================================================
-- GERADO AUTOMATICAMENTE — NÃO EDITE ESTE ARQUIVO.
-- ============================================================================
-- Fonte:    supabase/setup-preflight.sql + supabase/migrations/*.sql
-- Regerar:  npm run build:setup-sql
--
-- O `npm run build` falha se este arquivo estiver desatualizado em relação
-- às migrations. Edite a migration, não o resultado.
--
-- COMO USAR (cliente novo): cole este arquivo INTEIRO no SQL Editor do
-- Supabase e rode uma vez. O editor executa tudo numa transação única, então
-- ou o schema inteiro aplica, ou nada aplica — não existe meio-termo.
--
-- 15 arquivos, na ordem de aplicação:
--   supabase/setup-preflight.sql                                         1eb5dba9
--   supabase/migrations/20260916140000_extensions.sql                    b4e4fd34
--   supabase/migrations/20260916140100_tables.sql                        245ec9a0
--   supabase/migrations/20260916140200_rls_policies.sql                  46928e64
--   supabase/migrations/20260916140300_vault_functions.sql               060d4e7b
--   supabase/migrations/20260916140400_retention_job.sql                 a437e8fd
--   supabase/migrations/20260917170000_rate_limits.sql                   e5770c1d
--   supabase/migrations/20260917190000_event_queue.sql                   d27b5837
--   supabase/migrations/20260918120000_geo_enriquecido.sql               97f6e13b
--   supabase/migrations/20260919090000_purchases_dados_comprador.sql     1fe77716
--   supabase/migrations/20260919120000_purchases_forma_pagamento.sql     e279ab08
--   supabase/migrations/20260921130000_stripe_integration.sql            4cae7404
--   supabase/migrations/20260922140000_allowed_origins.sql               448cba0a
--   supabase/migrations/20260923120000_cron_health.sql                   44fb0bcd
--   supabase/migrations/20260923130000_remove_default_phone_country.sql  d87fea19
-- ============================================================================

-- >>> supabase/setup-preflight.sql
-- ============================================================================
-- Preflight — roda ANTES de tudo no supabase/setup.sql
-- ============================================================================
-- O SQL Editor do Supabase executa o script colado numa transação única, então
-- qualquer erro aqui faz rollback de TUDO: nada é aplicado ao banco pela
-- metade. Isso é importante porque as migrations deste projeto não são
-- idempotentes (`create table`/`create policy`/`create trigger` sem guarda).
--
-- Sem este bloco, os dois erros mais prováveis apareceriam na linha ~900 de um
-- arquivo de milhares de linhas, com a mensagem crua do Postgres. Aqui eles
-- param na primeira linha, com o clique a dar.
--
-- As mensagens vão SEM ACENTO de propósito: voltam pelo protocolo do Postgres
-- e são renderizadas no toast do SQL Editor, onde encoding quebrado já foi
-- visto.
-- ============================================================================

do $preflight$
begin
  -- --------------------------------------------------------------------------
  -- 1. Supabase Vault
  -- --------------------------------------------------------------------------
  -- Checar só o SCHEMA `vault` NÃO basta. Das 4 funções de
  -- 20260916140300_vault_functions.sql, três são `language plpgsql` e são
  -- criadas sem erro mesmo sem o Vault (o corpo de uma função PL/pgSQL só é
  -- analisado na execução — a mesma propriedade que escondeu o bug de
  -- `malformed array literal` na fase 7.5). Quem quebra é `reveal_secret`, que
  -- é `language sql` e resolve `vault.decrypted_secrets` na hora do CREATE.
  -- Por isso o teste é pela VIEW, não pelo schema.
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception using
      message = 'O Supabase Vault nao esta habilitado neste projeto.',
      hint    = 'Abra Database > Extensions no painel do Supabase, procure '
                'por "supabase_vault", habilite, e rode este script de novo. '
                'Nada foi aplicado ao banco.';
  end if;

  -- --------------------------------------------------------------------------
  -- 2. Banco já instalado
  -- --------------------------------------------------------------------------
  -- Sem isto o erro seria `relation "settings" already exists` no meio do
  -- arquivo. Inofensivo (a transação inteira faz rollback), mas ilegível para
  -- quem está seguindo o passo a passo e não sabe se estragou alguma coisa.
  if to_regclass('public.settings') is not null then
    raise exception using
      message = 'Este banco JA tem o schema do tracker instalado.',
      hint    = 'Este script roda UMA vez, num projeto Supabase novo. Nada foi '
                'alterado. Para atualizar um banco existente, aplique so a '
                'migration nova de supabase/migrations/.';
  end if;
end
$preflight$;

-- `to_regclass` devolve null (não lança) quando o schema nem existe, então o
-- mesmo teste serve para "sem Vault" e para "sem a tabela".
--
-- pg_cron e pg_net NÃO entram aqui de propósito: o próprio setup.sql os cria
-- com `create extension if not exists`, e é isso que torna obsoleto o antigo
-- passo manual "habilite o pg_net no painel antes de rodar as migrations".

-- >>> supabase/migrations/20260916140000_extensions.sql
-- ============================================================================
-- Fase 2 · 1/5 — Extensões
-- ============================================================================
-- Cole este arquivo primeiro no SQL Editor do Supabase e rode.
--
-- pgcrypto: gen_random_uuid() e funções de hash/cripto usadas nas tabelas.
-- pg_cron:  agenda o job diário de retenção (fase 2, arquivo 5/5).
--
-- Vault (schema `vault`, usado nas fases 2/4 para cifrar api_secret/capi_token/
-- ads_token) já vem habilitado por padrão em todo projeto Supabase hospedado —
-- não precisa de `create extension` aqui. Se o arquivo 4/5 (vault_functions)
-- der erro do tipo "schema vault does not exist" ou "function vault.create_secret
-- does not exist", vá em Database -> Extensions no painel do Supabase, procure
-- "Supabase Vault" e habilite por lá antes de tentar de novo.
-- ============================================================================

create extension if not exists pgcrypto;

create extension if not exists pg_cron with schema cron;

-- >>> supabase/migrations/20260916140100_tables.sql
-- ============================================================================
-- Fase 2 · 2/5 — Tabelas
-- ============================================================================
-- 7 tabelas do modelo de dados: settings, ga4_accounts, meta_pixels,
-- meta_ad_accounts, visitors, events_log, purchases.
--
-- Segredos reversíveis (api_secret/capi_token/ads_token) NÃO ficam em coluna
-- de texto — ficam no Supabase Vault, e a tabela guarda só o *_vault_id (uuid)
-- que aponta pra lá. As funções que gravam/leem o Vault vêm no arquivo 4/5.
--
-- *_vault_id NÃO tem foreign key formal pra vault.secrets(id) de propósito:
-- assim a criação das tabelas (este arquivo) não fica acoplada ao Vault
-- estar disponível no projeto — só o arquivo 4/5 (vault_functions) realmente
-- precisa do schema `vault` existir. Se você nunca viu um erro de Vault até
-- aqui, pode seguir; a integridade referencial real é garantida em código
-- (fase 4: nunca se grava um *_vault_id sem antes chamar store_secret()).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- settings (linha única / singleton)
-- ----------------------------------------------------------------------------
create table public.settings (
  id boolean primary key default true,
  constraint settings_singleton check (id),
  webhook_token_hash text not null,
  currency text not null default 'BRL',
  test_event_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.settings is
  'Linha única de configuração global. webhook_token_hash é o SHA-256 do token '
  'de webhook (o valor bruto nunca é persistido, só mostrado uma vez na UI).';

-- ----------------------------------------------------------------------------
-- ga4_accounts (N contas GA4)
-- ----------------------------------------------------------------------------
create table public.ga4_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  measurement_id text not null unique check (measurement_id ~ '^G-[A-Z0-9]+$'),
  api_secret_vault_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- meta_pixels (N pixels do Meta)
-- ----------------------------------------------------------------------------
create table public.meta_pixels (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  pixel_id text not null unique check (pixel_id ~ '^[0-9]+$'),
  capi_token_vault_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- meta_ad_accounts (N contas de anúncio do Meta Ads)
-- ----------------------------------------------------------------------------
create table public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  ad_account_id text not null unique check (ad_account_id ~ '^act_[0-9]+$'),
  ads_token_vault_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- visitors
-- ----------------------------------------------------------------------------
create table public.visitors (
  id uuid primary key default gen_random_uuid(),
  trck_user_id text not null unique,

  email text,
  email_hash text,
  phone_hash text,
  first_name_hash text,
  last_name_hash text,

  fbp text,
  fbc text,
  ga_client_id text,
  ga_session_id text,
  ga_session_number int,
  ga_session_started_at timestamptz,

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  referrer text,

  ip inet,
  user_agent text,
  geo_country text,
  geo_region text,
  geo_city text,

  pixel_id uuid references public.meta_pixels (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index visitors_email_hash_idx on public.visitors (email_hash);
create index visitors_ga_client_id_idx on public.visitors (ga_client_id);
create index visitors_created_at_idx on public.visitors (created_at);

-- ----------------------------------------------------------------------------
-- events_log
-- ----------------------------------------------------------------------------
create table public.events_log (
  id uuid primary key default gen_random_uuid(),
  trck_user_id text not null references public.visitors (trck_user_id) on delete cascade,
  event_name text not null,
  event_id text not null unique,

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,

  payload_meta jsonb,
  response_meta jsonb,
  payload_ga4 jsonb,
  response_ga4 jsonb,

  ip inet,
  geo_country text,
  geo_region text,
  geo_city text,

  created_at timestamptz not null default now()
);

create index events_log_trck_user_id_idx on public.events_log (trck_user_id);
create index events_log_event_name_idx on public.events_log (event_name);
create index events_log_created_at_idx on public.events_log (created_at);

comment on column public.events_log.event_id is
  'Nasce no navegador para eventos de Pixel/gtag (dedup real no Meta); nasce '
  'no servidor, derivado do transaction_id, só para Purchase (idempotência de '
  'reentrega do webhook, não dedup Meta — Purchase nunca dispara no Pixel).';

-- ----------------------------------------------------------------------------
-- purchases
-- ----------------------------------------------------------------------------
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  transaction_id text not null unique,
  trck_user_id text references public.visitors (trck_user_id) on delete set null,

  email text,
  email_hash text,
  phone_hash text,

  product_name text,
  product_id text,
  amount numeric(12, 2) not null,
  currency text not null default 'BRL',

  status text not null check (
    status in ('approved', 'refunded', 'chargeback', 'canceled', 'pending', 'expired')
  ),
  platform text not null check (
    platform in ('perfectpay', 'hotmart', 'kiwify', 'eduzz')
  ),
  platform_status text,

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,

  fbp text,
  fbc text,
  geo_country text,
  geo_region text,
  geo_city text,

  match_method text check (match_method in ('trck_user_id', 'email', 'phone', 'none')),
  match_found boolean not null default false,

  meta_event_id text,
  response_meta jsonb,
  ga_client_id text,
  response_ga4 jsonb,

  raw_webhook jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchases_trck_user_id_idx on public.purchases (trck_user_id);
create index purchases_status_idx on public.purchases (status);
create index purchases_created_at_idx on public.purchases (created_at);

comment on column public.purchases.platform_status is
  'Valor bruto de status como a plataforma mandou (ex.: "complete", "paid"), '
  'preservado para auditoria — o enum de `status` acima é o normalizado.';

-- ----------------------------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.ga4_accounts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.meta_pixels
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.meta_ad_accounts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.visitors
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.purchases
  for each row execute function public.set_updated_at();

-- >>> supabase/migrations/20260916140200_rls_policies.sql
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

-- >>> supabase/migrations/20260916140300_vault_functions.sql
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

-- >>> supabase/migrations/20260916140400_retention_job.sql
-- ============================================================================
-- Fase 2 · 5/5 — Retenção de logs
-- ============================================================================
-- Job diário que ZERA (sem apagar a linha) os campos jsonb pesados de
-- events_log com mais de 14 dias: payload_meta, response_meta, payload_ga4,
-- response_ga4. Mantém evento, UTMs e geo pro dashboard funcionar; só some o
-- payload/resposta brutos, que só servem pra debug de curto prazo.
-- ============================================================================

create or replace function public.purge_old_event_payloads(p_batch_size int default 500)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_affected int;
begin
  with batch as (
    select id
    from public.events_log
    where created_at < now() - interval '14 days'
      and (
        payload_meta is not null
        or response_meta is not null
        or payload_ga4 is not null
        or response_ga4 is not null
      )
    limit p_batch_size
  )
  update public.events_log e
  set payload_meta = null,
      response_meta = null,
      payload_ga4 = null,
      response_ga4 = null
  from batch
  where e.id = batch.id;

  get diagnostics v_affected = row_count;
  return v_affected;
end;
$$;

revoke all on function public.purge_old_event_payloads(int) from public;
grant execute on function public.purge_old_event_payloads(int) to postgres, service_role;

-- Agenda diária às 04:00 UTC (madrugada, baixo tráfego). Processa em lotes de
-- 500 até não sobrar nenhuma linha elegível naquele dia — evita um único
-- UPDATE gigante travando a tabela se o volume crescer.
select cron.schedule(
  'purge_old_event_payloads_daily',
  '0 4 * * *',
  $cron$
    do $do$
    declare
      v_batch int;
    begin
      loop
        v_batch := public.purge_old_event_payloads(500);
        exit when v_batch = 0;
      end loop;
    end
    $do$;
  $cron$
);

-- >>> supabase/migrations/20260917170000_rate_limits.sql
-- ============================================================================
-- Fase 5 (revisada) — Rate limit compartilhado, no próprio Postgres
-- ============================================================================
-- Cole no SQL Editor do Supabase e rode, como as migrations da fase 2.
--
-- POR QUE NO POSTGRES E NÃO NO REDIS:
-- o limite precisa ser compartilhado entre todas as instâncias da função
-- serverless — um contador na memória do processo não serve, porque cada
-- requisição pode cair numa instância diferente e o contador nunca soma.
-- A solução clássica é Redis, mas isso significa mais um serviço, mais uma
-- conta e mais duas credenciais pra guardar e rotacionar. Como o Postgres do
-- Supabase já existe, já é compartilhado por todas as instâncias e já é
-- consultado nesses mesmos endpoints, ele resolve o problema sem nenhuma peça
-- nova. Para o volume de um negócio (não de uma plataforma multi-inquilino),
-- a diferença de desempenho é irrelevante perto da simplicidade operacional.
-- ============================================================================

create table if not exists public.rate_limits (
  -- chave = escopo:identificador:início-da-janela. Cada janela é uma linha
  -- própria, então a contagem nunca vaza de uma janela pra outra.
  key text primary key,
  hits integer not null default 1,
  expires_at timestamptz not null
);

-- Usado só pela limpeza; a contagem vai direto pela primary key.
create index if not exists rate_limits_expires_at_idx
  on public.rate_limits (expires_at);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

comment on table public.rate_limits is
  'Contadores de rate limit dos endpoints públicos. Linhas são descartáveis: '
  'somem sozinhas no job de limpeza. Nenhum dado pessoal aqui — a chave usa o '
  'IP apenas como identificador do balde e expira em minutos.';

-- ----------------------------------------------------------------------------
-- Incremento atômico
-- ----------------------------------------------------------------------------
-- `insert ... on conflict do update ... returning` resolve tudo numa ida só ao
-- banco e é atômico: duas requisições simultâneas não conseguem ler o mesmo
-- valor e gravar o mesmo incremento (o clássico lost update).
create or replace function public.bump_rate_limit(
  p_key text,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start bigint;
  v_hits integer;
begin
  -- Janela fixa alinhada no relógio: todas as instâncias calculam o mesmo
  -- início de janela sem precisar combinar nada entre si.
  v_window_start :=
    floor(extract(epoch from now()) / p_window_seconds)::bigint * p_window_seconds;

  insert into public.rate_limits as rl (key, hits, expires_at)
  values (
    p_key || ':' || v_window_start,
    1,
    to_timestamp(v_window_start + p_window_seconds)
  )
  on conflict (key) do update set hits = rl.hits + 1
  returning rl.hits into v_hits;

  return v_hits;
end;
$$;

revoke all on function public.bump_rate_limit(text, integer) from public;
grant execute on function public.bump_rate_limit(text, integer) to service_role;

-- ----------------------------------------------------------------------------
-- Limpeza das janelas vencidas
-- ----------------------------------------------------------------------------
create or replace function public.purge_expired_rate_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits where expires_at < now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_rate_limits() from public;
grant execute on function public.purge_expired_rate_limits() to postgres, service_role;

-- De hora em hora: as janelas duram um minuto, então a tabela nunca cresce.
select cron.schedule(
  'purge_expired_rate_limits_hourly',
  '7 * * * *',
  $cron$ select public.purge_expired_rate_limits(); $cron$
);

-- >>> supabase/migrations/20260917190000_event_queue.sql
-- ============================================================================
-- Fase 7.5 — Fila de disparo atrasado (retroalimentação de dados)
-- ============================================================================
-- Cole no SQL Editor do Supabase e rode, como as migrations anteriores.
--
-- ANTES DE RODAR: habilite a extensão `pg_net` em Database -> Extensions.
-- Ela é quem deixa o Postgres chamar uma URL, e é assim que o pg_cron acorda
-- a fila de minuto em minuto.
--
-- POR QUE ATRASAR O ENVIO:
-- no momento do PageView o sistema só conhece cookie, IP e geo — nenhum dado
-- pessoal. O email/telefone/nome só aparecem quando a pessoa converte (webhook
-- da plataforma de venda) ou preenche um formulário, e aí o evento de topo de
-- funil já foi enviado. O Meta não deixa atualizar evento já recebido, então o
-- dado se perde pra sempre.
--
-- Segurando o evento numa fila por alguns minutos, a conversão que chega no
-- meio do caminho grava a PII no visitante, e o disparo (que já lê `visitors`
-- na hora do envio) sai enriquecido sozinho. Um PageView de 15 minutos atrás
-- vai pro Meta com em/ph/fn/ln hasheados.
--
-- REGRA DO META QUE DEFINE ISTO (doc de deduplicação, verificada):
--   "If we find the same server key combination (event_id and event_name) and
--    browser key combination (eventID and event) sent to the same Pixel ID
--    within 48 hours, we discard the subsequent events."
--   "If server and browser events do not differ meaningfully in their content,
--    we generally prefer the event that is received first."
-- Ou seja: pixel na hora + CAPI atrasada com o mesmo event_id NÃO conta em
-- dobro, mas descarta justamente o evento enriquecido. Por isso o track.js
-- suprime o fbq('track') quando o evento vai pra fila (modo `adaptive`).
-- ============================================================================

create extension if not exists pg_net with schema extensions;

-- ----------------------------------------------------------------------------
-- 1. Estado de despacho em events_log
-- ----------------------------------------------------------------------------
-- CUIDADO QUE DEFINE O SUCESSO DESTA MIGRATION:
-- se `dispatch_status` nascesse com default 'pending', TODO evento histórico
-- entraria na fila e seria reenviado ao Meta. O truque de dois passos abaixo
-- (nasce 'sent', depois o default vira 'pending') faz as linhas existentes
-- nascerem já quitadas sem precisar de um UPDATE em tabela inteira.
alter table public.events_log
  add column if not exists dispatch_status text not null default 'sent';
alter table public.events_log
  alter column dispatch_status set default 'pending';

-- event_time é o momento REAL do evento, não o do envio. É ele que vai no
-- `event_time` da Conversions API — usar a hora do disparo faria um evento
-- atrasado parecer ter acontecido 15 minutos depois, estragando a atribuição.
alter table public.events_log
  add column if not exists event_time timestamptz;
update public.events_log set event_time = created_at where event_time is null;
alter table public.events_log
  alter column event_time set default now(),
  alter column event_time set not null;

-- event_source_url e custom_data viram colunas próprias porque hoje só existem
-- dentro de payload_meta — que o disparo SOBRESCREVE com o payload enviado. O
-- envio atrasado precisa dos dois originais pra montar o payload lá na frente.
alter table public.events_log
  add column if not exists event_source_url text,
  add column if not exists custom_data jsonb,
  add column if not exists action_source text not null default 'website',
  -- O navegador disparou o fbq pra este evento? Decide se o envio é imediato
  -- (senão o Meta descartaria o enriquecido) e serve de auditoria do modo.
  add column if not exists pixel_fired boolean not null default false,
  add column if not exists dispatch_after timestamptz not null default now(),
  add column if not exists dispatch_attempts int not null default 0,
  add column if not exists dispatch_claimed_at timestamptz,
  add column if not exists dispatched_at timestamptz,
  add column if not exists dispatch_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_log_dispatch_status_check'
  ) then
    alter table public.events_log
      add constraint events_log_dispatch_status_check
      check (dispatch_status in ('pending', 'sending', 'sent', 'failed', 'skipped'));
  end if;
end
$$;

-- Índice PARCIAL: só as linhas que a fila olha. Como a esmagadora maioria das
-- linhas fica em 'sent' pra sempre, o índice permanece pequeno mesmo com
-- milhões de eventos no log.
create index if not exists events_log_dispatch_queue_idx
  on public.events_log (dispatch_after)
  where dispatch_status in ('pending', 'sending');

comment on column public.events_log.event_time is
  'Momento real do evento (não o do envio). Vai no event_time da CAPI; o Meta '
  'aceita até 7 dias de atraso, e rejeita a REQUISIÇÃO INTEIRA se algum evento '
  'do lote passar disso.';

-- ----------------------------------------------------------------------------
-- 2. Configuração da fila em settings
-- ----------------------------------------------------------------------------
alter table public.settings
  add column if not exists dispatch_mode text not null default 'adaptive',
  add column if not exists dispatch_delay_seconds int not null default 900,
  add column if not exists dispatch_immediate_events text[] not null default '{}',
  add column if not exists form_capture_enabled boolean not null default true,
  add column if not exists default_phone_country text not null default '55',
  add column if not exists dispatch_cron_url text,
  add column if not exists dispatch_cron_token_vault_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settings_dispatch_mode_check') then
    alter table public.settings
      add constraint settings_dispatch_mode_check
      check (dispatch_mode in ('adaptive', 'server_only', 'hybrid'));
  end if;

  -- Teto de 6h. O limite duro do Meta é 7 dias, mas passando de uma hora a
  -- chance de aprender PII quase não cresce e o sinal de otimização só piora.
  if not exists (select 1 from pg_constraint where conname = 'settings_dispatch_delay_check') then
    alter table public.settings
      add constraint settings_dispatch_delay_check
      check (dispatch_delay_seconds between 0 and 21600);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'settings_phone_country_check') then
    alter table public.settings
      add constraint settings_phone_country_check
      check (default_phone_country ~ '^[0-9]{1,3}$');
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 3. Visitante: quando a identidade apareceu
-- ----------------------------------------------------------------------------
alter table public.visitors
  add column if not exists identified_at timestamptz;

-- findVisitor (webhook) já buscava por phone_hash sem índice: varredura
-- completa da tabela a cada compra.
create index if not exists visitors_phone_hash_idx
  on public.visitors (phone_hash);

-- ----------------------------------------------------------------------------
-- 4. Reivindicação atômica do lote
-- ----------------------------------------------------------------------------
create or replace function public.claim_pending_events(p_limit int default 150)
returns setof public.events_log
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- (a) ANTIVENENO DE LOTE. O Meta é explícito: "If any event_time in data is
  -- greater than 7 days in the past, we return an error for the entire request
  -- and process no events". Um evento velho esquecido na fila derrubaria o
  -- lote inteiro, inclusive os eventos novos. Descarta antes de reivindicar.
  update public.events_log
  set dispatch_status = 'skipped',
      dispatch_error = 'event_time acima do limite de 7 dias do Meta'
  where dispatch_status in ('pending', 'sending')
    and event_time < now() - interval '6 days';

  -- (b) REAPER. Worker que morreu no meio (timeout da função serverless, deploy)
  -- deixa a linha presa em 'sending'. Depois de 5 min ela volta pra fila. Um
  -- reenvio eventual é seguro: o Meta deduplica por event_id durante 48h.
  update public.events_log
  set dispatch_status = 'pending'
  where dispatch_status = 'sending'
    and dispatch_claimed_at < now() - interval '5 minutes';

  -- (c) CLAIM. `for update skip locked` é o que garante que dois workers
  -- simultâneos peguem conjuntos disjuntos em vez de brigar pela mesma linha.
  -- A ordem por event_time mantém os eventos de um mesmo visitante em sequência.
  return query
  update public.events_log e
  set dispatch_status = 'sending',
      dispatch_claimed_at = now(),
      dispatch_attempts = e.dispatch_attempts + 1
  where e.id in (
    select id
    from public.events_log
    where dispatch_status = 'pending'
      and dispatch_after <= now()
    order by dispatch_after, event_time
    limit p_limit
    for update skip locked
  )
  returning e.*;
end;
$$;

revoke all on function public.claim_pending_events(int) from public;
grant execute on function public.claim_pending_events(int) to service_role;

-- ----------------------------------------------------------------------------
-- 5. Liberação antecipada
-- ----------------------------------------------------------------------------
-- Quando a conversão chega e grava a PII no visitante, não há mais nada a
-- esperar: o motivo do atraso já aconteceu. Adianta a fila daquele visitante.
create or replace function public.flush_visitor_events(p_trck_user_id text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_affected int;
begin
  update public.events_log
  set dispatch_after = now()
  where trck_user_id = p_trck_user_id
    and dispatch_status = 'pending'
    and dispatch_after > now();

  get diagnostics v_affected = row_count;
  return v_affected;
end;
$$;

revoke all on function public.flush_visitor_events(text) from public;
grant execute on function public.flush_visitor_events(text) to service_role;

-- ----------------------------------------------------------------------------
-- 5b. Enriquecimento do visitante pela conversão
-- ----------------------------------------------------------------------------
-- O ELO QUE FALTAVA: até aqui a PII do comprador só ia parar em `purchases`, e
-- os eventos de navegador continuavam anônimos pra sempre. Gravando de volta
-- no visitante, o PageView que está na fila sai com em/ph/fn/ln quando disparar.
--
-- SÓ PREENCHE BURACO, nunca sobrescreve. O visitante pode já ter um valor
-- melhor (digitado pela própria pessoa num formulário); o webhook é uma fonte
-- de segunda mão, que chega depois. É o inverso do /api/identify, onde o valor
-- mais novo que um humano digitou deve ganhar.
--
-- Devolve a lista de colunas que REALMENTE preencheu, então a mesma ida ao
-- banco que escreve também responde "aprendemos algo novo?" — que é a condição
-- pra liberar a fila.
create or replace function public.fill_visitor_pii(
  p_trck_user_id text,
  p_email text default null,
  p_email_hash text default null,
  p_phone_hash text default null,
  p_first_name_hash text default null,
  p_last_name_hash text default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filled text[] := '{}';
  v_row public.visitors;
begin
  select * into v_row
  from public.visitors
  where trck_user_id = p_trck_user_id
  for update;

  if not found then
    return v_filled;
  end if;

  -- `array_append`, e não `||`: com um literal sem tipo, o `||` é ambíguo
  -- entre concatenar dois arrays e anexar um elemento, e o Postgres tenta
  -- interpretar 'email_hash' como um text[] inteiro — "malformed array
  -- literal". O array_append não tem essa ambiguidade.
  if v_row.email is null and p_email is not null then
    v_filled := array_append(v_filled, 'email');
  end if;
  if v_row.email_hash is null and p_email_hash is not null then
    v_filled := array_append(v_filled, 'email_hash');
  end if;
  if v_row.phone_hash is null and p_phone_hash is not null then
    v_filled := array_append(v_filled, 'phone_hash');
  end if;
  if v_row.first_name_hash is null and p_first_name_hash is not null then
    v_filled := array_append(v_filled, 'first_name_hash');
  end if;
  if v_row.last_name_hash is null and p_last_name_hash is not null then
    v_filled := array_append(v_filled, 'last_name_hash');
  end if;

  if array_length(v_filled, 1) is null then
    return v_filled;
  end if;

  update public.visitors
  set email           = coalesce(email, p_email),
      email_hash      = coalesce(email_hash, p_email_hash),
      phone_hash      = coalesce(phone_hash, p_phone_hash),
      first_name_hash = coalesce(first_name_hash, p_first_name_hash),
      last_name_hash  = coalesce(last_name_hash, p_last_name_hash),
      identified_at   = coalesce(identified_at, now())
  where trck_user_id = p_trck_user_id;

  return v_filled;
end;
$$;

revoke all on function public.fill_visitor_pii(text, text, text, text, text, text) from public;
grant execute on function public.fill_visitor_pii(text, text, text, text, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 6. Profundidade da fila (indicador do painel)
-- ----------------------------------------------------------------------------
-- Sem isto, uma falha do pg_net é silenciosa: os eventos se acumulam e nada
-- na tela indica problema.
create or replace function public.event_queue_depth()
returns table (pending bigint, due bigint, failed bigint)
language sql
security definer
stable
set search_path = ''
as $$
  select
    count(*) filter (where dispatch_status = 'pending'),
    count(*) filter (where dispatch_status = 'pending' and dispatch_after <= now()),
    count(*) filter (where dispatch_status = 'failed')
  from public.events_log
  where created_at > now() - interval '7 days';
$$;

revoke all on function public.event_queue_depth() from public;
grant execute on function public.event_queue_depth() to service_role;

-- ----------------------------------------------------------------------------
-- 7. O tique do cron
-- ----------------------------------------------------------------------------
-- O trabalho de verdade (montar payload, ler token do Vault, falar com o Meta)
-- é TypeScript e mora na Vercel. O Postgres só acorda o endpoint.
--
-- O token bruto vive SÓ no Vault — uma representação, uma fonte de verdade. O
-- pg_cron lê com reveal_secret e o endpoint compara em tempo constante.
create or replace function public.tick_event_queue()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_vault_id uuid;
  v_token text;
  v_due bigint;
begin
  select dispatch_cron_url, dispatch_cron_token_vault_id
    into v_url, v_vault_id
  from public.settings
  where id = true;

  -- Ainda não configurado no painel: sai quieto. Isso permite rodar esta
  -- migration antes de gerar o token, sem erro no log do cron a cada minuto.
  if v_url is null or v_vault_id is null then
    return null;
  end if;

  -- Não acorda a função serverless à toa. Com o índice parcial, esta contagem
  -- é barata mesmo com o log grande.
  select count(*) into v_due
  from public.events_log
  where dispatch_status = 'pending'
    and dispatch_after <= now();

  if v_due = 0 then
    return null;
  end if;

  v_token := public.reveal_secret(v_vault_id);
  if v_token is null then
    return null;
  end if;

  -- O endpoint responde 202 na hora e faz o trabalho no after() do Next, então
  -- este timeout curto não corta o envio: ele só espera o "recebi".
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

-- O pg_cron roda como `postgres`, não como `service_role`. O dono da função
-- sempre pode executá-la, mas o grant explícito deixa a intenção registrada —
-- mesmo padrão já usado em purge_old_event_payloads.
grant execute on function public.reveal_secret(uuid) to postgres;

revoke all on function public.tick_event_queue() from public;
grant execute on function public.tick_event_queue() to postgres, service_role;

select cron.schedule(
  'dispatch_event_queue_minutely',
  '* * * * *',
  $cron$ select public.tick_event_queue(); $cron$
);

-- ----------------------------------------------------------------------------
-- 8. Retenção: custom_data entra na limpeza
-- ----------------------------------------------------------------------------
-- Mesma função da fase 2, agora zerando também o custom_data. As colunas de
-- estado da fila NÃO são tocadas: a tela de Eventos (fase 8) vai querer mostrar
-- dispatch_status/dispatch_error muito depois dos 14 dias.
create or replace function public.purge_old_event_payloads(p_batch_size int default 500)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_affected int;
begin
  with batch as (
    select id
    from public.events_log
    where created_at < now() - interval '14 days'
      and (
        payload_meta is not null
        or response_meta is not null
        or payload_ga4 is not null
        or response_ga4 is not null
        or custom_data is not null
      )
    limit p_batch_size
  )
  update public.events_log e
  set payload_meta = null,
      response_meta = null,
      payload_ga4 = null,
      response_ga4 = null,
      custom_data = null
  from batch
  where e.id = batch.id;

  get diagnostics v_affected = row_count;
  return v_affected;
end;
$$;

revoke all on function public.purge_old_event_payloads(int) from public;
grant execute on function public.purge_old_event_payloads(int) to postgres, service_role;

-- >>> supabase/migrations/20260918120000_geo_enriquecido.sql
-- ---------------------------------------------------------------------------
-- Geolocalização enriquecida + fuso horário do visitante
-- ---------------------------------------------------------------------------
-- A Vercel injeta OITO headers de geo na borda e o código lia só três
-- (country, region, city). Os quatro que faltavam — postal-code, latitude,
-- longitude e timezone — são gratuitos em todos os planos (Hobby, Pro e
-- Enterprise), resolvidos antes da função rodar, sem credencial e sem chamada
-- de rede. Não usá-los era desperdício puro.
--
-- O que cada coluna destrava:
--   geo_postal_code -> o campo `zp` da Conversions API do Meta, que até agora
--                      ia VAZIO. É um parâmetro de correspondência a menos em
--                      todo evento enviado.
--   geo_latitude/longitude -> o mapa da fase 8c, com precisão de ponto em vez
--                      de só pintar o estado.
--   geo_timezone    -> responder "que horas eram PARA O USUÁRIO" quando ele não
--                      está no fuso de Brasília (Manaus, Rio Branco, exterior).
--
-- ⚠️ ORDEM OBRIGATÓRIA: rode esta migration ANTES do deploy. /api/identify e
-- /api/event passam a gravar estas colunas; sem elas o PostgREST recusa a
-- escrita e a captura para por completo. Mesma armadilha da fase 7.5.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------
-- `visitors` é a fonte do disparo: `event-dispatch.ts` lê esta linha no momento
-- do envio, então é daqui que o `zp` sai.
alter table public.visitors
  add column if not exists geo_postal_code text,
  add column if not exists geo_latitude    double precision,
  add column if not exists geo_longitude   double precision,
  add column if not exists geo_timezone    text;

-- `events_log` guarda o geo do INSTANTE do evento, não o atual do visitante.
-- A duplicação é proposital e já existia para country/region/city: uma pessoa
-- que comprou em viagem tem um PageView em um lugar e o Purchase em outro, e o
-- painel precisa mostrar cada evento onde ele realmente aconteceu.
alter table public.events_log
  add column if not exists geo_postal_code text,
  add column if not exists geo_latitude    double precision,
  add column if not exists geo_longitude   double precision,
  add column if not exists geo_timezone    text;

comment on column public.visitors.geo_postal_code is
  'CEP. Vem do header x-vercel-ip-postal-code (aproximado, área do provedor) ou, com precedência, do checkout via fill_visitor_pii.';
comment on column public.visitors.geo_timezone is
  'Fuso IANA do visitante (x-vercel-ip-timezone), ex.: America/Manaus. Exibição apenas — o painel agrega sempre em America/Sao_Paulo.';

-- ---------------------------------------------------------------------------
-- 2. fill_visitor_pii passa a aceitar o CEP do comprador
-- ---------------------------------------------------------------------------
-- POR QUE O CEP ENTRA AQUI E NÃO SÓ NO /api/identify: CEP derivado de IP aponta
-- a área do provedor, não o endereço da pessoa. O CEP digitado no checkout é o
-- dado de verdade. A regra de "só preenche buraco" desta função é justamente a
-- que dá a precedência certa — mas só se o derivado de IP NÃO tiver ocupado o
-- campo antes. Por isso o /api/identify grava o CEP de IP e este aqui o
-- substitui quando o de IP estava ausente; quando ambos existem, o primeiro
-- fica. É o mesmo compromisso já aceito para email e telefone.
--
-- `create or replace` NÃO adiciona parâmetro: criaria uma sobrecarga, e aí o
-- PostgREST passa a recusar a chamada por ambiguidade. O drop é obrigatório.
-- O parâmetro novo vai no FIM e tem default, então as chamadas posicionais
-- existentes (inclusive as de verify_phase7_5.sql) continuam válidas.
drop function if exists public.fill_visitor_pii(text, text, text, text, text, text);

create or replace function public.fill_visitor_pii(
  p_trck_user_id text,
  p_email text default null,
  p_email_hash text default null,
  p_phone_hash text default null,
  p_first_name_hash text default null,
  p_last_name_hash text default null,
  p_postal_code text default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filled text[] := '{}';
  v_row public.visitors;
begin
  select * into v_row
  from public.visitors
  where trck_user_id = p_trck_user_id
  for update;

  if not found then
    return v_filled;
  end if;

  -- `array_append`, e não `||`: com um literal sem tipo, o `||` é ambíguo
  -- entre concatenar dois arrays e anexar um elemento, e o Postgres tenta
  -- interpretar 'email_hash' como um text[] inteiro — "malformed array
  -- literal". O array_append não tem essa ambiguidade.
  if v_row.email is null and p_email is not null then
    v_filled := array_append(v_filled, 'email');
  end if;
  if v_row.email_hash is null and p_email_hash is not null then
    v_filled := array_append(v_filled, 'email_hash');
  end if;
  if v_row.phone_hash is null and p_phone_hash is not null then
    v_filled := array_append(v_filled, 'phone_hash');
  end if;
  if v_row.first_name_hash is null and p_first_name_hash is not null then
    v_filled := array_append(v_filled, 'first_name_hash');
  end if;
  if v_row.last_name_hash is null and p_last_name_hash is not null then
    v_filled := array_append(v_filled, 'last_name_hash');
  end if;
  if v_row.geo_postal_code is null and p_postal_code is not null then
    v_filled := array_append(v_filled, 'geo_postal_code');
  end if;

  if array_length(v_filled, 1) is null then
    return v_filled;
  end if;

  update public.visitors
  set email           = coalesce(email, p_email),
      email_hash      = coalesce(email_hash, p_email_hash),
      phone_hash      = coalesce(phone_hash, p_phone_hash),
      first_name_hash = coalesce(first_name_hash, p_first_name_hash),
      last_name_hash  = coalesce(last_name_hash, p_last_name_hash),
      geo_postal_code = coalesce(geo_postal_code, p_postal_code),
      identified_at   = coalesce(identified_at, now())
  where trck_user_id = p_trck_user_id;

  return v_filled;
end;
$$;

revoke all on function public.fill_visitor_pii(text, text, text, text, text, text, text) from public;
grant execute on function public.fill_visitor_pii(text, text, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Retenção: as colunas novas NÃO entram no purge
-- ---------------------------------------------------------------------------
-- `purge_old_event_payloads()` zera só os 4 jsonb pesados. Geo é texto curto e
-- é o que a tela de Eventos mostra depois que o payload já foi apagado — zerar
-- também o geo deixaria o evento antigo sem nenhuma informação útil. Nada a
-- alterar aqui; a nota existe para ninguém "consertar" isso depois.

-- >>> supabase/migrations/20260919090000_purchases_dados_comprador.sql
-- ============================================================================
-- Fase 8b · Leads — nome/telefone em texto puro na compra
-- ============================================================================
-- `NormalizedPurchase` (lib/webhooks/adapters/types.ts) já carrega
-- buyerFirstName/buyerLastName/buyerPhone vindos do adaptador de cada
-- plataforma, mas o webhook (app/api/webhook/compra/[platform]/route.ts) só
-- os usava para hashear (Meta CAPI) e depois os descartava — nunca gravava em
-- coluna nenhuma. `visitors` só tem os hashes (first_name_hash, last_name_hash,
-- phone_hash), irreversíveis por desenho. Resultado: um lead que comprou não
-- tinha como mostrar nome/telefone legível na ficha do painel.
--
-- Ficam nulas em toda compra já existente e em compra de lead que nunca
-- preencheu telefone/nome — e ficam nulas PARA SEMPRE nesses casos: não há
-- backfill a partir de `raw_webhook` (o formato é específico de cada
-- plataforma, frágil de reprocessar em massa). A ficha do lead mostra
-- "não recuperável" quando não há nenhuma compra com o dado preenchido — é
-- o estado esperado, não um bug.
--
-- ⚠️ ORDEM OBRIGATÓRIA: rode esta migration ANTES do deploy do webhook
-- atualizado. O upsert de `purchases` grava estas 3 colunas junto de todas as
-- outras numa única chamada — se a coluna não existir, o PostgREST rejeita a
-- linha inteira e a compra deixa de ser registrada. Mesma lição das fases 7.5
-- e de geo_enriquecido.
-- ============================================================================

alter table public.purchases
  add column if not exists buyer_first_name text,
  add column if not exists buyer_last_name  text,
  add column if not exists buyer_phone      text;

comment on column public.purchases.buyer_first_name is
  'Nome em texto puro do comprador NESTA transação — pode divergir entre '
  'compras do mesmo trck_user_id (ex.: presente para outra pessoa). A ficha '
  'do lead usa a compra mais recente que tiver o campo preenchido.';

comment on column public.purchases.buyer_phone is
  'Telefone em texto puro repassado pela plataforma no webhook. Existe só '
  'aqui — visitors não tem coluna equivalente, só phone_hash (irreversível).';

-- >>> supabase/migrations/20260919120000_purchases_forma_pagamento.sql
-- ============================================================================
-- Fase 8b · Vendas — forma de pagamento da compra
-- ============================================================================
-- A tela de Vendas quebra o faturamento por Cartão / Pix / Boleto / Outros, e
-- nada disso existia: `purchases` guardava só `amount` e `currency`, e o
-- adaptador do PerfectPay nunca leu o campo. O dado estava chegando e sendo
-- descartado — sobrevivia apenas dentro de `raw_webhook`.
--
-- DUAS COLUNAS, não uma, espelhando exatamente o par `status` /
-- `platform_status` que já existe nesta tabela:
--
--   payment_method          -> enum canônico nosso, é o que a tela agrupa
--   platform_payment_method -> o valor bruto como a plataforma mandou
--
-- O bruto não é redundância: `payment_type_enum` do PerfectPay distingue
-- google_pay, apple_pay, picpay, paypal e open_finance, que aqui viram todos
-- `other`. Guardando o bruto, recuperar essa granularidade depois é uma
-- consulta, não uma migration com perda de histórico.
--
-- NULL É PERMITIDO, e é diferente de 'other': `null` = "a plataforma não
-- informou" (ou a linha é anterior a esta migration); `other` = "informou algo
-- que não é cartão, boleto nem Pix". A tela mostra "Não informado" no primeiro
-- caso. Um CHECK sem NULL obrigaria a mentir num dos dois sentidos.
--
-- ⚠️ ORDEM OBRIGATÓRIA: rode esta migration ANTES do deploy.
-- O upsert de `purchases` (app/api/webhook/compra/[platform]/route.ts) grava
-- estas 2 colunas junto de todas as outras numa chamada só. Sem elas, o
-- PostgREST rejeita A LINHA INTEIRA e a compra deixa de ser registrada —
-- mesma lição das fases 7.5, geo_enriquecido e 20260919090000.
-- ============================================================================

alter table public.purchases
  add column if not exists payment_method          text,
  add column if not exists platform_payment_method text;

-- `not valid` não é usado de propósito: a tabela é pequena e a validação
-- imediata é o que garante que o backfill abaixo não escreva valor fora do
-- vocabulário.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'purchases_payment_method_check'
  ) then
    alter table public.purchases
      add constraint purchases_payment_method_check
      check (payment_method in ('credit_card', 'billet', 'pix', 'other'));
  end if;
end $$;

create index if not exists purchases_payment_method_idx
  on public.purchases (payment_method);

comment on column public.purchases.payment_method is
  'Forma de pagamento canônica: credit_card | billet | pix | other. NULL = a '
  'plataforma não informou (ou a compra é anterior à migration), que é '
  'diferente de ''other'' (informou algo fora dos três). A tela de Vendas '
  'distingue os dois casos.';

comment on column public.purchases.platform_payment_method is
  'Valor bruto da forma de pagamento como a plataforma mandou (ex.: "7" para '
  'Pix no PerfectPay). Preservado para auditoria e para recuperar a '
  'granularidade que o enum canônico agrupa em ''other'' — google_pay, '
  'apple_pay, picpay, paypal, open_finance — sem precisar de migration nova.';

-- ---------------------------------------------------------------------------
-- Backfill a partir de `raw_webhook`
-- ---------------------------------------------------------------------------
-- Específico do PerfectPay (por isso o filtro em `platform`): o formato de
-- `raw_webhook` é de cada plataforma, e aplicar este mapa às outras produziria
-- dado errado em silêncio.
--
-- Hoje isto quase não atinge nada — o banco só tem linhas de `npm run seed` —
-- mas cobre qualquer venda real que chegue entre a aplicação desta migration e
-- o deploy do código novo, que é exatamente a janela em que a coluna existe e
-- o adaptador ainda não a preenche.
--
-- `payment_type_enum` oficial (app.perfectpay.com.br/docs/api.json):
--   1 credit_card · 2 billet · 3 paypal · 4 credit_card_recurrent
--   5 free_price · 6 credit_card_upsell · 7 pix · 8 billet_installments
--   9 open_finance · 10 google_pay · 11 apple_pay · 12 picpay · 16 amazon_pay
-- ---------------------------------------------------------------------------
update public.purchases
set
  platform_payment_method = raw_webhook ->> 'payment_type_enum',
  payment_method = case raw_webhook ->> 'payment_type_enum'
    when '1' then 'credit_card'
    when '4' then 'credit_card'
    when '6' then 'credit_card'
    when '2' then 'billet'
    when '8' then 'billet'
    when '7' then 'pix'
    else 'other'
  end
where platform = 'perfectpay'
  and payment_method is null
  and raw_webhook ->> 'payment_type_enum' is not null;

-- >>> supabase/migrations/20260921130000_stripe_integration.sql
-- ============================================================================
-- Integrações · Stripe
-- ============================================================================
-- Duas coisas, nesta ordem:
--
-- 1. `purchases.platform` passa a aceitar 'stripe'. A constraint original
--    (20260916140100_tables.sql) previa só perfectpay/hotmart/kiwify/eduzz.
--    Diferente das duas últimas migrations desta tabela, aqui a constraint já
--    EXISTE — por isso `drop constraint if exists` + `add constraint`, que é
--    idempotente e sobrevive a rodar o setup.sql mais de uma vez.
--
-- 2. `stripe_accounts`: singleton, como `settings` (`id boolean` + CHECK), e
--    não uma lista como meta_pixels/ga4_accounts/meta_ad_accounts. A
--    arquitetura é um cliente por deploy, e é um Stripe por cliente — o mesmo
--    motivo de o PerfectPay já ser tratado como único.
--
--    DUAS colunas de Vault, não uma. É a diferença estrutural em relação às
--    outras 3 tabelas de credencial, e não é arbitrária: as duas credenciais
--    do Stripe têm papéis opostos.
--
--      secret_key_vault_id      -> autentica NOSSAS chamadas à API do Stripe
--                                  (hoje, só o teste de conexão)
--      webhook_secret_vault_id  -> verifica a assinatura HMAC do que o Stripe
--                                  manda PRA GENTE. É o que prova que o
--                                  payload não foi forjado.
--
--    Os dois ficam no Vault (reversíveis) e não como hash, ao contrário do
--    `settings.webhook_token_hash`: o token de webhook nosso só precisa ser
--    COMPARADO, mas o signing secret do Stripe precisa ser USADO como chave de
--    HMAC a cada requisição. Hash não serviria.
--
-- ⚠️ ORDEM OBRIGATÓRIA: rode esta migration ANTES do deploy.
-- O adaptador do Stripe grava `platform = 'stripe'` no mesmo upsert de sempre
-- (app/api/webhook/compra/[platform]/route.ts). Sem o CHECK novo, o Postgres
-- recusa A LINHA INTEIRA e a venda não é registrada — mesma lição das fases
-- 7.5, geo_enriquecido, 20260919090000 e 20260919120000.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. purchases.platform aceita 'stripe'
-- ----------------------------------------------------------------------------
alter table public.purchases
  drop constraint if exists purchases_platform_check;

alter table public.purchases
  add constraint purchases_platform_check
  check (platform in ('perfectpay', 'hotmart', 'kiwify', 'eduzz', 'stripe'));

-- ----------------------------------------------------------------------------
-- 2. stripe_accounts (linha única / singleton)
-- ----------------------------------------------------------------------------
create table if not exists public.stripe_accounts (
  id boolean primary key default true,
  constraint stripe_accounts_singleton check (id),
  is_active boolean not null default false,
  secret_key_vault_id uuid,
  webhook_secret_vault_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stripe_accounts is
  'Linha única com as credenciais do Stripe (singleton, como settings). '
  'secret_key_vault_id autentica chamadas nossas à API do Stripe; '
  'webhook_secret_vault_id verifica a assinatura HMAC dos webhooks que o '
  'Stripe envia. São papéis diferentes, por isso duas colunas de Vault e não '
  'uma como nas outras 3 tabelas de credencial.';

comment on column public.stripe_accounts.is_active is
  'Desligado NÃO bloqueia o webhook — a assinatura continua sendo verificada e '
  'a venda continua sendo gravada. Serve para a tela de Integrações mostrar o '
  'estado da conexão e para o operador marcar que aquela conta saiu de uso.';

-- RLS sem NENHUMA política de SELECT, nem para `authenticated` — mesmo padrão
-- de settings/ga4_accounts/meta_pixels/meta_ad_accounts (fase 2). Toda leitura
-- passa por Server Action com service_role (lib/settings/queries.ts).
alter table public.stripe_accounts enable row level security;

revoke all on public.stripe_accounts from anon, authenticated;

drop trigger if exists set_updated_at on public.stripe_accounts;
create trigger set_updated_at before update on public.stripe_accounts
  for each row execute function public.set_updated_at();

-- >>> supabase/migrations/20260922140000_allowed_origins.sql
-- Allowlist de CORS editável no painel (Configurações → Geral).
--
-- Soma-se à variável TRACKING_ALLOWED_ORIGINS, não a substitui: allowlist
-- final = variável ∪ esta coluna. A variável continua sendo a rede de
-- segurança, e mudar esta coluna vale em até 60s, sem deploy novo.
--
-- Sem CHECK, como dispatch_immediate_events: o formato (só esquema + host,
-- sem caminho nem barra final) é validado na Server Action que grava.
--
-- Esquecer de rodar esta migration NÃO derruba a captura: a leitura cai no
-- fallback de lista vazia e a variável segue valendo. Só o botão de salvar
-- do painel falha até ela ser aplicada.

alter table public.settings
  add column if not exists allowed_origins text[] not null default '{}';

-- >>> supabase/migrations/20260923120000_cron_health.sql
-- ============================================================================
-- Saúde do cron de despacho (aditiva a fase 7.5)
-- ============================================================================
-- Cole no SQL Editor do Supabase e rode, como as migrations anteriores.
--
-- DIFERENTE DAS OUTRAS: esta é só leitura e só aditiva. Se você ainda não
-- rodou, nada quebra — a tela de Eventos → aba Delay simplesmente não mostra
-- o indicador de saúde do pg_cron ainda (a chamada RPC erra, e o código do
-- painel trata isso como "sem registro", não como erro). Não há uma ordem
-- obrigatória migration-antes-do-deploy aqui, ao contrário de
-- 20260917190000_event_queue.sql e 20260918120000_geo_enriquecido.sql.
--
-- POR QUE ISTO EXISTE: `tick_event_queue()` roda a cada minuto mesmo quando
-- não há evento vencido (só pula o `net.http_post` nesse caso) — então a
-- última linha de `cron.job_run_details` para o job
-- 'dispatch_event_queue_minutely' é um heartbeat honesto de "o pg_cron está
-- vivo e agendado". Isso é diferente de `event_queue_depth()` (fase 7.5, que
-- diz se o Meta está de fato recebendo os eventos) — os dois sinais juntos é
-- que respondem "por que a fila não drena", sem precisar abrir o SQL Editor.
-- ============================================================================

create or replace function public.dispatch_cron_status()
returns table (last_run_at timestamptz)
language sql
security definer
stable
set search_path = ''
as $$
  select jrd.start_time
  from cron.job_run_details jrd
  join cron.job j on j.jobid = jrd.jobid
  where j.jobname = 'dispatch_event_queue_minutely'
  order by jrd.start_time desc
  limit 1;
$$;

revoke all on function public.dispatch_cron_status() from public;
grant execute on function public.dispatch_cron_status() to service_role;

-- >>> supabase/migrations/20260923130000_remove_default_phone_country.sql
-- ============================================================================
-- Remove settings.default_phone_country
-- ============================================================================
-- O país do telefone deixou de ser um campo do painel. Numa compra ele vem da
-- moeda da transação (obterPaisDaMoeda, lib/webhooks/adapters/index.ts); sem
-- compra (/api/identify), da env var TRACKING_DEFAULT_PHONE_COUNTRY
-- (lib/phone-country.ts), uma por deploy.
--
-- Nenhuma policy, trigger ou default de outra coluna depende desta: a RLS de
-- settings é por tabela e o set_updated_at não olha colunas. O único objeto
-- ligado a ela é o CHECK settings_phone_country_check, que só referencia esta
-- coluna. Ele cairia junto com o DROP COLUMN; sai explicitamente antes só para
-- a intenção ficar escrita.
--
-- ORDEM: deploy do código novo PRIMEIRO, esta migration DEPOIS. O código
-- antigo ainda seleciona e grava a coluna; com ela removida, salvar a aba Delay
-- falha e getDispatchConfig() cai no padrão (perde modo, janela e
-- test_event_code) até o deploy sair.
-- ============================================================================

alter table public.settings
  drop constraint if exists settings_phone_country_check;

alter table public.settings
  drop column if exists default_phone_country;
