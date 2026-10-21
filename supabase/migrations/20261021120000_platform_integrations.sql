-- ============================================================================
-- Integrações · estado por plataforma (PerfectPay, Bask)
-- ============================================================================
-- PerfectPay e Bask não guardam credencial própria (usam o token global de
-- webhook), então até aqui não havia onde gravar "este projeto usa esta
-- plataforma". A tela de Integrações inferia a PerfectPay do token global e
-- mostrava o card em TODO projeto com token, use ele PerfectPay ou não.
--
-- Uma linha por plataforma. Sem linha = desativada: projeto novo nasce com
-- todas apagadas. Desativar mantém a linha (a configuração fica gravada) e faz
-- o webhook daquela plataforma ser ignorado (200, nada gravado).
--
-- O Stripe continua em `stripe_accounts.is_active`, que já existe e mora ao
-- lado das credenciais dele.
--
-- Tabela própria, e não coluna em `settings`: `settings` nasce vazia (a linha
-- só existe depois de gerar o token de webhook), então o estado não poderia
-- ser gravado antes disso.
--
-- ⚠️ ORDEM: rode ANTES do deploy. Sem a tabela, a tela mostra tudo desativado
-- e o webhook deixa passar (falha aberto, para não perder venda).
-- ============================================================================

create table if not exists public.platform_integrations (
  platform text primary key
    check (platform in ('perfectpay', 'bask')),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.platform_integrations is
  'Estado de cada plataforma de venda sem credencial própria. Sem linha ou '
  'is_active = false: o webhook da plataforma é ignorado (200, nada gravado).';

-- Mesmo padrão das tabelas de credencial: nenhuma política, leitura só por
-- service_role (lib/settings/queries.ts e a rota do webhook).
alter table public.platform_integrations enable row level security;

revoke all on public.platform_integrations from anon, authenticated;

drop trigger if exists set_updated_at on public.platform_integrations;
create trigger set_updated_at before update on public.platform_integrations
  for each row execute function public.set_updated_at();

-- Projetos que já recebem vendas não podem ter o webhook cortado pelo deploy:
-- quem já tem venda de uma plataforma nasce com ela ativa. No-op em banco vazio.
insert into public.platform_integrations (platform, is_active)
select distinct platform, true
from public.purchases
where platform in ('perfectpay', 'bask')
on conflict (platform) do nothing;

-- O Stripe passa a seguir a mesma regra: desligado bloqueia o webhook.
comment on column public.stripe_accounts.is_active is
  'Desligado bloqueia o webhook do Stripe (200, nada gravado). As credenciais '
  'continuam no Vault; religar volta a aceitar na hora.';
