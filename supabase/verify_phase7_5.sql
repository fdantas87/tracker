-- ============================================================================
-- Verificação da fase 7.5 — fila de disparo atrasado
-- ============================================================================
-- Rode DEPOIS de aplicar `migrations/20260917190000_event_queue.sql`.
-- Não é migration: é só leitura (mais uma linha de teste que é apagada no fim).
-- Cada bloco avisa OK ou levanta exceção com FALHOU.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A extensão pg_net precisa existir — sem ela o cron não chama nada
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'FALHOU: extensão pg_net não está habilitada. Database -> Extensions -> pg_net.';
  end if;
  raise notice 'OK: pg_net habilitado.';
end
$$;

-- ----------------------------------------------------------------------------
-- 2. Colunas novas em events_log
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(needed, ', ')
    into v_missing
  from (
    values ('dispatch_status'), ('dispatch_after'), ('dispatch_attempts'),
           ('dispatch_claimed_at'), ('dispatched_at'), ('dispatch_error'),
           ('event_time'), ('event_source_url'), ('custom_data'),
           ('action_source'), ('pixel_fired')
  ) as t(needed)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events_log'
      and column_name = t.needed
  );

  if v_missing is not null then
    raise exception 'FALHOU: faltam colunas em events_log: %', v_missing;
  end if;
  raise notice 'OK: events_log tem as 11 colunas da fila.';
end
$$;

-- ----------------------------------------------------------------------------
-- 3. O PASSADO NÃO PODE ENTRAR NA FILA
-- ----------------------------------------------------------------------------
-- Este é o cheque mais importante da migration. Se `dispatch_status` tivesse
-- nascido com default 'pending', todo evento histórico seria reenviado ao Meta
-- no primeiro tique do cron — contando tudo em dobro.
do $$
declare
  v_pending bigint;
  v_default text;
begin
  select count(*) into v_pending
  from public.events_log
  where dispatch_status = 'pending'
    and created_at < now() - interval '1 hour';

  if v_pending > 0 then
    raise exception
      'FALHOU: % eventos antigos estão como pending e seriam reenviados ao Meta. '
      'Rode: update public.events_log set dispatch_status = ''sent'' '
      'where dispatch_status = ''pending'' and created_at < now() - interval ''1 hour'';',
      v_pending;
  end if;

  -- E o default tem que ser 'pending' pros eventos NOVOS.
  select column_default into v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'events_log'
    and column_name = 'dispatch_status';

  if v_default is null or v_default not like '%pending%' then
    raise exception 'FALHOU: o default de dispatch_status deveria ser ''pending'', está: %', v_default;
  end if;

  raise notice 'OK: histórico quitado e eventos novos nascem pending.';
end
$$;

-- ----------------------------------------------------------------------------
-- 4. Índice parcial da fila
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'events_log_dispatch_queue_idx'
  ) then
    raise exception 'FALHOU: índice events_log_dispatch_queue_idx não existe.';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'visitors_phone_hash_idx'
  ) then
    raise exception 'FALHOU: índice visitors_phone_hash_idx não existe.';
  end if;
  raise notice 'OK: índices da fila e de phone_hash criados.';
end
$$;

-- ----------------------------------------------------------------------------
-- 5. Colunas e limites de settings
-- ----------------------------------------------------------------------------
do $$
declare
  v_mode text;
  v_delay int;
begin
  select dispatch_mode, dispatch_delay_seconds
    into v_mode, v_delay
  from public.settings where id = true;

  if v_mode is null then
    raise exception 'FALHOU: settings.dispatch_mode não existe ou está nulo.';
  end if;
  if v_mode not in ('adaptive', 'server_only', 'hybrid') then
    raise exception 'FALHOU: dispatch_mode com valor inesperado: %', v_mode;
  end if;

  -- O CHECK tem que recusar valor fora da faixa.
  begin
    update public.settings set dispatch_delay_seconds = 99999 where id = true;
    raise exception 'FALHOU: o CHECK de dispatch_delay_seconds aceitou 99999.';
  exception
    when check_violation then
      raise notice 'OK: CHECK de dispatch_delay_seconds recusa valor fora da faixa.';
  end;

  begin
    update public.settings set dispatch_mode = 'invalido' where id = true;
    raise exception 'FALHOU: o CHECK de dispatch_mode aceitou valor inválido.';
  exception
    when check_violation then
      raise notice 'OK: CHECK de dispatch_mode recusa valor inválido.';
  end;

  raise notice 'OK: settings tem a configuração da fila (modo=%, janela=%s).', v_mode, v_delay;
end
$$;

-- ----------------------------------------------------------------------------
-- 6. As 4 funções novas respondem
-- ----------------------------------------------------------------------------
do $$
declare
  v_count int;
  v_depth record;
begin
  -- claim_pending_events com a fila vazia devolve zero linhas, sem erro.
  select count(*) into v_count from public.claim_pending_events(0);
  raise notice 'OK: claim_pending_events responde (% linhas com limite 0).', v_count;

  select public.flush_visitor_events('__inexistente__') into v_count;
  if v_count <> 0 then
    raise exception 'FALHOU: flush_visitor_events devolveu % pra visitante inexistente.', v_count;
  end if;
  raise notice 'OK: flush_visitor_events responde.';

  if array_length(public.fill_visitor_pii('__inexistente__', 'a@b.com'), 1) is not null then
    raise exception 'FALHOU: fill_visitor_pii preencheu algo pra visitante inexistente.';
  end if;
  raise notice 'OK: fill_visitor_pii responde e não inventa visitante.';

  select * into v_depth from public.event_queue_depth();
  raise notice 'OK: event_queue_depth responde (pending=%, due=%, failed=%).',
    v_depth.pending, v_depth.due, v_depth.failed;
