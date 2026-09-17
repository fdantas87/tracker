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
