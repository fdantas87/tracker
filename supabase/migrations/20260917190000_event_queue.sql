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

  if v_row.email is null and p_email is not null then
    v_filled := v_filled || 'email';
  end if;
  if v_row.email_hash is null and p_email_hash is not null then
    v_filled := v_filled || 'email_hash';
  end if;
  if v_row.phone_hash is null and p_phone_hash is not null then
    v_filled := v_filled || 'phone_hash';
  end if;
  if v_row.first_name_hash is null and p_first_name_hash is not null then
    v_filled := v_filled || 'first_name_hash';
  end if;
  if v_row.last_name_hash is null and p_last_name_hash is not null then
    v_filled := v_filled || 'last_name_hash';
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