end
$$;

-- ----------------------------------------------------------------------------
-- 7. fill_visitor_pii só preenche buraco, nunca sobrescreve
-- ----------------------------------------------------------------------------
do $$
declare
  v_filled text[];
  v_email text;
begin
  insert into public.visitors (trck_user_id, email)
  values ('__verify_phase75__', 'primeiro@exemplo.com');

  -- Email já existe: não deve ser trocado. Telefone está vazio: deve entrar.
  v_filled := public.fill_visitor_pii(
    '__verify_phase75__', 'segundo@exemplo.com', 'hash_email', 'hash_phone'
  );

  select email into v_email from public.visitors
  where trck_user_id = '__verify_phase75__';

  if v_email <> 'primeiro@exemplo.com' then
    raise exception 'FALHOU: o email existente foi sobrescrito (virou %).', v_email;
  end if;
  if not ('phone_hash' = any(v_filled)) then
    raise exception 'FALHOU: phone_hash estava vazio e não foi preenchido. Preencheu: %', v_filled;
  end if;
  if 'email' = any(v_filled) then
    raise exception 'FALHOU: reportou ter preenchido o email, que já existia.';
  end if;

  raise notice 'OK: fill_visitor_pii preencheu % e preservou o email antigo.', v_filled;

  delete from public.visitors where trck_user_id = '__verify_phase75__';
end
$$;

-- ----------------------------------------------------------------------------
-- 8. Antiveneno de lote: evento velho é descartado, não enviado
-- ----------------------------------------------------------------------------
-- O Meta rejeita a REQUISIÇÃO INTEIRA se qualquer event_time do lote passar de
-- 7 dias. Um evento esquecido na fila derrubaria os eventos novos junto.
do $$
declare
  v_status text;
begin
  insert into public.visitors (trck_user_id) values ('__verify_phase75_old__');
  insert into public.events_log
    (trck_user_id, event_name, event_id, event_time, dispatch_status, dispatch_after)
  values
    ('__verify_phase75_old__', 'PageView', '__verify_phase75_old_event__',
     now() - interval '8 days', 'pending', now() - interval '8 days');

  -- Limite 0 de propósito: a varredura de eventos vencidos roda de qualquer
  -- jeito, mas nenhum evento REAL é reivindicado. Chamar com limite > 0 aqui
  -- marcaria eventos de produção como 'sending' sem ninguém pra enviá-los, e
  -- eles ficariam presos até o reaper devolvê-los 5 minutos depois.
  perform public.claim_pending_events(0);

  select dispatch_status into v_status from public.events_log
  where event_id = '__verify_phase75_old_event__';

  if v_status <> 'skipped' then
    raise exception
      'FALHOU: evento com 8 dias ficou como "%" em vez de "skipped" — ele '
      'envenenaria o lote inteiro no Meta.', v_status;
  end if;
  raise notice 'OK: evento fora da janela de 7 dias é descartado antes do lote.';

  delete from public.visitors where trck_user_id = '__verify_phase75_old__';
end
$$;

-- ----------------------------------------------------------------------------
-- 9. O cron está agendado e ativo
-- ----------------------------------------------------------------------------
do $$
declare
  v_active boolean;
  v_schedule text;
begin
  select active, schedule into v_active, v_schedule
  from cron.job where jobname = 'dispatch_event_queue_minutely';

  if v_active is null then
    raise exception 'FALHOU: job dispatch_event_queue_minutely não está agendado.';
  end if;
  if not v_active then
    raise exception 'FALHOU: job dispatch_event_queue_minutely está inativo.';
  end if;
  raise notice 'OK: cron dispatch_event_queue_minutely ativo (%).', v_schedule;
end
$$;

-- ----------------------------------------------------------------------------
-- 10. tick_event_queue sai quieto quando o painel ainda não foi configurado
-- ----------------------------------------------------------------------------
-- Sem isso, o log do cron encheria de erro a cada minuto entre a migration e
-- a geração do token no painel.
do $$
declare
  v_configured boolean;
  v_result bigint;
begin
  select dispatch_cron_url is not null and dispatch_cron_token_vault_id is not null
    into v_configured
  from public.settings where id = true;

  if v_configured then
    raise notice 'OK: URL e token do cron já configurados no painel.';
  else
    v_result := public.tick_event_queue();
    if v_result is not null then
      raise exception 'FALHOU: tick_event_queue tentou chamar a URL sem estar configurada.';
    end if;
    raise notice
      'OK: tick_event_queue sai quieto sem configuração. FALTA FAZER: no painel, '
      'aba Disparo, preencha a URL do cron e gere o token — até lá a fila não drena.';
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 11. Retenção passou a limpar custom_data
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'purge_old_event_payloads'
      and pg_get_functiondef(p.oid) like '%custom_data%'
  ) then
    raise exception 'FALHOU: purge_old_event_payloads não zera custom_data.';
  end if;
  raise notice 'OK: job de retenção inclui custom_data.';
end
$$;

-- ----------------------------------------------------------------------------
-- Estado final, pra olho humano
-- ----------------------------------------------------------------------------
select dispatch_status, count(*) as eventos
from public.events_log
group by dispatch_status
order by dispatch_status;
