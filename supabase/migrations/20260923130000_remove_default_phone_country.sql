-- ============================================================================
-- Remove settings.default_phone_country
-- ============================================================================
-- O país do telefone deixou de ser um campo do painel. Numa compra ele vem da
-- moeda da transação (obterPaisDaMoeda, lib/webhooks/adapters/index.ts); sem
-- compra (/api/identify), da env var TRACKING_DEFAULT_PHONE_COUNTRY
-- (lib/phone-country.ts), uma por deploy.
--
-- Nenhuma policy, trigger ou default de outra coluna depende desta: a RLS de
-- settings é por tabela e o set_updated_at não olha colunas. O único objeto
-- ligado a ela é o CHECK settings_phone_country_check, que só referencia esta
-- coluna. Ele cairia junto com o DROP COLUMN; sai explicitamente antes só para
-- a intenção ficar escrita.
--
-- ORDEM: deploy do código novo PRIMEIRO, esta migration DEPOIS. O código
-- antigo ainda seleciona e grava a coluna; com ela removida, salvar a aba Delay
-- falha e getDispatchConfig() cai no padrão (perde modo, janela e
-- test_event_code) até o deploy sair.
-- ============================================================================

alter table public.settings
  drop constraint if exists settings_phone_country_check;

alter table public.settings
  drop column if exists default_phone_country;
