-- ============================================================================
-- Integrações · Microsoft Clarity
-- ============================================================================
-- Um projeto Clarity por deploy, como o Stripe. Três peças:
--
-- 1. `clarity_accounts` (singleton). Duas credenciais de natureza oposta:
--
--      project_id          -> PÚBLICO. Vai no script do navegador
--                             (clarity.ms/tag/<id>) e nos links para o painel
--                             do Clarity. Coluna comum, como meta_pixels.pixel_id.
--      api_token_vault_id  -> SEGREDO. Token da Data Export API (JWT gerado em
--                             Settings → Data Export). Só o servidor usa, para a
--                             sincronização diária. Vault, como todo segredo
--                             reversível do projeto.
--
--    O token é opcional: só com o project_id o script já grava sessões e mapas
--    de calor no Clarity. O token é o que traz os KPIs para dentro do painel.
--
--    `mcp_token_hash` protege o /api/mcp do próprio deploy. Só o SHA-256, igual
--    a `settings.webhook_token_hash`: o valor bruto é mostrado uma vez e nunca
--    mais existe em lugar nenhum.
--
-- 2. `clarity_snapshots`: a resposta CRUA de cada chamada à API, em jsonb.
--    A API só olha 1 a 3 dias para trás e aceita 10 chamadas por dia por
--    projeto. Sem guardar, não existiria tendência nem período de 7/30 dias, e
--    cada abertura da tela gastaria cota. A tela e o MCP leem daqui; quem fala
--    com o Clarity é só a sincronização.
--
--    Cru, e não normalizado em colunas, de propósito: só o formato da métrica
--    Traffic está documentado. Guardar o jsonb deixa a leitura evoluir sem
--    migration nova quando o formato real das outras métricas for conferido.
--
-- 3. O contador da cota (`calls_day`/`calls_count`) e o cron diário.
--
-- ORDEM: migration ANTES do deploy é o recomendado, mas a captura sobrevive
-- sem ela — /api/config/public trata a ausência da tabela como "Clarity
-- desligado" em vez de devolver 503.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. clarity_accounts (linha única / singleton)
-- ----------------------------------------------------------------------------
create table if not exists public.clarity_accounts (
  id boolean primary key default true,
  constraint clarity_accounts_singleton check (id),
  is_active boolean not null default true,
  -- Formato real: 10 caracteres minúsculos, ex. "3t0wlogvdz". A folga no
  -- tamanho evita recusar um ID legítimo se o Clarity mudar o comprimento; o
  -- que importa é não aceitar texto livre, porque o ID vai interpolado numa
  -- URL de script carregada em todo site do cliente.
  project_id text not null
    constraint clarity_accounts_project_id_format check (project_id ~ '^[a-z0-9]{6,20}$'),
  api_token_vault_id uuid,
  mcp_token_hash text,
  last_sync_at timestamptz,
  -- ok | parcial | erro | sem_cota
  last_sync_status text,
  last_sync_error text,
  -- Contador da cota diária da Data Export API (10/dia/projeto). O dia é em
  -- UTC porque a API responde em UTC; a documentação não diz quando a cota
  -- vira, e o teto que usamos (abaixo de 10) absorve essa incerteza.
  calls_day date,
  calls_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.clarity_accounts is
  'Linha única com a conexão do Microsoft Clarity. project_id é público (vai no '
  'script do site); api_token_vault_id é o token da Data Export API, no Vault; '
  'mcp_token_hash é o SHA-256 do token do /api/mcp deste deploy.';

alter table public.clarity_accounts enable row level security;
revoke all on public.clarity_accounts from anon, authenticated;

drop trigger if exists set_updated_at on public.clarity_accounts;
create trigger set_updated_at before update on public.clarity_accounts
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. clarity_snapshots
-- ----------------------------------------------------------------------------
create table if not exists public.clarity_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  -- 1, 2 ou 3: a janela que a API cobriu, contada para trás a partir de
  -- captured_at (últimas 24/48/72 h, em UTC).
  num_days smallint not null check (num_days between 1 and 3),
  -- none | device | channel | country | url
  dimension_key text not null,
  -- manual = "Atualizar agora" ou teste de conexão; cron = sincronização diária.
  origin text not null default 'cron' check (origin in ('cron', 'manual')),
  payload jsonb not null
);

