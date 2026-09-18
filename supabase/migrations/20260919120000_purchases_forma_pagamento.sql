-- ============================================================================
-- Fase 8b · Vendas — forma de pagamento da compra
-- ============================================================================
-- A tela de Vendas quebra o faturamento por Cartão / Pix / Boleto / Outros, e
-- nada disso existia: `purchases` guardava só `amount` e `currency`, e o
-- adaptador do PerfectPay nunca leu o campo. O dado estava chegando e sendo
-- descartado — sobrevivia apenas dentro de `raw_webhook`.
--
-- DUAS COLUNAS, não uma, espelhando exatamente o par `status` /
-- `platform_status` que já existe nesta tabela:
--
--   payment_method          -> enum canônico nosso, é o que a tela agrupa
--   platform_payment_method -> o valor bruto como a plataforma mandou
--
-- O bruto não é redundância: `payment_type_enum` do PerfectPay distingue
-- google_pay, apple_pay, picpay, paypal e open_finance, que aqui viram todos
-- `other`. Guardando o bruto, recuperar essa granularidade depois é uma
-- consulta, não uma migration com perda de histórico.
--
-- NULL É PERMITIDO, e é diferente de 'other': `null` = "a plataforma não
-- informou" (ou a linha é anterior a esta migration); `other` = "informou algo
-- que não é cartão, boleto nem Pix". A tela mostra "Não informado" no primeiro
-- caso. Um CHECK sem NULL obrigaria a mentir num dos dois sentidos.
--
-- ⚠️ ORDEM OBRIGATÓRIA: rode esta migration ANTES do deploy.
-- O upsert de `purchases` (app/api/webhook/compra/[platform]/route.ts) grava
-- estas 2 colunas junto de todas as outras numa chamada só. Sem elas, o
-- PostgREST rejeita A LINHA INTEIRA e a compra deixa de ser registrada —
-- mesma lição das fases 7.5, geo_enriquecido e 20260919090000.
-- ============================================================================

alter table public.purchases
  add column if not exists payment_method          text,
  add column if not exists platform_payment_method text;

-- `not valid` não é usado de propósito: a tabela é pequena e a validação
-- imediata é o que garante que o backfill abaixo não escreva valor fora do
-- vocabulário.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'purchases_payment_method_check'
  ) then
    alter table public.purchases
      add constraint purchases_payment_method_check
      check (payment_method in ('credit_card', 'billet', 'pix', 'other'));
  end if;
end $$;

create index if not exists purchases_payment_method_idx
  on public.purchases (payment_method);

comment on column public.purchases.payment_method is
  'Forma de pagamento canônica: credit_card | billet | pix | other. NULL = a '
  'plataforma não informou (ou a compra é anterior à migration), que é '
  'diferente de ''other'' (informou algo fora dos três). A tela de Vendas '
  'distingue os dois casos.';

comment on column public.purchases.platform_payment_method is
  'Valor bruto da forma de pagamento como a plataforma mandou (ex.: "7" para '
  'Pix no PerfectPay). Preservado para auditoria e para recuperar a '
  'granularidade que o enum canônico agrupa em ''other'' — google_pay, '
  'apple_pay, picpay, paypal, open_finance — sem precisar de migration nova.';

-- ---------------------------------------------------------------------------
-- Backfill a partir de `raw_webhook`
-- ---------------------------------------------------------------------------
-- Específico do PerfectPay (por isso o filtro em `platform`): o formato de
-- `raw_webhook` é de cada plataforma, e aplicar este mapa às outras produziria
-- dado errado em silêncio.
--
-- Hoje isto quase não atinge nada — o banco só tem linhas de `npm run seed` —
-- mas cobre qualquer venda real que chegue entre a aplicação desta migration e
-- o deploy do código novo, que é exatamente a janela em que a coluna existe e
-- o adaptador ainda não a preenche.
--
-- `payment_type_enum` oficial (app.perfectpay.com.br/docs/api.json):
--   1 credit_card · 2 billet · 3 paypal · 4 credit_card_recurrent
--   5 free_price · 6 credit_card_upsell · 7 pix · 8 billet_installments
--   9 open_finance · 10 google_pay · 11 apple_pay · 12 picpay · 16 amazon_pay
-- ---------------------------------------------------------------------------
update public.purchases
set
  platform_payment_method = raw_webhook ->> 'payment_type_enum',
  payment_method = case raw_webhook ->> 'payment_type_enum'
    when '1' then 'credit_card'
    when '4' then 'credit_card'
    when '6' then 'credit_card'
    when '2' then 'billet'
    when '8' then 'billet'
    when '7' then 'pix'
    else 'other'
  end
where platform = 'perfectpay'
  and payment_method is null
  and raw_webhook ->> 'payment_type_enum' is not null;
