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
