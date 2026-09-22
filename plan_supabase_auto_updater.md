# Supabase Updater — plano de implementação

## Contexto

O Tracker é multi-cliente: cada cliente tem seu próprio projeto Supabase e
deploy Vercel do mesmo código. Cliente novo instala rodando `supabase/setup.sql`
(gerado, concatena todas as migrations) uma vez no SQL Editor. **O problema**: um
cliente que já está no ar e recebe uma migration nova não tem como saber disso —
`setup-preflight.sql` já avisa "este banco já tem o schema instalado, aplique só
a migration nova", mas não diz QUAL migration, nem oferece o arquivo. Hoje isso
depende do desenvolvedor lembrar de avisar cada cliente manualmente.

O Supabase Updater fecha esse buraco: o painel (Configurações → Geral) passa a
mostrar a versão do schema do cliente e, se ele estiver atrasado, oferece um
único arquivo `.sql` pronto para colar no SQL Editor — mesma filosofia de
transação única já usada no `setup.sql`.

Três decisões já aprovadas pelo usuário (não reabrir):
1. **Versão** = nova coluna `settings.schema_version` (text). Toda migration
   futura termina se auto-carimbando (`update settings set schema_version =
   '<seu próprio timestamp>' where id = true`).
2. **Entrega** = um arquivo pré-gerado por versão de partida conhecida
   (`public/upgrades/from_<timestamp>.sql` = tudo que vem depois daquele
   timestamp, concatenado, uma transação só) — não uma sequência de arquivos
   passo a passo.
3. **Changelog** = extraído automaticamente do comentário de cabeçalho que toda
   migration já tem, não um `CHANGELOG.md` escrito à mão.

---

## Fase 1 — Migration `schema_version` (banco)

**Arquivo novo:** `supabase/migrations/<TIMESTAMP>_schema_version.sql`
(timestamp real no momento da implementação; hoje seria a 13ª migration, depois
de `20260922140000_allowed_origins.sql`).

Conteúdo:

```sql
alter table public.settings add column if not exists schema_version text;

do $$
declare
  v_version text;
begin
  -- Banco recém-criado (setup.sql do zero) não precisa de backfill: o próprio
  -- setup.sql já roda esta migration por último na cadeia, e a migration
  -- seguinte a esta (se/quando existir) vai se auto-carimbar normalmente.
  if to_regclass('public.settings') is null then
    return;
  end if;

  -- Piso: qualquer banco com tabela `settings` já rodou as 5 migrations
  -- originais da fase 2 (extensions/tables/rls/vault/retention), que sempre
  -- foram aplicadas juntas, antes deste rastreamento existir.
  v_version := '20260916140400'; -- retention_job

  if to_regclass('public.rate_limits') is not null then
    v_version := '20260917170000'; -- rate_limits
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'events_log'
               and column_name = 'dispatch_status') then
    v_version := '20260917190000'; -- event_queue
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'visitors'
               and column_name = 'geo_postal_code') then
    v_version := '20260918120000'; -- geo_enriquecido
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'purchases'
               and column_name = 'buyer_first_name') then
    v_version := '20260919090000'; -- purchases_dados_comprador
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'purchases'
               and column_name = 'payment_method') then
    v_version := '20260919120000'; -- purchases_forma_pagamento
  end if;

  if to_regclass('public.stripe_accounts') is not null then
    v_version := '20260921130000'; -- stripe_integration
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'settings'
               and column_name = 'allowed_origins') then
    v_version := '20260922140000'; -- allowed_origins
  end if;

  update public.settings set schema_version = v_version where id = true;
end
$$;
```

Confirmar os nomes exatos de coluna/tabela lendo cada migration fonte antes de
finalizar (o plano acima usa os nomes já vistos em `geo_enriquecido.sql`,
`purchases_dados_comprador.sql`, `purchases_forma_pagamento.sql` — conferir
`buyer_first_name`/`payment_method` contra o arquivo real, não confiar de
memória).

