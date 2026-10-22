-- ============================================================================
-- Jornada de UTMs: primeiro toque, último toque e histórico
-- ============================================================================
-- Antes, `visitors.utm_*` era "o último valor não nulo de cada campo": dava
-- para terminar com o utm_source de uma visita e o utm_campaign de outra, e o
-- clique no link da bio, numa segunda visita, apagava a origem do anúncio sem
-- deixar rastro.
--
-- Agora:
--   - `visitors.utm_*`        = ÚLTIMO toque, gravado como um conjunto.
--   - `visitors.first_utm_*`  = PRIMEIRO toque, gravado uma vez
--                               (`first_touch_at is null`).
--   - `visitor_touches`       = uma linha por toque (chegada com UTM ou click
--                               id), o histórico completo.
--   - `purchases.first_utm_*` = primeiro toque do visitante casado; as
--                               `utm_*` da compra seguem sendo o último.
--
-- ⚠️ Migration ANTES do deploy: o /api/identify passa a gravar as colunas
-- novas, e sem elas o upsert falha e a captura para.
-- ============================================================================

alter table public.visitors
  add column first_utm_source text,
  add column first_utm_medium text,
  add column first_utm_campaign text,
  add column first_utm_term text,
  add column first_utm_content text,
  add column first_touch_at timestamptz;

alter table public.purchases
  add column first_utm_source text,
  add column first_utm_medium text,
  add column first_utm_campaign text,
  add column first_utm_term text,
  add column first_utm_content text;

create table public.visitor_touches (
  id uuid primary key default gen_random_uuid(),
  trck_user_id text not null references public.visitors (trck_user_id) on delete cascade,
  -- Nasce no navegador, um por carregamento de página. Os vários identify da
  -- mesma página (boot, formulário, backfill do GA) gravam um toque só.
  touch_id text not null unique,

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  fbclid text,
  gclid text,
  referrer text,
  -- Página de entrada SEM query string, pelo mesmo motivo do sourceUrl().
  landing_url text,

  touched_at timestamptz not null default now()
);

create index visitor_touches_visitor_idx
  on public.visitor_touches (trck_user_id, touched_at desc);

-- Mesmo regime de visitors/events_log: leitura para o painel, escrita só pelo
-- servidor (service_role).
alter table public.visitor_touches enable row level security;

create policy "authenticated_read_visitor_touches"
  on public.visitor_touches for select
  to authenticated
  using (true);

revoke insert, update, delete on public.visitor_touches from anon, authenticated;

-- Backfill: o que existe hoje vira o primeiro toque e a primeira linha do
-- histórico. É a melhor aproximação possível — o valor gravado pode ter
-- misturado campos de visitas diferentes, e não há como desfazer isso.
update public.visitors
set first_utm_source = utm_source,
    first_utm_medium = utm_medium,
    first_utm_campaign = utm_campaign,
    first_utm_term = utm_term,
    first_utm_content = utm_content,
    first_touch_at = created_at
where coalesce(utm_source, utm_medium, utm_campaign, utm_term, utm_content) is not null;

insert into public.visitor_touches (
  trck_user_id, touch_id, utm_source, utm_medium, utm_campaign, utm_term,
  utm_content, referrer, touched_at
)
select trck_user_id, 'backfill_' || id::text, utm_source, utm_medium,
       utm_campaign, utm_term, utm_content, referrer, created_at
from public.visitors
where coalesce(utm_source, utm_medium, utm_campaign, utm_term, utm_content) is not null;

-- Compras já gravadas herdam o primeiro toque do visitante casado.
update public.purchases p
set first_utm_source = v.first_utm_source,
    first_utm_medium = v.first_utm_medium,
    first_utm_campaign = v.first_utm_campaign,
    first_utm_term = v.first_utm_term,
    first_utm_content = v.first_utm_content
from public.visitors v
where p.trck_user_id = v.trck_user_id
  and p.match_found
  and v.first_touch_at is not null;
