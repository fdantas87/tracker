# CLAUDE.md — tracking.negou.net

## Projeto

**Nome:** Negou Tracking
**Objetivo:** Sistema de tracking server-side (Meta Conversions API + GA4 Measurement Protocol) com painel de dashboard — visitas → checkout → compra, sobrevivendo a bloqueio de cookies/ad-blocker.
**Status:** Em desenvolvimento por fases (ver seção "Fases" abaixo)
**Plano completo:** o plano original de arquitetura (contexto, modelo de dados, RLS, dedup, segurança) está registrado no histórico do projeto; este arquivo é a fonte viva que evolui a cada fase.

---

## Stack

- **Next.js 16** (App Router, Turbopack) — instalado em 2026-09-16
- **React 19**
- **TypeScript** (padrão, `strict: true`)
- **Tailwind CSS v4** (config 100% em CSS via `@theme inline`, sem `tailwind.config.js`)
- **shadcn/ui** (base Radix, preset `nova` no init — sobrescrito pelos tokens próprios do design system, ver abaixo)
- **next-themes** — dark como padrão, toggle para light (sem `enableSystem`)
- **Supabase** (Postgres + Auth + Vault/pgsodium + pg_cron) — projeto criado, URL/anon/service_role em `.env.local` (nunca commitado); schema aplicado via migrations manuais (ver "Banco de dados" abaixo)
- **@supabase/ssr** + **@supabase/supabase-js** — sessão em cookies no App Router (ver "Autenticação e shell")
- **Recharts** e **react-simple-maps** — entram nas fases 8/9 (dashboard/geo), não instalados ainda
- **Upstash Redis** (`@upstash/ratelimit`) — entra na fase 5 (captura de eventos)
- **GitHub** para versionamento, **Vercel** para deploy (projeto próprio, root directory `apps/tracking.negou.net`, sem `vercel.json` — env vars só na dashboard da Vercel, seguindo `VERCEL_DEPLOY.md` da raiz do monorepo)

---

## Arquitetura (visão-alvo; itens ainda não implementados marcados)

```
apps/tracking.negou.net/
├── proxy.ts                                # ✅ fase 3 — refresh de sessão + guarda de rota (era "middleware.ts" antes do Next 16)
├── app/
│   ├── (auth)/login/                       # ✅ fase 3 — page.tsx + login-form.tsx, único ponto de entrada, sem signup
│   ├── (dashboard)/                        # ✅ fase 3 — layout autenticado + nav; páginas ainda são placeholders
│   │   ├── page.tsx                        # Visão geral        [conteúdo real: fase 8]
│   │   ├── eventos/page.tsx                # [fase 8]
│   │   ├── faturamento/page.tsx            # [fase 8]
│   │   ├── campanhas/page.tsx              # [fase 9]
│   │   ├── geo/page.tsx                    # [fase 8]
│   │   └── configuracoes/page.tsx          # [fase 4] CRUD de credenciais (Server Actions)
│   ├── layout.tsx                          # ✅ fase 1/3 — fontes, ThemeProvider, TooltipProvider
│   ├── globals.css                         # ✅ fase 1 — tokens HSL, gradiente, glass, tabular-nums
│   └── api/
│       ├── identify/route.ts               # [fase 5]
│       ├── event/route.ts                  # [fase 5]
│       ├── config/public/route.ts          # [fase 5]
│       └── webhook/compra/[platform]/route.ts   # [fase 7]
├── lib/
│   ├── supabase/env.ts                     # ✅ fase 3 — leitura validada das env vars
│   ├── supabase/server.ts                  # ✅ fase 3 — cliente SSR (anon + cookies), respeita RLS
│   ├── supabase/service.ts                 # ✅ fase 3 — cliente service_role, `server-only`
│   ├── supabase/proxy.ts                   # ✅ fase 3 — updateSession() usado pelo proxy.ts da raiz
│   ├── auth/actions.ts                     # ✅ fase 3 — signIn/signOut (Server Actions)
│   ├── auth/require-user.ts                # ✅ fase 4 — guarda obrigatória de toda Server Action
│   ├── crypto/vault.ts                     # ✅ fase 4 — única porta para os segredos cifrados
│   ├── crypto/webhook-token.ts             # ✅ fase 4 — gera/hash/compara em tempo constante
│   ├── settings/{config,queries}.ts        # ✅ fase 4 — os 3 tipos de conta parametrizados
│   ├── connections/test-connection.ts      # ✅ fase 4 — testes reais de Meta e GA4
│   ├── meta/constants.ts                   # ✅ fase 4 — META_GRAPH_API_VERSION (constante única)
│   ├── meta/capi.ts                        # [fase 6] disparo de evento
│   ├── ga4/mp.ts                           # [fase 6]
│   ├── geo.ts                              # [fase 5] headers x-vercel-ip-*
│   ├── rate-limit.ts                       # [fase 5]
│   └── webhooks/adapters/{index,perfectpay}.ts   # [fase 7]
├── components/
│   ├── ui/                                 # ✅ shadcn (button, card, badge, separator, switch, sidebar, sheet, dropdown-menu, input, label, alert, tooltip, skeleton)
│   ├── dashboard-sidebar.tsx               # ✅ fase 3 — navegação (drawer no celular, sidebar no desktop)
│   ├── user-menu.tsx                       # ✅ fase 3 — conta + sair
│   ├── page-header.tsx                     # ✅ fase 3 — cabeçalho e placeholder de fase
│   ├── theme-provider.tsx                  # ✅ fase 1
│   └── theme-toggle.tsx                    # ✅ fase 1
├── hooks/use-mobile.ts                     # ✅ fase 3 — reescrito com useSyncExternalStore (ver "Autenticação e shell")
├── public/track.js                         # [fase 5] snippet embutível para lp.negou.net/quiz.negou.net
└── supabase/
    ├── migrations/                          # ✅ fase 2 — SQL das 7 tabelas + RLS + Vault + pg_cron
    └── verify_phase2.sql                    # ✅ fase 2 — queries de verificação (roda manual, não é migration)
```

