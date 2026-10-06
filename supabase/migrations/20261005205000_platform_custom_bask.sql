-- ============================================================================
-- Webhook de compra · plataformas 'custom' e 'bask'
-- ============================================================================
-- `purchases.platform` passa a aceitar dois valores novos:
--
--   custom -> o contrato fixo de /api/webhook/compra/custom, para qualquer
--             plataforma sem adaptador próprio (n8n, Make, Zapier, sistema
--             interno do cliente)
--   bask   -> o adaptador nativo de /api/webhook/compra/bask, que lê o payload
--             `{ type, data }` que a Bask manda direto
--
-- Mesmo padrão da migration do Stripe (20260921130000): a constraint já existe,
-- então `drop constraint if exists` + `add constraint`, idempotente e seguro de
-- rodar de novo dentro do setup.sql.
--
-- ⚠️ ORDEM OBRIGATÓRIA: rode esta migration ANTES do deploy.
-- Os dois adaptadores gravam `platform` no mesmo upsert de sempre
-- (app/api/webhook/compra/[platform]/route.ts). Sem o CHECK novo, o Postgres
-- recusa A LINHA INTEIRA e a venda não é registrada — mesma lição das
-- migrations 7.5, geo_enriquecido, 20260919090000, 20260919120000 e do Stripe.
-- ============================================================================

alter table public.purchases
  drop constraint if exists purchases_platform_check;

alter table public.purchases
  add constraint purchases_platform_check
  check (platform in ('perfectpay', 'hotmart', 'kiwify', 'eduzz', 'stripe', 'custom', 'bask'));