**Por que esta é a ÚNICA migration que não se auto-carimba com seu próprio
timestamp**: ela é a primeira a escrever a coluna, então precisa responder "em
qual das migrations anteriores este banco específico está?" — pergunta que
varia por cliente. Da migration seguinte em diante, "rodei este arquivo" já
equivale a "estou nesta versão", e o carimbo fixo basta. Documentar essa exceção
no comentário de cabeçalho da migration, no mesmo estilo do projeto (explicar a
decisão que parece errada e não é).

Toda a lógica é idempotente (`add column if not exists`, leitura+`update`) —
rodar esta migration de novo não quebra nada, o que importa porque ela vai
aparecer dentro de qualquer arquivo de upgrade gerado (Fase 2) para clientes
atrasados o suficiente para precisar dela.

---

## Fase 2 — Ferramenta de build (`scripts/build-upgrade-sql.mjs`)

**Refatoração pequena primeiro:** extrair de `scripts/build-setup-sql.mjs` as
funções `NOME_VALIDO`, `ler()`, `sha()`, `listarMigrations()` (e o helper
`erro()`) para `scripts/lib/migrations.mjs`, e fazer `build-setup-sql.mjs`
importar de lá. É extração mecânica (mesmo corpo, novo arquivo), sem mudar
comportamento — evita duplicar ~40 linhas que definem a MESMA fonte de verdade
(ordem/validade das migrations) em dois scripts, o que seria exatamente o tipo
de "segundo dialeto" que o comentário de `build-setup-sql.mjs` já rejeita para o
SQL.

**Arquivo novo:** `scripts/build-upgrade-sql.mjs`

Lógica:
1. `listarMigrations()` (compartilhada) → lista ordenada de migrations com seus
   timestamps `T_1 < T_2 < ... < T_n`.
2. Para cada `T_i` exceto o último (`T_n`, que não tem "depois dele" — nesse
   caso o painel simplesmente mostra "em dia"), gerar
   `public/upgrades/from_<T_i>.sql` = concatenação de toda migration
   estritamente posterior a `T_i`, mesmo estilo de `setup.sql` (índice de
   arquivos com sha8 no cabeçalho, LF normalizado via `ler()`, concatenação
   burra sem transformar SQL) — mas SEM o `setup-preflight.sql` (o banco alvo já
   existe, isso não é instalação do zero).