---

## Design system (fase 1 — implementado)

- **Tema escuro como padrão**, toggle para claro via `next-themes` (`attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}`). A classe `.dark`/`.light` no `<html>` é a fonte de verdade; não há dependência de `prefers-color-scheme`.
- **Cores em HSL**, uma var CSS por token, sempre já embrulhada em `hsl(...)` (ex.: `--primary: hsl(142 76% 58%)`) — isso é necessário porque o bloco `@theme inline` do shadcn só faz `var(--x)` sem re-embrulhar, e os modificadores de opacidade do Tailwind (`bg-primary/80`) e o `color-mix()` custom precisam de uma cor completa, não de uma tripla solta.
  - Primária verde-neon: escuro `142 76% 58%` / claro `142 70% 26%` (exatamente os valores pedidos)
  - Accents nomeados `--cyan` e `--amber` (fora do slot estrutural do shadcn, para não colorir hover states genéricos)
  - `--chart-1..5` cobrem verde/ciano/âmbar + 2 cores extras (roxo/rosa) para gráficos com mais de 3 séries
- **Radius:** `--radius: 0.625rem` (herdado do preset shadcn, igual ao pedido)
- **Fundo:** gradiente radial sutil (`color-mix(in hsl, var(--primary) ...)` + ciano) só em `.dark body`/`.light body`, mais uma textura de ruído (`feTurbulence` inline em SVG data-URI) a ~3.5% de opacidade no dark e ~2% no light, via `body::before` fixo
- **Fontes:** Manrope (`--font-manrope`, mapeada para `--font-sans`) e JetBrains Mono (`--font-jetbrains-mono`, mapeada para `--font-mono`), carregadas via `next/font/google` no `layout.tsx`
- **Números tabulares:** `font-variant-numeric: tabular-nums` aplicado a `.font-mono`/`code`/`pre` por padrão; usar a utility `tabular-nums` do Tailwind em qualquer número fora desse contexto
- **Cartão "glass":** utility `.glass` (`color-mix(in hsl, var(--card) 60%, transparent)` + `backdrop-filter: blur(16px)` + borda) — usar em cards de destaque, não em todos (senão perde o efeito de camada)
- **Componentes:** shadcn/ui sobre Radix (`components.json`: `style: radix-nova`, `iconLibrary: lucide`) — os componentes gerados (`button`, `card`, `badge`, `separator`, `switch`) já herdam os tokens acima automaticamente; novos componentes: `npx shadcn@latest add <nome>`

