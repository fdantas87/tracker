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