create index if not exists clarity_snapshots_dim_captured_idx
  on public.clarity_snapshots (dimension_key, captured_at desc);

comment on table public.clarity_snapshots is
  'Resposta crua de cada chamada à Data Export API do Clarity. A tela e o MCP '
  'leem daqui; só a sincronização fala com o Clarity, porque a cota é de 10 '
  'chamadas por dia por projeto.';

-- Mesmo padrão das tabelas de credencial: sem policy nenhuma, leitura só pelo
-- servidor com service_role (lib/clarity/queries.ts).
alter table public.clarity_snapshots enable row level security;
revoke all on public.clarity_snapshots from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Reserva atômica de uma chamada da cota
-- ----------------------------------------------------------------------------
-- Devolve o número da chamada reservada (1, 2, ...) ou NULL quando o teto do
-- dia já foi atingido. Um UPDATE só, então duas sincronizações simultâneas
-- (cron + "Atualizar agora") não conseguem passar do teto juntas.
create or replace function public.clarity_reserve_call(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  update public.clarity_accounts
     set calls_count = case when calls_day = v_today then calls_count + 1 else 1 end,
         calls_day = v_today
   where id = true
     and (calls_day is distinct from v_today or calls_count < p_limit)
  returning calls_count into v_count;

  return v_count;
end;
$$;

revoke all on function public.clarity_reserve_call(integer) from public;
grant execute on function public.clarity_reserve_call(integer) to service_role;

-- ----------------------------------------------------------------------------
-- 4. O tique diário
-- ----------------------------------------------------------------------------
-- Mesmo desenho de tick_event_queue() (migration ..._event_queue.sql): o
-- Postgres só acorda o endpoint, o trabalho é TypeScript. Reaproveita a URL e
-- o token do cron que o painel já autoconfigura (lib/settings/cron-autoconfig.ts),
-- trocando só o caminho — nenhuma credencial nova.
--
-- Não dá para pendurar a sincronização no tique do dispatch: ele só chama o
-- endpoint quando há evento vencido na fila.
create or replace function public.tick_clarity_sync()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_vault_id uuid;
  v_token text;
begin
  select dispatch_cron_url, dispatch_cron_token_vault_id
    into v_url, v_vault_id
  from public.settings
  where id = true;

  if v_url is null or v_vault_id is null then
    return null;
  end if;

  -- Sem Clarity conectado com token, não há o que sincronizar.
  if not exists (
    select 1 from public.clarity_accounts
     where id = true and is_active and api_token_vault_id is not null
  ) then
    return null;
  end if;

  v_token := public.reveal_secret(v_vault_id);
  if v_token is null then
    return null;
  end if;

  return net.http_post(
    url := replace(v_url, '/api/cron/dispatch', '/api/cron/clarity'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public.tick_clarity_sync() from public;
grant execute on function public.tick_clarity_sync() to postgres, service_role;

-- 06:00 UTC = 03:00 em Brasília. Horário FIXO é o que mantém as janelas de 24 h
-- adjacentes de um dia para o outro (numOfDays=1 é rolante, não dia de
-- calendário).
select cron.schedule(
  'clarity_sync_daily',
  '0 6 * * *',
  $cron$ select public.tick_clarity_sync(); $cron$
);

-- ----------------------------------------------------------------------------
-- 5. Retenção
-- ----------------------------------------------------------------------------
-- ~5 linhas por dia: o volume é pequeno, mas não infinito. 400 dias cobrem a
-- comparação com o mesmo período do ano anterior.
select cron.schedule(
  'clarity_snapshots_retention_daily',
  '30 4 * * *',
  $cron$ delete from public.clarity_snapshots where captured_at < now() - interval '400 days'; $cron$
);