---

## Banco de dados (fase 2 — implementado)

- **Como aplicar:** as migrations em `supabase/migrations/` **não** são rodadas por CLI — cole cada arquivo, na ordem do nome (timestamp crescente), no SQL Editor do painel Supabase (dashboard.supabase.com → projeto → SQL Editor) e rode. Depois dos 5 arquivos, rode `supabase/verify_phase2.sql` pra conferir que RLS/Vault/cron estão corretos. Essa é uma decisão deliberada: nenhum token/senha novo precisa ser compartilhado pra manter o banco atualizado.
- **7 tabelas:** `settings` (singleton), `ga4_accounts`, `meta_pixels`, `meta_ad_accounts` (contas/credenciais), `visitors`, `events_log`, `purchases` (dados de tracking).
- **RLS:**
  - `visitors`/`events_log`/`purchases`: `authenticated` tem `SELECT` (`using (true)`, empresa única sem multi-tenant); nenhuma política de escrita — só `service_role` grava (ignora RLS via `BYPASSRLS`).
  - `settings`/`ga4_accounts`/`meta_pixels`/`meta_ad_accounts`: **nenhuma política de SELECT**, nem pra `authenticated` — proposital, defesa em profundidade. Toda leitura passa por Server Action com `service_role` (fase 4). Não "conserte" isso adicionando uma policy achando que faltou.
- **Segredos reversíveis** (`api_secret`, `capi_token`, `ads_token`) ficam no **Supabase Vault** — as tabelas guardam só `*_vault_id uuid not null` (sem FK formal pra `vault.secrets`, de propósito: a criação das tabelas não fica acoplada ao Vault estar disponível no projeto; a integridade é garantida em código na fase 4). Acesso só via 4 funções `SECURITY DEFINER` em `public` (`store_secret`, `reveal_secret`, `update_secret`, `delete_secret`), `execute` revogado de todo mundo exceto `service_role`.
- **`settings.webhook_token`**: nunca fica em texto puro nem cifrado-reversível — só `webhook_token_hash` (SHA-256). O token bruto é gerado com `crypto.randomBytes(32)` na fase 4, mostrado uma única vez na UI, e a verificação do webhook compara hash com `timingSafeEqual`.
- **`purchases.platform`**: enum `perfectpay | hotmart | kiwify | eduzz` (PerfectPay é a plataforma em uso agora — ver fase 7). `status` é um enum canônico normalizado (`approved/refunded/chargeback/canceled/pending/expired`); o valor bruto da plataforma fica em `platform_status` para auditoria.
- **Retenção:** função `purge_old_event_payloads()` + job `pg_cron` diário (`purge_old_event_payloads_daily`, 04:00 UTC) zeram os 4 campos jsonb pesados de `events_log` com mais de 14 dias, em lotes de 500, sem apagar a linha.
- **`updated_at`**: trigger `set_updated_at` em todas as tabelas que têm a coluna (menos `events_log`, que não tem — é só log de eventos, sempre criado uma vez).

---

## Autenticação e shell do painel (fase 3 — implementado)

