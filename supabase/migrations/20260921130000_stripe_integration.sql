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
