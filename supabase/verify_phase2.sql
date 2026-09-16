-- ============================================================================
-- Verificação da Fase 2 — rode DEPOIS dos 5 arquivos de migration, no mesmo
-- SQL Editor, tudo de uma vez. Não altera nada (o teste de Vault no fim cria
-- e depois apaga um segredo de teste). Cada bloco imprime um NOTICE "OK: ..."
-- ou "FALHOU: ...". Se aparecer qualquer "FALHOU", cole aqui pra eu ver.
-- ============================================================================

-- 1) Tabelas de credenciais: têm `revoke all` de anon/authenticated (fase 3
--    das migrations), então uma leitura deve dar ERRO de permissão — não
--    resultado vazio. Testamos isso com anon; o mesmo vale pra authenticated.
do $$
begin
  set role anon;
  begin
    perform count(*) from public.ga4_accounts;
    raise exception 'FALHOU: anon conseguiu ler ga4_accounts (deveria ser bloqueado)';
  exception
    when insufficient_privilege then
      raise notice 'OK: anon bloqueado em ga4_accounts (permission denied), como esperado';
  end;
  reset role;
end;
$$;

do $$
begin
  set role authenticated;
  begin
    perform count(*) from public.meta_pixels;
    raise exception 'FALHOU: authenticated conseguiu ler meta_pixels (deveria ser bloqueado)';
  exception
    when insufficient_privilege then
      raise notice 'OK: authenticated bloqueado em meta_pixels (permission denied), como esperado';
  end;
  reset role;
end;
$$;

do $$
begin
  set role authenticated;
  begin
    perform count(*) from public.settings;
    raise exception 'FALHOU: authenticated conseguiu ler settings (deveria ser bloqueado)';
  exception
    when insufficient_privilege then
      raise notice 'OK: authenticated bloqueado em settings (permission denied), como esperado';
  end;
  reset role;
end;
$$;

-- 2) Tabelas de dados do dashboard: authenticated tem política de SELECT e
--    deve conseguir ler (0 linhas, mas SEM erro de permissão).
do $$
declare
  v_count int;
begin
  set role authenticated;
  select count(*) into v_count from public.visitors;
  select count(*) into v_count from public.events_log;
  select count(*) into v_count from public.purchases;
  reset role;
  raise notice 'OK: authenticated leu visitors/events_log/purchases sem erro (tabelas vazias, esperado)';
end;
$$;

-- 3) anon não tem política nenhuma nessas 3 tabelas (só revoke de escrita,
--    SELECT continua com grant, mas RLS filtra tudo) — deve rodar sem erro e
--    devolver 0 linhas, nunca ver dado de verdade.
do $$
declare
  v_count int;
begin
  set role anon;
  select count(*) into v_count from public.visitors;
  reset role;
  if v_count = 0 then
    raise notice 'OK: anon lê visitors sem erro e vê 0 linhas (RLS filtrando), como esperado';
  else
    raise exception 'FALHOU: anon viu % linha(s) em visitors — RLS não está filtrando', v_count;
  end if;
end;
$$;

-- 4) Confirma que o job de retenção foi agendado.
do $$
declare
  v_active boolean;
begin
  select active into v_active from cron.job where jobname = 'purge_old_event_payloads_daily';
  if v_active is null then
    raise exception 'FALHOU: job purge_old_event_payloads_daily não encontrado em cron.job';
  elsif not v_active then
    raise exception 'FALHOU: job purge_old_event_payloads_daily existe mas está inativo';
  else
    raise notice 'OK: job purge_old_event_payloads_daily agendado e ativo';
  end if;
end;
$$;

-- 5) Teste ponta-a-ponta do Vault: cria um segredo de teste, lê de volta,
--    atualiza, apaga — e confirma que sumiu. Roda como o dono das funções
--    (postgres/service_role têm EXECUTE; garanta que a role atual não ficou
--    como anon/authenticated de um bloco anterior).
reset role;
do $$
declare
  v_id uuid;
  v_value text;
begin
  v_id := public.store_secret('valor-de-teste-fase2', 'teste_fase2_temporario');

  v_value := public.reveal_secret(v_id);
  if v_value is distinct from 'valor-de-teste-fase2' then
    raise exception 'FALHOU: reveal_secret devolveu % (esperado valor-de-teste-fase2)', v_value;
  end if;

  perform public.update_secret(v_id, 'valor-atualizado-fase2');
  v_value := public.reveal_secret(v_id);
  if v_value is distinct from 'valor-atualizado-fase2' then
    raise exception 'FALHOU: update_secret não atualizou (leu %)', v_value;
  end if;

  perform public.delete_secret(v_id);
  v_value := public.reveal_secret(v_id);
  if v_value is not null then
    raise exception 'FALHOU: delete_secret não removeu o segredo';
  end if;

  raise notice 'OK: Vault funcionando (store/reveal/update/delete)';
end;
$$;