- **`proxy.ts`, não `middleware.ts`.** O Next.js 16 renomeou o arquivo (mesma funcionalidade, só o nome do arquivo e do export mudaram) e roda no runtime Node.js por padrão — a opção `runtime` nem existe mais lá. Documentação em `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
- **Duas barreiras, de propósito.** O `proxy.ts` renova a sessão e redireciona quem não tem login, mas a doc do Next é explícita que isso é uma checagem *otimista* e não deve ser a única autorização. Por isso `app/(dashboard)/layout.tsx` chama `getUser()` de novo antes de renderizar. Não remova a segunda checagem.
- **Cuidados do `@supabase/ssr` (0.12.x)** que não estão em tutoriais antigos:
  - `setAll(cookiesToSet, headers)` recebe um **segundo argumento** com headers anti-cache. Eles precisam ir pra resposta: resposta que grava cookie de sessão não pode ser cacheada por CDN, senão o token de um usuário é servido pra outro.
  - Nada de lógica entre `createServerClient()` e `getUser()`, e `getUser()` tem que ser chamado antes de a resposta ser gerada — senão o refresh se perde e vira logout aleatório.
  - Ao redirecionar, os cookies recém-gravados precisam ser copiados pra resposta de redirect (`redirectTo()` em `lib/supabase/proxy.ts` faz isso), ou a sessão renovada é descartada.
- **Matcher do proxy exclui `/api/*`** — os endpoints de captura e webhook (fases 5 a 7) são públicos, de alto volume e não têm sessão.
- **Login:** email/senha via Server Action (`lib/auth/actions.ts`). Erro sempre genérico ("Email ou senha incorretos") pra não revelar quais emails têm conta. Não existe rota de cadastro; contas nascem no Supabase Studio.
- **Navegação:** `components/dashboard-sidebar.tsx` sobre o `sidebar` do shadcn — sidebar no desktop, drawer que fecha sozinho ao navegar no celular. Usa os tokens `--sidebar-*` já definidos na fase 1.
- **`hooks/use-mobile.ts` foi reescrito** com `useSyncExternalStore`: a versão que o shadcn gera usa `useEffect` + `setState` e quebra o lint do React 19 (`react-hooks/set-state-in-effect`). Se rodar `shadcn add sidebar --overwrite`, o arquivo volta ao original e o lint quebra — reaplique a versão do repo.

---

## Credenciais e destinos (fase 4 — implementado)

- **Arquivo `"use server"` só exporta função assíncrona.** Exportar uma constante de lá derruba a página em runtime ("can only export async functions, found object") e **nem o `next build` nem o ESLint pegam** — o erro só aparece quando o módulo é avaliado. Aconteceu de verdade aqui com um `export const IDLE_STATE`. Por isso valores de estado moram em `lib/settings/action-state.ts`, e `npm run build` roda antes o `scripts/check-server-actions.mjs`, que falha o build se alguém repetir o padrão. Exports de tipo são permitidos (somem na compilação).
- **Build verde não prova que a página abre.** As rotas do painel são dinâmicas e não são pré-renderizadas, então um erro de avaliação de módulo passa batido pelo build. E teste HTTP sem sessão também não serve: o proxy redireciona antes de a página renderizar. Para valer, o teste precisa estar autenticado — o jeito usado aqui foi criar um usuário temporário pela Admin API, logar pela própria `@supabase/ssr` (que devolve os cookies prontos, sem precisar adivinhar formato), carregar as páginas e apagar o usuário no fim.
- **Segredos são write-only.** Depois de salvo, o valor nunca volta pra tela: a UI mostra só "guardado cifrado no Vault" e oferece substituir. `lib/settings/queries.ts` nem seleciona o `*_vault_id` pra fora do servidor. O único momento em que um segredo é decifrado é dentro do teste de conexão ou do disparo de evento, e ele é descartado logo em seguida.
- **Toda Server Action começa com `requireUser()`** (`lib/auth/require-user.ts`). Isso NÃO é redundante com o proxy nem com o layout: uma Server Action é na prática um endpoint HTTP público, e quem descobrir o id dela pode chamá-la sem passar por página nenhuma. Nunca escreva uma action de configuração sem essa primeira linha.
- **Os 3 tipos de conta são um só código**, parametrizado por `lib/settings/config.ts` (tabela, coluna do ID público, coluna do Vault, regex, rótulos). Para adicionar um tipo novo, acrescente uma entrada lá.
- **`select("*")` em vez de lista de colunas** nas queries parametrizadas: o cliente do Supabase valida a string de select em tempo de compilação e quebra com nome de coluna montado dinamicamente. O mapeamento em TypeScript é que decide o que sai.
- **Ordem ao remover:** apaga a linha da tabela primeiro, depois `delete_secret`. Se o insert falhar depois de gravar no Vault, o segredo órfão é apagado no catch — senão ficaria lixo cifrado acumulando.
- **`webhook_token`:** gerado com 32 bytes aleatórios, mostrado uma vez e persistido só como SHA-256. Não existe forma de recuperá-lo; perdeu, gera outro e recadastra na plataforma.

### Testar conexão — o que cada teste realmente prova

Isto foi verificado contra as APIs reais, não suposto. Vale ler antes de mexer:

- **Meta Pixel (CAPI):** o teste ENVIA um evento PageView de verdade, com `test_event_code`, e confere `events_received`. Por quê: um token de CAPI (system user) normalmente **não** tem permissão de ler os metadados do pixel — testado, devolve `(#100) Missing Permission` com um token perfeitamente válido. Um teste por leitura daria falso negativo. O `test_event_code` garante que o evento fica só na aba Test Events e não entra em produção nem na atribuição.
- **Conta de anúncio:** leitura de `name,account_status,currency` funciona (o token de Ads tem `ads_read`), e é a mesma chamada que a fase 9 vai usar. `account_status != 1` devolve "parcial": o token funciona, quem está com problema é a conta.
- **GA4:** o endpoint de validação do Measurement Protocol **não valida credenciais** — testado com `api_secret` inválido e com `measurement_id` inexistente: os dois devolvem HTTP 200 e zero mensagens. Ele só valida o formato do evento (nome reservado, `client_id` faltando, etc. são pegos). Por isso o melhor resultado possível do GA4 é **"parcial"**, nunca verde: um "conectado" que mente é pior do que não ter teste. A confirmação real é ver o evento no DebugView do GA4.

---

## Convenções

### Git & Commits

- **Um commit por fase aprovada** — nunca commitar uma fase parcial ou sem build passando
- **Mensagem de commit:** `feat:`, `fix:`, `refactor:`, `chore:` (mesmo padrão do resto do monorepo)
- **Atribuição:** `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (ou o modelo real da sessão que fez o commit)
- **Push:** nunca automático — só quando pedido explicitamente

### Segurança (não negociável, ver auditoria final na fase 10)

- `.env`/`.env.local` nunca commitados (já no `.gitignore`)
- **Nenhum segredo em `NEXT_PUBLIC_`** — só o que é público por natureza
- `service_role` do Supabase só em arquivos com import `server-only`, nunca no client
- Credenciais de destino (GA4/Meta) **cifradas** (Supabase Vault), nunca em texto puro em coluna de tabela
- Cadastro público de usuário do painel **desligado** — contas criadas manualmente no Supabase Studio
- Arquivos soltos de credencial (Meta, GA4, Supabase) ficam só em `apps/tracking.negou.net/.credenciais-locais/`, uma pasta com regra própria e isolada no `.gitignore` (`/.credenciais-locais/`) — **nunca remover essa linha**, e nunca criar um `.txt`/`.json` de segredo fora dessa pasta. Eles serão apagados pelo usuário depois de migrados para o painel (fase 4) e para `.env.local` (infra do Supabase, já feito)

### Código

- Server Actions para CRUD que só o próprio dashboard usa; Route Handlers só para os 3 contratos externos (captura, webhook, config pública) — ver estrutura acima
- Sempre checar a documentação oficial (Meta Graph API, GA4) antes de fixar uma versão/endpoint — a versão da Graph API do Meta vive numa única constante (`META_GRAPH_API_VERSION`), fácil de atualizar

---

## Fases (commit + aprovação do usuário ao final de cada uma)

1. ✅ **Fundação** — scaffold Next.js/React, Tailwind + shadcn/ui, design tokens, `.gitignore`, `CLAUDE.md`
2. ✅ **Banco de dados e segurança** — migrations (7 tabelas, RLS, Vault, pg_cron) aplicadas no Supabase e verificadas em 2026-09-16 (`verify_phase2.sql` passou limpo + conferência independente via REST API)
3. ✅ **Autenticação e shell do dashboard** — `proxy.ts` (sessão + guarda), login email/senha, layout autenticado com navegação responsiva, toggle de tema, e leitura autenticada real na Visão geral provando RLS
4. ✅ **Painel de configurações** — CRUD das 3 tabelas de conta com segredos write-only no Vault, token de webhook mostrado uma vez, e teste de conexão por conta (ver "Credenciais e destinos")
5. ⏳ Captura de eventos (`/api/identify`, `/api/event`, script cliente)
6. ⏳ Disparo Meta CAPI + GA4 Measurement Protocol
7. ⏳ Webhook de compra (PerfectPay primeiro)
8. ⏳ Dashboard: Visão geral, Eventos, Faturamento, Geo
9. ⏳ Campanhas (Meta Ads Insights + ROAS/CPA)
10. ⏳ Auditoria de segurança e publicação

## Pendências manuais (fora do alcance de comandos automatizados)

Estas ações exigem login nas contas do próprio usuário e não podem ser feitas por aqui:

- ✅ ~~Criar o projeto Supabase~~ — feito; URL/anon/service_role em `.env.local`.
- ✅ ~~Rodar as 5 migrations da fase 2 + `verify_phase2.sql`~~ — feito e verificado (Vault já vinha habilitado no projeto, não precisou de passo extra em Database → Extensions).
- ✅ ~~Criar um usuário do painel no Supabase Studio~~ — feito; 2 contas cadastradas, ambas com email confirmado.
- **Criar o projeto na Vercel** (Import do repo `fdantas87/negou`, Root Directory = `apps/tracking.negou.net`), conforme `VERCEL_DEPLOY.md` da raiz — pode esperar até a fase 10, ou ser feito antes se quiser preview deploy fase a fase.
- Depois da fase 4 (painel de configurações): migrar os valores de `.credenciais-locais/` pro painel e apagar os arquivos.

---

## Comandos úteis

```bash
npm install       # instalar dependências
npm run dev       # desenvolvimento (http://localhost:3000)
npm run build     # build de produção (rodar antes de cada commit de fase)
npm run start     # rodar a build de produção localmente
npm run lint      # ESLint
npx shadcn@latest add <componente>   # adicionar novo componente shadcn/ui
```

---

## Referências

- [Next.js App Router docs](https://nextjs.org/docs)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Supabase Auth](https://supabase.com/docs/guides/auth) · [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [Meta Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api) · [Customer Information Parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters)
- [GA4 gtag.js](https://developers.google.com/analytics/devguides/collection/ga4) · [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- [VERCEL_DEPLOY.md](../../VERCEL_DEPLOY.md) (regras de deploy do monorepo)

---

## Histórico

- **2026-09-16:** Fase 1 concluída — scaffold Next.js 16.3.5/React 19.2.8, Tailwind v4 + shadcn/ui (Radix, preset nova), design tokens HSL (verde-neon/ciano/âmbar, dark padrão + toggle claro), fontes Manrope + JetBrains Mono, `.gitignore` protegendo os `.txt` de credencial soltos, página placeholder demonstrando o design system.
- **2026-09-16:** Projeto Supabase criado pelo usuário; URL/anon/service_role movidos para `.env.local`. Os 8 arquivos de credencial soltos (Meta, GA4, Supabase) consolidados em `.credenciais-locais/`, uma única pasta gitignorada — mais robusto do que listar nomes exatos.
- **2026-09-16:** Fase 2 (migrations) escrita — 5 arquivos SQL em `supabase/migrations/` (extensões, tabelas, RLS, funções de Vault, job de retenção) + `supabase/verify_phase2.sql`. Aplicação é manual (colar no SQL Editor do Supabase), por decisão do usuário de não compartilhar um Personal Access Token/senha de banco novo.
- **2026-09-16:** Fase 4 — painel de configurações. CRUD dos 3 tipos de conta com segredos write-only no Vault, token de webhook gerado/mostrado uma vez e guardado só como hash, e teste de conexão por conta. Constante `META_GRAPH_API_VERSION = v26.0` (confirmada no changelog oficial: lançada 29/07/2026). Testes de contrato contra o banco real (store/reveal/update/delete no Vault, CHECK de formato, unique 23505, trigger de updated_at) passaram e o banco ficou limpo.
- **2026-09-16:** Fase 3 — autenticação e shell do painel. `proxy.ts` (nome novo do middleware no Next 16) cuidando de refresh de sessão, headers anti-cache e guarda de rota; login por email/senha via Server Action; layout autenticado com sidebar responsiva, menu de conta e toggle de tema; Visão geral fazendo leitura autenticada real das 3 tabelas pra provar o caminho sessão → RLS → dado. Guarda verificada por HTTP: `/`, `/eventos` e `/configuracoes` sem sessão devolvem 307 para `/login`.
- **2026-09-16:** Fase 2 aplicada e verificada no projeto Supabase. `verify_phase2.sql` passou limpo, e uma conferência independente pela REST API confirmou: as 7 tabelas existem; a chave `anon` leva 401 em `ga4_accounts` (revoke funcionando) e lê `visitors` com lista vazia (RLS filtrando); `reveal_secret` e `purge_old_event_payloads` respondem via RPC com `service_role`.