3. **Guarda de segurança no topo de cada arquivo gerado** (novo, não existe no
   `setup.sql`): um bloco `do $$ ... $$` que confere
   `(select schema_version from public.settings where id = true) = '<T_i>'` e
   levanta exceção clara se não bater ("este arquivo é para uma versão de
   partida diferente da deste banco"). Isso protege contra o risco real que essa
   feature introduz: o admin baixar/colar o arquivo errado.
4. Extrair changelog: para cada migration, o bloco de comentário do topo do
   arquivo (linhas em branco ou começando com `--`, até a primeira linha que não
   é nenhum dos dois — regra mecânica, sem parsing semântico). Escrever em dois
   lugares a partir da MESMA extração:
   - `supabase/upgrades/CHANGELOG.md` — legível por humano, no repo.
   - `public/upgrades/changelog.json` — `[{ timestamp, filename, title, body }]`,
     público/estático (como `public/track.js`), porque quem lê isso no painel é
     o ADMIN DO CLIENTE, que não tem acesso ao repositório. Este mesmo arquivo
     pode ser importado diretamente por código de servidor (Next.js resolve
     import de JSON dentro de `public/` normalmente) — não duplicar como um
     segundo arquivo gerado só para o lado do servidor.
5. Modo `--check`: mesma lógica de diff do `build-setup-sql.mjs` (classificar
   cada arquivo divergente como novo/alterado/removido), agora cobrindo as duas
   famílias de saída (`public/upgrades/from_*.sql` + `changelog.json` e
   `supabase/upgrades/CHANGELOG.md`).

**Arquivos a modificar:**
- `package.json`:
  ```json
  "build": "npm run check:actions && npm run check:setup-sql && npm run check:upgrade-sql && next build",
  "check:upgrade-sql": "node scripts/build-upgrade-sql.mjs --check",
  "build:upgrade-sql": "node scripts/build-upgrade-sql.mjs"
  ```
- `.gitattributes`: já cobre `*.sql text eol=lf` e `*.mjs text eol=lf` de forma
  global (não é `path`-scoped) — conferir que isso também alcança
  `public/upgrades/*.sql` e `supabase/upgrades/*.md` (o `.md` pode precisar de
  uma linha própria, `*.md text eol=lf`, se ainda não houver regra genérica de
  texto — verificar o arquivo antes de assumir).

---

## Fase 3 — Backend (`lib/settings/`)

**Modificar `lib/settings/queries.ts`:**
- Adicionar `schemaVersion: string | null` a `SettingsRow`.
- Em `getSettings()`: `schemaVersion: data.schema_version ?? null` (mesmo
  padrão defensivo dos outros campos).

**Arquivo novo `lib/settings/schema-status.ts`** (sem `"use server"` — é
computação pura sobre dado já buscado, não uma Server Action):
```ts
import changelog from "@/public/upgrades/changelog.json"

export type SchemaStatus =
  | { state: "up_to_date" }
  | { state: "behind"; missing: number; upgradeFileUrl: string; pending: ChangelogEntry[] }
  | { state: "unknown" }

export function getSchemaStatus(schemaVersion: string | null): SchemaStatus {
  // changelog vem ordenado por timestamp (mesma ordem de listarMigrations()).
  // null ou timestamp não encontrado em changelog → "unknown", nunca "up_to_date"
  // por omissão — o objetivo da feature é justamente não deixar passar batido.
}
```

Se importar `public/upgrades/changelog.json` de dentro de `lib/` esbarrar em
algum problema de bundler durante a implementação, o fallback é gerar uma
segunda cópia em `lib/settings/changelog.generated.json` a partir da MESMA
extração (não uma fonte nova) — decidir isso na hora, não antecipar.

Nenhuma Server Action nova é necessária: é leitura pura, já composta a partir de
`getSettings()`, que a página `configuracoes/page.tsx` já chama.

---

## Fase 4 — Frontend

**Arquivo novo:** `components/settings/schema-upgrade-section.tsx`

Mesma casca visual de `allowed-origins-section.tsx` (`glass flex flex-col
gap-4 rounded-2xl p-6`, ícone + `h2`, texto em `text-sm text-muted-foreground`),
mas SEM form nem `useActionState` — é presentational, recebe `settings` como
prop e chama `getSchemaStatus(settings.schemaVersion)`.

Três estados:
- **Em dia:** confirmação discreta (ícone de check + "Seu banco está na versão
  mais recente do schema."). Peso visual baixo — é o caso comum.
- **Atrasado:** aviso com "N migrations atrás", link `<a href={upgradeFileUrl}
  download>` para o arquivo, lista dos títulos/descrições pendentes vindos do
  changelog, instrução curta no estilo já usado ("SQL Editor → New query, cole
  o arquivo, rode"), e aviso em negrito de que roda numa transação só.
- **Desconhecido** (schema_version nulo ou não reconhecido): mensagem neutra
  "não foi possível determinar a versão do seu banco" — nunca afirmar "em dia"
  quando não se sabe.

**Modificar `components/settings/general-tab.tsx`:** adicionar
`<SchemaUpgradeSection settings={settings} />` depois de `<WebhookSection />`,
dentro do branch `settings ? (...) : <FirstRun />`.

---

## Fase 5 — Documentação

- **`ONBOARDING.md`**: nova seção `## Upgrade do banco` depois do passo 8
  (verificar ponta a ponta) e antes de "Perdi a senha do painel" — é manutenção
  pós-instalação, não parte do primeiro setup. Incluir a instrução de
  bootstrapping para clientes anteriores a esta feature: "se a seção não
  aparecer no seu painel ainda, aplique a migration `<TIMESTAMP>_schema_version.sql`
  sozinha primeiro, e a versão vai aparecer."
- **`supabase/setup-preflight.sql`**: atualizar a mensagem de "banco já
  instalado" para mencionar a nova seção do painel como caminho preferido
  (cosmético, baixo risco).
- **`CLAUDE.md`**: nova entrada em "Fases"/"Histórico" documentando a migration,
  a relação entre os dois scripts de build, e a exceção do auto-carimbo — seguir
  a estrutura já usada (o que foi construído, por quê, o que NÃO foi
  verificado). Adicionar os 2 comandos novos em "Comandos úteis".

---

## Verificação

**Verificável nesta sessão, sem projeto Supabase real:**
- `node scripts/build-upgrade-sql.mjs` roda limpo contra as migrations atuais,
  gera um arquivo `from_*.sql` por timestamp (exceto o mais recente) +
  `changelog.json` + `CHANGELOG.md`; `--check` reporta OK ao rodar de novo.
- Conferir manualmente o índice de arquivos (cabeçalho sha8) de 2-3 arquivos
  gerados representativos (mais antigo, do meio, penúltimo) contra a lista real
  de migrations, confirmando que o corte é exatamente "tudo estritamente depois
  de T_i".
- Rodar o bloco de introspecção da migration `schema_version` contra um
  Postgres local/descartável (não precisa ser Supabase — são só checks de
  `information_schema`/`to_regclass`), semeado em cada um dos 7 níveis
  detectáveis, e confirmar que cada um produz o `v_version` esperado. Este é o
  teste de maior valor, porque é o núcleo da correção do backfill.
- `tsc --noEmit`, `npm run lint`, `npm run check:actions` limpos nos arquivos
  novos/modificados.

**Só verificável pelo usuário, contra um Supabase real:**
- Que colar um `from_<T>.sql` de verdade num cliente semeado naquele nível
  produz o schema certo E o `schema_version` certo ao final.
- Que a guarda de versão no topo do arquivo gerado realmente aborta com erro
  legível quando o arquivo errado é colado.
- Que a seção nova do painel renderiza certo para um cliente genuinamente
  atrasado, de ponta a ponta.
- Que `public/upgrades/*.sql` e `changelog.json` são alcançáveis sem autenticação
  no deploy real da Vercel (mesma suposição já feita para `public/track.js`).

---

## Riscos assumidos (não mitigados, e por quê)

1. **Migrations não-contíguas** (cliente aplicou fora de ordem ou pulou uma no
   meio): `schema_version` é um escalar só, não representa "tenho 1-5 e 10, mas
   não 6-9". A introspecção pega o maior marcador presente, sem detectar o buraco.
   Aceito porque é um painel de um admin só por cliente, migrations sempre foram
   aplicadas por instrução explícita (nunca script automático) — cenário
   improvável dado como o projeto já opera.
2. **Renomear/renumerar uma migration já usada em backfill**: nunca aconteceu
   neste histórico; `build-setup-sql.mjs` já trata isso como erro fatal na
   direção "gerar novamente", mas não protege clientes já retroativamente
   carimbados com o nome antigo. Fora de escopo — exigiria reescrever
   `schema_version` de clientes já no ar.
3. **`schema_version` não encontrado em `changelog.json`**: único caso tratado
   ativamente — `getSchemaStatus()` retorna `"unknown"` em vez de arriscar
   afirmar "em dia" errado, porque esse é exatamente o modo de falha que a
   feature existe para evitar.

---

## Arquivos críticos

- `supabase/migrations/<TIMESTAMP>_schema_version.sql` (novo)
- `scripts/lib/migrations.mjs` (novo, extraído de `build-setup-sql.mjs`)
- `scripts/build-setup-sql.mjs` (modificado, passa a importar de `lib/migrations.mjs`)
- `scripts/build-upgrade-sql.mjs` (novo)
- `lib/settings/queries.ts` (modificado — `schemaVersion`)
- `lib/settings/schema-status.ts` (novo)
- `components/settings/schema-upgrade-section.tsx` (novo)
- `components/settings/general-tab.tsx` (modificado)
- `package.json` (modificado)
- `ONBOARDING.md`, `supabase/setup-preflight.sql`, `CLAUDE.md` (documentação)
