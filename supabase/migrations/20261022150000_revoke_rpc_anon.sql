-- Fecha as funções do schema public para anon e authenticated.
--
-- Todas as migrations anteriores faziam `revoke all on function ... from public`
-- e `grant execute ... to service_role`. Isso NÃO bastava: no Supabase o schema
-- public tem default privileges que concedem EXECUTE explicitamente a `anon` e
-- `authenticated`, e revogar de PUBLIC não remove concessão explícita. Com a anon
-- key (pública por natureza) qualquer pessoa chamava `/rest/v1/rpc/<função>` —
-- inclusive claim_pending_events (devolve events_log com PII e tira os eventos
-- da fila), fill_visitor_pii, store_secret e bump_rate_limit.
--
-- Nenhum código do app chama RPC com sessão de usuário: todas as chamadas usam
-- o service_role, que mantém o EXECUTE concedido nas migrations de origem.
-- O pg_cron roda como postgres (dono), então os jobs não são afetados.
--
-- Idempotente: pode rodar mais de uma vez.

revoke execute on all functions in schema public from public, anon, authenticated;

-- Funções criadas daqui em diante também nascem fechadas.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
