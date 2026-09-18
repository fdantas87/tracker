-- ============================================================================
-- Fase 8b · Leads — nome/telefone em texto puro na compra
-- ============================================================================
-- `NormalizedPurchase` (lib/webhooks/adapters/types.ts) já carrega
-- buyerFirstName/buyerLastName/buyerPhone vindos do adaptador de cada
-- plataforma, mas o webhook (app/api/webhook/compra/[platform]/route.ts) só
-- os usava para hashear (Meta CAPI) e depois os descartava — nunca gravava em
-- coluna nenhuma. `visitors` só tem os hashes (first_name_hash, last_name_hash,
-- phone_hash), irreversíveis por desenho. Resultado: um lead que comprou não
-- tinha como mostrar nome/telefone legível na ficha do painel.
--
-- Ficam nulas em toda compra já existente e em compra de lead que nunca
-- preencheu telefone/nome — e ficam nulas PARA SEMPRE nesses casos: não há
-- backfill a partir de `raw_webhook` (o formato é específico de cada
-- plataforma, frágil de reprocessar em massa). A ficha do lead mostra
-- "não recuperável" quando não há nenhuma compra com o dado preenchido — é
-- o estado esperado, não um bug.
--
-- ⚠️ ORDEM OBRIGATÓRIA: rode esta migration ANTES do deploy do webhook
-- atualizado. O upsert de `purchases` grava estas 3 colunas junto de todas as
-- outras numa única chamada — se a coluna não existir, o PostgREST rejeita a
-- linha inteira e a compra deixa de ser registrada. Mesma lição das fases 7.5
-- e de geo_enriquecido.
-- ============================================================================

alter table public.purchases
  add column if not exists buyer_first_name text,
  add column if not exists buyer_last_name  text,
  add column if not exists buyer_phone      text;

comment on column public.purchases.buyer_first_name is
  'Nome em texto puro do comprador NESTA transação — pode divergir entre '
  'compras do mesmo trck_user_id (ex.: presente para outra pessoa). A ficha '
  'do lead usa a compra mais recente que tiver o campo preenchido.';

comment on column public.purchases.buyer_phone is
  'Telefone em texto puro repassado pela plataforma no webhook. Existe só '
  'aqui — visitors não tem coluna equivalente, só phone_hash (irreversível).';
