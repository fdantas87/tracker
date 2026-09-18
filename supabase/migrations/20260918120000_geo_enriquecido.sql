-- ---------------------------------------------------------------------------
-- Geolocalização enriquecida + fuso horário do visitante
-- ---------------------------------------------------------------------------
-- A Vercel injeta OITO headers de geo na borda e o código lia só três
-- (country, region, city). Os quatro que faltavam — postal-code, latitude,
-- longitude e timezone — são gratuitos em todos os planos (Hobby, Pro e
-- Enterprise), resolvidos antes da função rodar, sem credencial e sem chamada
-- de rede. Não usá-los era desperdício puro.
--
-- O que cada coluna destrava:
--   geo_postal_code -> o campo `zp` da Conversions API do Meta, que até agora
--                      ia VAZIO. É um parâmetro de correspondência a menos em
--                      todo evento enviado.
--   geo_latitude/longitude -> o mapa da fase 8c, com precisão de ponto em vez
--                      de só pintar o estado.
--   geo_timezone    -> responder "que horas eram PARA O USUÁRIO" quando ele não
--                      está no fuso de Brasília (Manaus, Rio Branco, exterior).
--
-- ⚠️ ORDEM OBRIGATÓRIA: rode esta migration ANTES do deploy. /api/identify e
-- /api/event passam a gravar estas colunas; sem elas o PostgREST recusa a
-- escrita e a captura para por completo. Mesma armadilha da fase 7.5.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------
-- `visitors` é a fonte do disparo: `event-dispatch.ts` lê esta linha no momento
-- do envio, então é daqui que o `zp` sai.
alter table public.visitors
  add column if not exists geo_postal_code text,
  add column if not exists geo_latitude    double precision,
  add column if not exists geo_longitude   double precision,
  add column if not exists geo_timezone    text;

-- `events_log` guarda o geo do INSTANTE do evento, não o atual do visitante.
-- A duplicação é proposital e já existia para country/region/city: uma pessoa
-- que comprou em viagem tem um PageView em um lugar e o Purchase em outro, e o
-- painel precisa mostrar cada evento onde ele realmente aconteceu.
alter table public.events_log
  add column if not exists geo_postal_code text,
  add column if not exists geo_latitude    double precision,
  add column if not exists geo_longitude   double precision,
  add column if not exists geo_timezone    text;

comment on column public.visitors.geo_postal_code is
  'CEP. Vem do header x-vercel-ip-postal-code (aproximado, área do provedor) ou, com precedência, do checkout via fill_visitor_pii.';
comment on column public.visitors.geo_timezone is
  'Fuso IANA do visitante (x-vercel-ip-timezone), ex.: America/Manaus. Exibição apenas — o painel agrega sempre em America/Sao_Paulo.';

-- ---------------------------------------------------------------------------
-- 2. fill_visitor_pii passa a aceitar o CEP do comprador
-- ---------------------------------------------------------------------------
-- POR QUE O CEP ENTRA AQUI E NÃO SÓ NO /api/identify: CEP derivado de IP aponta
-- a área do provedor, não o endereço da pessoa. O CEP digitado no checkout é o
-- dado de verdade. A regra de "só preenche buraco" desta função é justamente a
-- que dá a precedência certa — mas só se o derivado de IP NÃO tiver ocupado o
-- campo antes. Por isso o /api/identify grava o CEP de IP e este aqui o
-- substitui quando o de IP estava ausente; quando ambos existem, o primeiro
-- fica. É o mesmo compromisso já aceito para email e telefone.
--
-- `create or replace` NÃO adiciona parâmetro: criaria uma sobrecarga, e aí o
-- PostgREST passa a recusar a chamada por ambiguidade. O drop é obrigatório.
-- O parâmetro novo vai no FIM e tem default, então as chamadas posicionais
-- existentes (inclusive as de verify_phase7_5.sql) continuam válidas.
drop function if exists public.fill_visitor_pii(text, text, text, text, text, text);

create or replace function public.fill_visitor_pii(
  p_trck_user_id text,
  p_email text default null,
  p_email_hash text default null,
  p_phone_hash text default null,
  p_first_name_hash text default null,
  p_last_name_hash text default null,
  p_postal_code text default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filled text[] := '{}';
  v_row public.visitors;
begin
  select * into v_row
  from public.visitors
  where trck_user_id = p_trck_user_id
  for update;

  if not found then
    return v_filled;
  end if;

  -- `array_append`, e não `||`: com um literal sem tipo, o `||` é ambíguo
  -- entre concatenar dois arrays e anexar um elemento, e o Postgres tenta
  -- interpretar 'email_hash' como um text[] inteiro — "malformed array
  -- literal". O array_append não tem essa ambiguidade.
  if v_row.email is null and p_email is not null then
    v_filled := array_append(v_filled, 'email');
  end if;
  if v_row.email_hash is null and p_email_hash is not null then
    v_filled := array_append(v_filled, 'email_hash');
  end if;
  if v_row.phone_hash is null and p_phone_hash is not null then
    v_filled := array_append(v_filled, 'phone_hash');
  end if;
  if v_row.first_name_hash is null and p_first_name_hash is not null then
    v_filled := array_append(v_filled, 'first_name_hash');
  end if;
  if v_row.last_name_hash is null and p_last_name_hash is not null then
    v_filled := array_append(v_filled, 'last_name_hash');
  end if;
  if v_row.geo_postal_code is null and p_postal_code is not null then
    v_filled := array_append(v_filled, 'geo_postal_code');
  end if;

  if array_length(v_filled, 1) is null then
    return v_filled;
  end if;

  update public.visitors
  set email           = coalesce(email, p_email),
      email_hash      = coalesce(email_hash, p_email_hash),
      phone_hash      = coalesce(phone_hash, p_phone_hash),
      first_name_hash = coalesce(first_name_hash, p_first_name_hash),
      last_name_hash  = coalesce(last_name_hash, p_last_name_hash),
      geo_postal_code = coalesce(geo_postal_code, p_postal_code),
      identified_at   = coalesce(identified_at, now())
  where trck_user_id = p_trck_user_id;

  return v_filled;
end;
$$;

revoke all on function public.fill_visitor_pii(text, text, text, text, text, text, text) from public;
grant execute on function public.fill_visitor_pii(text, text, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Retenção: as colunas novas NÃO entram no purge
-- ---------------------------------------------------------------------------
-- `purge_old_event_payloads()` zera só os 4 jsonb pesados. Geo é texto curto e
-- é o que a tela de Eventos mostra depois que o payload já foi apagado — zerar
-- também o geo deixaria o evento antigo sem nenhuma informação útil. Nada a
-- alterar aqui; a nota existe para ninguém "consertar" isso depois.
