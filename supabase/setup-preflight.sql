-- ============================================================================
-- Preflight — roda ANTES de tudo no supabase/setup.sql
-- ============================================================================
-- O SQL Editor do Supabase executa o script colado numa transação única, então
-- qualquer erro aqui faz rollback de TUDO: nada é aplicado ao banco pela
-- metade. Isso é importante porque as migrations deste projeto não são
-- idempotentes (`create table`/`create policy`/`create trigger` sem guarda).
--
-- Sem este bloco, os dois erros mais prováveis apareceriam na linha ~900 de um
-- arquivo de milhares de linhas, com a mensagem crua do Postgres. Aqui eles
-- param na primeira linha, com o clique a dar.
--
-- As mensagens vão SEM ACENTO de propósito: voltam pelo protocolo do Postgres
-- e são renderizadas no toast do SQL Editor, onde encoding quebrado já foi
-- visto.
-- ============================================================================

do $preflight$
begin
  -- --------------------------------------------------------------------------
  -- 1. Supabase Vault
  -- --------------------------------------------------------------------------
  -- Checar só o SCHEMA `vault` NÃO basta. Das 4 funções de
  -- 20260916140300_vault_functions.sql, três são `language plpgsql` e são
  -- criadas sem erro mesmo sem o Vault (o corpo de uma função PL/pgSQL só é
  -- analisado na execução — a mesma propriedade que escondeu o bug de
  -- `malformed array literal` na fase 7.5). Quem quebra é `reveal_secret`, que
  -- é `language sql` e resolve `vault.decrypted_secrets` na hora do CREATE.
  -- Por isso o teste é pela VIEW, não pelo schema.
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception using
      message = 'O Supabase Vault nao esta habilitado neste projeto.',
      hint    = 'Abra Database > Extensions no painel do Supabase, procure '
                'por "supabase_vault", habilite, e rode este script de novo. '
                'Nada foi aplicado ao banco.';
  end if;

  -- --------------------------------------------------------------------------
  -- 2. Banco já instalado
  -- --------------------------------------------------------------------------
  -- Sem isto o erro seria `relation "settings" already exists` no meio do
  -- arquivo. Inofensivo (a transação inteira faz rollback), mas ilegível para
  -- quem está seguindo o passo a passo e não sabe se estragou alguma coisa.
  if to_regclass('public.settings') is not null then
    raise exception using
      message = 'Este banco JA tem o schema do tracker instalado.',
      hint    = 'Este script roda UMA vez, num projeto Supabase novo. Nada foi '
                'alterado. Para atualizar um banco existente, aplique so a '
                'migration nova de supabase/migrations/.';
  end if;
end
$preflight$;

-- `to_regclass` devolve null (não lança) quando o schema nem existe, então o
-- mesmo teste serve para "sem Vault" e para "sem a tabela".
--
-- pg_cron e pg_net NÃO entram aqui de propósito: o próprio setup.sql os cria
-- com `create extension if not exists`, e é isso que torna obsoleto o antigo
-- passo manual "habilite o pg_net no painel antes de rodar as migrations".
