-- ============================================================================
-- Fase 2 · 1/5 — Extensões
-- ============================================================================
-- Cole este arquivo primeiro no SQL Editor do Supabase e rode.
--
-- pgcrypto: gen_random_uuid() e funções de hash/cripto usadas nas tabelas.
-- pg_cron:  agenda o job diário de retenção (fase 2, arquivo 5/5).
--
-- Vault (schema `vault`, usado nas fases 2/4 para cifrar api_secret/capi_token/
-- ads_token) já vem habilitado por padrão em todo projeto Supabase hospedado —
-- não precisa de `create extension` aqui. Se o arquivo 4/5 (vault_functions)
-- der erro do tipo "schema vault does not exist" ou "function vault.create_secret
-- does not exist", vá em Database -> Extensions no painel do Supabase, procure
-- "Supabase Vault" e habilite por lá antes de tentar de novo.
-- ============================================================================

create extension if not exists pgcrypto;

create extension if not exists pg_cron with schema cron;
