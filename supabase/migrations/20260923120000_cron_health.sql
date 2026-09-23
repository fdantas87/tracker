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
