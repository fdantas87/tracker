# CLAUDE.md — tracking.negou.net

## Projeto

**Nome:** Tracking Panel (multi-cliente — o nome de cada deploy vem de `NEXT_PUBLIC_APP_NAME`)
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
- **Recharts** (fase 8a) e **react-simple-maps** + **d3-geo** + **world-atlas** (fase 8c) — instalados; o `world-atlas` é só o arquivo TopoJSON do mundo, embutido no bundle
- **Sem Redis/Upstash** — o rate limit roda no próprio Postgres do Supabase (ver "Captura de eventos"), pra não acrescentar serviço nem credencial
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
│   │   ├── eventos/page.tsx                # ✅ fase 8a — tabela, chips, gráfico, filtros na URL
│   │   ├── eventos/actions.ts              # ✅ fase 8a — carrega o payload só quando o modal abre
│   │   ├── vendas/page.tsx                 # ✅ fase 8b — cards, gráfico, tabela, filtros na URL
│   │   ├── vendas/actions.ts               # ✅ fase 8b — detalhe da venda só quando o painel abre
│   │   ├── faturamento/page.tsx            # ✅ fase 8b — redirect("/vendas"), rota antiga
│   │   ├── campanhas/page.tsx              # [fase 9]
│   │   ├── geo/page.tsx                    # ✅ fase 8c — mapa-múndi, chips de local, receita por região
│   │   ├── integracoes/page.tsx            # ✅ Stripe — lista de plataformas conectadas
│   │   ├── integracoes/actions.ts          # ✅ Stripe — credenciais no Vault, teste, remoção
│   │   └── configuracoes/page.tsx          # [fase 4] CRUD de credenciais (Server Actions)
│   ├── layout.tsx                          # ✅ fase 1/3 — fontes, ThemeProvider, TooltipProvider
│   ├── globals.css                         # ✅ fase 1 — tokens HSL, gradiente, glass, tabular-nums
│   └── api/
│       ├── identify/route.ts               # ✅ fase 5 — upsert do visitante (+ 7.5: devolve `identified`, libera a fila)
│       ├── event/route.ts                  # ✅ fase 5 — log com dedup por event_id (+ 7.5: decide atraso)
│       ├── config/public/route.ts          # ✅ fase 5 — só IDs públicos, pro track.js
│       ├── cron/dispatch/route.ts          # ✅ fase 7.5 — drena a fila, chamado pelo pg_cron
│       └── webhook/compra/[platform]/route.ts   # ✅ fase 7 — token, idempotência, vinculação
├── lib/
│   ├── supabase/env.ts                     # ✅ fase 3 — leitura validada das env vars
│   ├── supabase/server.ts                  # ✅ fase 3 — cliente SSR (anon + cookies), respeita RLS
│   ├── supabase/service.ts                 # ✅ fase 3 — cliente service_role, `server-only`
│   ├── supabase/proxy.ts                   # ✅ fase 3 — updateSession() usado pelo proxy.ts da raiz
│   ├── auth/actions.ts                     # ✅ fase 3 — signIn/signOut (+ deploy 1-clique: completeSetup)
│   ├── auth/require-user.ts                # ✅ fase 4 — guarda obrigatória de toda Server Action
│   ├── auth/setup.ts                       # ✅ deploy 1-clique — estadoDoSetup(), falha fechado
│   ├── crypto/vault.ts                     # ✅ fase 4 — única porta para os segredos cifrados
│   ├── crypto/webhook-token.ts             # ✅ fase 4 — gera/hash/compara em tempo constante
│   ├── settings/{config,queries}.ts        # ✅ fase 4 — os 3 tipos de conta parametrizados
│   ├── connections/test-connection.ts      # ✅ fase 4 — testes reais de Meta e GA4
│   ├── meta/constants.ts                   # ✅ fase 4 — META_GRAPH_API_VERSION (constante única)
│   ├── meta/capi.ts                        # ✅ fase 6 — payload + fan-out (+ 7.5: envio em lote)
│   ├── meta/custom-data.ts                 # ✅ fase 7.5 — custom_data do navegador -> campos da CAPI
│   ├── ga4/mp.ts                           # ✅ fase 6 — Measurement Protocol (só o webhook usa)
│   ├── dispatch/event-dispatch.ts          # ✅ fase 7.5 — fila: reivindica, enriquece, envia em lote
│   ├── dispatch/visitor-enrich.ts          # ✅ fase 7.5 — PII da compra -> visitors, e libera a fila
│   ├── settings/dispatch-modes.ts          # ✅ fase 7.5 — modos e rótulos (módulo comum)
│   ├── settings/dispatch-config.ts         # ✅ fase 7.5 — config memorizada + regra do atraso
│   ├── settings/cron-autoconfig.ts         # ✅ URL + token do cron sozinhos, chamado pelo layout
│   ├── dashboard/filters.ts                # ✅ fase 8a — constantes dos filtros (SEM server-only)
│   ├── dashboard/events.ts                 # ✅ fase 8a — consultas da tela de Eventos (sob RLS)
│   ├── dashboard/vendas-filters.ts         # ✅ fase 8b — filtros de Vendas (SEM server-only)
│   ├── dashboard/vendas.ts                 # ✅ fase 8b — consultas da tela de Vendas (sob RLS)
│   ├── dashboard/format.ts                 # ✅ fase 8a — data/hora no fuso do painel
│   ├── dashboard/timezone.ts               # ✅ revisão geo — FUSO_PAINEL, diaLocal, inicioDoDiaLocal (SEM server-only)
│   ├── dashboard/geo-filters.ts            # ✅ fase 8c — período + nomeDoPais (SEM server-only)
│   ├── dashboard/geo-fit.ts                # ✅ fase 8c — enquadramento automático (SEM server-only, roda no cliente)
│   ├── dashboard/geo.ts                    # ✅ fase 8c — pontos, rankings e receita por região (sob RLS)
│   ├── geo.ts                              # ✅ fase 5 — IP real + os 8 headers x-vercel-ip-*
│   ├── phone-country.ts                    # ✅ país padrão do telefone (TRACKING_DEFAULT_PHONE_COUNTRY)
│   ├── rate-limit.ts                       # ✅ fase 5 — Upstash quando configurado, memória senão
│   ├── cors.ts                             # ✅ fase 5 — allowlist exata dos endpoints públicos
│   ├── validation.ts                       # ✅ fase 5 — limpeza de tudo que entra
│   ├── crypto/hash.ts                      # ✅ fase 5 — normalização + SHA-256 do Meta
│   ├── webhooks/adapters/{index,types,perfectpay}.ts  # ✅ fase 7 — formato normalizado por plataforma
│   ├── webhooks/adapters/stripe.ts         # ✅ Stripe — tradução + assinatura HMAC (server-only)
│   └── dispatch/purchase-dispatch.ts       # ✅ fase 7 — Purchase pro Meta + GA4
├── components/
│   ├── ui/                                 # ✅ shadcn (button, card, badge, separator, switch, sidebar, sheet, dropdown-menu, input, label, alert, tooltip, skeleton, table, popover, chart)
│   ├── settings/dispatch-tab.tsx           # ✅ fase 7.5 — modo, janela, formulários, token do cron, fila
│   ├── dashboard/                          # ✅ fase 8a — events-table, events-filters, events-chart,
│   │                                       #    status-chips, dispatch-status-badge, event-detail-dialog,
│   │                                       #    pagination-links
│   │                                       # ✅ fase 8b — stat-card, vendas-filters, vendas-table,
│   │                                       #    payment-method-badge, payment-method-chart,
│   │                                       #    sale-detail-sheet, purchase-status-badge
│   │                                       # ✅ fase 8c — geo-view (dona da vista do mapa), world-map,
│   │                                       #    world-map-impl, ranking-chips
│   ├── integrations/{integration-card,stripe-card}.tsx  # ✅ Stripe — cards e formulário de credenciais
│   ├── dashboard-sidebar.tsx               # ✅ fase 3 — navegação (drawer no celular, sidebar no desktop)
│   ├── user-menu.tsx                       # ✅ fase 3 — conta + sair
│   ├── page-header.tsx                     # ✅ fase 3 — cabeçalho e placeholder de fase
│   ├── theme-provider.tsx                  # ✅ fase 1
│   └── theme-toggle.tsx                    # ✅ fase 1
├── hooks/use-mobile.ts                     # ✅ fase 3 — reescrito com useSyncExternalStore (ver "Autenticação e shell")
├── public/track.js                         # ✅ fase 5 — script embutível nos sites (identidade, gtag, pixel, decoração de links)
├── scripts/check-server-actions.mjs        # ✅ fase 4 — roda no build, ver "Credenciais e destinos"
├── scripts/build-setup-sql.mjs             # ✅ deploy 1-clique — gera setup.sql; --check roda no build
├── scripts/seed-events.mjs                 # ✅ fase 8a — npm run seed / seed:limpar
├── .gitattributes                          # ✅ deploy 1-clique — *.sql em LF (ver "Deploy 1-clique")
├── .husky/pre-push                         # ✅ catraca de build — `npm run build` antes de todo push
├── .github/workflows/build.yml             # ✅ catraca de build — o mesmo build em todo push/PR para main
├── types/world-atlas.d.ts                  # ✅ fase 8c — TopoJSON como dado, sem inferência do literal
├── types/anychart.d.ts                     # ✅ fase 8c — ponte do namespace global para módulo (destravou o build)
└── supabase/
    ├── migrations/                          # ✅ fase 2 — SQL das 7 tabelas + RLS + Vault + pg_cron
    │                                        #    fase 5 — rate_limits; fase 7.5 — event_queue
    │                                        #    revisão geo — geo_enriquecido (8 colunas + fill_visitor_pii)
    │                                        #    fase 8b — purchases_dados_comprador, purchases_forma_pagamento
    │                                        #    Stripe — stripe_integration (platform CHECK + stripe_accounts)
    │                                        #    remove_default_phone_country (país do telefone saiu do banco)
    ├── setup-preflight.sql                  # ✅ deploy 1-clique — checa Vault e banco já instalado
    ├── setup.sql                            # ✅ deploy 1-clique — GERADO, não editar (npm run build:setup-sql)
    ├── verify_phase2.sql                    # ✅ fase 2 — queries de verificação (roda manual, não é migration)
    └── verify_phase7_5.sql                  # ✅ fase 7.5 — 11 checagens da fila (roda manual)
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

- **Meta Pixel (CAPI):** o teste ENVIA um evento PageView de verdade, com `test_event_code`, e confere `events_received`. Por quê: um token de CAPI (system user) normalmente **não** tem permissão de ler os metadados do pixel — testado, devolve `(#100) Missing Permission` com um token perfeitamente válido. Um teste por leitura daria falso negativo.
- **O `test_event_code` só isola de produção quando é um código REAL.** A primeira versão deste arquivo afirmava que qualquer `test_event_code` mantinha o evento fora dos dados de produção. Errado, e visto na prática: os testes feitos com códigos inventados (`TEST00000`, `NEGOU_TESTE`) apareceram na atividade de produção do pixel. O código precisa ser o que a aba "Eventos de teste" do Events Manager gera para aquele pixel. Sem código configurado, o teste de conexão agora avisa que o evento provavelmente contou como real.
- **A aba "Eventos de teste" é um monitor AO VIVO.** Ela mostra o que chega enquanto está aberta — não tem histórico. Disparar e só depois abrir a tela não mostra nada, e parece (erradamente) que a integração falhou. Ao testar, abra a aba primeiro, depois dispare.
- **Conta de anúncio:** leitura de `name,account_status,currency` funciona (o token de Ads tem `ads_read`), e é a mesma chamada que a fase 9 vai usar. `account_status != 1` devolve "parcial": o token funciona, quem está com problema é a conta.
- **GA4:** duas coisas foram verificadas e as duas são limitação do Google, não do código: o endpoint de validação **não confere credenciais** (com `api_secret` inválido e com `measurement_id` inexistente, os dois devolvem HTTP 200 e zero mensagens) e o endpoint de coleta devolve **204 sempre**, dando certo ou errado. Não existe resposta de API que prove que a credencial está certa. Por isso o teste faz duas coisas: valida o formato no endpoint de debug e **envia de verdade** um evento `tracking_teste_conexao` (nome próprio, pra não entrar nas métricas de página/sessão) com `debug_mode`, que aparece no DebugView em segundos se a credencial estiver certa. O status é `"verificar"`, com link direto pro DebugView.
- **`"verificar"` não é erro e a UI não pode sugerir que seja.** A primeira versão usava âmbar com ícone de alerta e o usuário leu como falha — reportou como "deu este erro" um resultado que era o esperado. Agora é ciano com ícone de informação. Honestidade que assusta sem necessidade é defeito de design, não virtude: o resultado precisa dizer com clareza que o envio deu certo e que falta só você conferir do outro lado.

---

## Captura de eventos (fase 5 — implementado)

Três endpoints públicos (`/api/config/public`, `/api/identify`, `/api/event`) e o `public/track.js`, que é o script embutido nos sites.

- **O `event_id` nasce no navegador, nunca no servidor.** O mesmo id vai no `fbq(..., { eventID })` e na chamada ao `/api/event`. É só isso que faz o Meta entender que o evento do Pixel e o da Conversions API são o mesmo — se o servidor gerasse o seu, todo evento contaria em dobro. `/api/event` devolve 400 se o `event_id` não vier; ele valida, não inventa.
- **O que o cliente manda e o que o servidor decide.** IP, user agent e geo são resolvidos SEMPRE no servidor, a partir dos headers, e um valor desses vindo no corpo é ignorado (tem teste cobrindo isso). Confiar no cliente aqui seria entregar a geolocalização pra quem quisesse forjar.
- **Campo nulo não apaga o que já existe.** No `/api/identify`, só os campos preenchidos entram no upsert. Numa segunda visita sem UTM na URL, a origem da primeira visita é preservada — que é o comportamento certo pra atribuição.
- **`/api/event` cria o visitante se ele não existir.** `events_log.trck_user_id` tem FK pra `visitors`; um evento pode chegar antes do identify (corrida de rede, aba restaurada). Criar a linha mínima é melhor do que descartar o evento.
- **Dedup por `event_id` único**, com `ignoreDuplicates` (vira `on conflict do nothing`). Reenvio do mesmo evento devolve 200 com `duplicated: true`, sem criar linha nova.
- **CORS com allowlist fechada e comparação exata.** Nada de `*` e nada de `endsWith(".negou.net")` — `negou.net.site-do-atacante.com` passaria no endsWith. Tem teste com esse domínio exato.
- **Sem cookie entre domínios.** O `track.js` lê o que precisa (trck_user_id, `_fbp`/`_fbc`, `_ga`, `_ga_<id>`) no próprio site e manda tudo explicitamente no corpo. Isso dispensa `Access-Control-Allow-Credentials` e toda a fragilidade de cookie cross-site — menos superfície e menos coisa pra quebrar quando navegador mudar política.
- **Cross-domain é por URL.** O `track.js` decora automaticamente links de checkout (PerfectPay) com `?tuid=` e links de WhatsApp com o id dentro do texto da mensagem, inclusive em links criados depois (MutationObserver). É isso que permite casar a compra com a visita na fase 7.
- **`keepalive: true` no envio.** O InitiateCheckout dispara um instante antes de o navegador sair da página; sem keepalive a requisição é cancelada no meio e o evento se perde justo no passo mais valioso do funil.
- **Rate limit no próprio Postgres, não em Redis.** O contador precisa ser compartilhado entre instâncias: cada requisição pode cair numa função serverless diferente, e contador em memória nunca soma — o atacante só precisa bater em instâncias distintas. A escolha clássica seria Redis, mas seria mais um serviço, mais uma conta e mais duas credenciais; o Postgres do Supabase já existe, já é compartilhado e já é consultado nesses mesmos endpoints. Uma chamada atômica (`bump_rate_limit`, na migration `..._rate_limits.sql`) resolve numa ida só ao banco. Em qualquer falha do banco a decisão é **deixar passar**: limitador com problema não pode derrubar a captura do site inteiro — verificado com a função ainda inexistente, os endpoints seguiram respondendo 200.

---

## Disparo server-side (fase 6 — implementado)

- **`after()` do Next, não fire-and-forget.** `/api/event` responde ao site na hora e só então dispara pro Meta, dentro de `after()` (`next/server`). Assim a ida e volta até o Meta não atrasa o carregamento da página, e — diferente de uma promise solta — a plataforma mantém a função viva até o trabalho terminar, em vez de congelar o processo e perder o envio.
- **GA4 NÃO é chamado por `/api/event`, de propósito.** Os eventos do navegador já vão pela gtag; repetir pelo Measurement Protocol contaria tudo em dobro no GA4 e estragaria os relatórios. O MP é reservado pro evento que nasce fora do navegador — a compra do webhook (fase 7). O módulo `lib/ga4/mp.ts` existe e está pronto, mas só o webhook o chama. A spec original tinha uma linha dizendo "dispara pra Meta e GA4" no `/api/event` e outra, mais específica, dizendo que o MP é só pro evento externo e que não se deve duplicar o que já foi pela gtag; a segunda venceu, porque é a correta.
- **O que é hasheado e o que não é** (verificado campo a campo contra a API real): `em`, `ph`, `fn`, `ln`, `ct`, `st`, `country`, `external_id` vão em SHA-256. `fbp`, `fbc`, `client_ip_address`, `client_user_agent` vão em TEXTO PURO. Hashear esses quatro não gera erro nenhum — só zera a correspondência, silenciosamente.
- **O `access_token` nunca entra no log.** Ele é injetado só no corpo do `fetch`; o objeto gravado em `payload_meta` é montado sem ele. Tem teste que falha se a palavra aparecer no payload gravado ou se um token no formato do Meta vazar na resposta.
- **Fan-out independente:** `Promise.allSettled` por pixel, um destino que falha não afeta os outros, e nada lança pra fora — indisponibilidade do Meta não pode derrubar a captura do site. A resposta de CADA destino é gravada em `response_meta` (é o que a tela de Eventos vai mostrar na fase 8).
- **Duplicata não redispara.** Se o mesmo `event_id` chegar de novo, o evento é reconhecido como duplicado e o disparo não acontece — reenviar contaria duas vezes no Meta.
- **Campo vazio não é enviado.** `user_data` e `custom_data` só levam chaves com valor: string vazia ou null pioram a correspondência em vez de ajudar.

---

## Webhook de compra (fase 7 — implementado)

`POST /api/webhook/compra/[platform]` — PerfectPay e Stripe implementados (o Stripe veio depois; ver "Tela de Integrações + Stripe"); Hotmart, Kiwify e Eduzz entram escrevendo um adaptador e registrando em `lib/webhooks/adapters/index.ts`.

- **Formato do PerfectPay confirmado na doc oficial**, não deduzido: OpenAPI em `https://app.perfectpay.com.br/docs/api.json` (eles publicam também `llms.txt` e `llms-full.txt`). Campos: `code` (id da transação), `sale_amount`, `currency_enum` (1=BRL, 2=USD, 3=EUR), `sale_status_enum`, e os objetos `product`, `plan`, `customer` (`full_name`, `email`, `identification_number`) e `metadata`.
- **Detalhe que a doc avisa e que seria impossível adivinhar:** no PostBack alguns status chegam JÁ normalizados pelo próprio PerfectPay — `8/10/16 → 2`, `11 → 6`, `17 → 9`, `18/19/20 → 7`. O mapa em `perfectpay.ts` cobre todos os 19 valores mesmo assim, porque receber um valor inesperado é pior do que ter linhas a mais.
- **`in_mediation` (4) é mapeado para `approved`**, decisão consciente: o dinheiro foi recebido e ainda não foi revertido, então continua contando como receita. Se virar chargeback de verdade chega o status 9 e vira `chargeback`. O valor cru fica em `platform_status`, então o sinal não se perde.
- **`metadata.src` é o canal do `trck_user_id`.** O PerfectPay NÃO repassa parâmetro arbitrário pro webhook — só `src` e as `utm_*`. Por isso o `track.js` preenche `src` nos links de checkout. Se o link já tiver `src` (uso próprio de origem/afiliado), o script não sobrescreve, e a vinculação cai pro email.
- **Idempotência com trava atômica.** `transaction_id` é UNIQUE e o upsert atualiza a linha a cada transição de status (a plataforma manda um webhook por transição — pendente, aprovada, reembolsada). O disparo do Purchase acontece UMA vez só, garantido por `UPDATE ... WHERE transaction_id = X AND meta_event_id IS NULL RETURNING id`: só uma requisição consegue marcar a linha, mesmo com duas chegando ao mesmo tempo. Quem marcou, dispara.
- **`event_id` determinístico** (`purchase_<transaction_id>`): reentrega do mesmo webhook gera o mesmo id, então o Meta deduplica mesmo se a trava falhar.
- **Aqui o GA4 ENTRA.** Esta é a conversão que nasce fora do navegador — exatamente o caso de uso do Measurement Protocol. Reusa o `client_id` e o `session_id` capturados na visita, pra a compra cair na sessão certa em vez de virar tráfego direto órfão.
- **Vinculação em ordem de confiança:** `trck_user_id` (veio da URL do checkout, vínculo direto) → email (hash) → telefone (hash) → nenhum. Sem vínculo a compra é gravada mesmo assim: perder a venda por não saber a origem seria muito pior do que registrá-la sem atribuição. `match_method` e `match_found` guardam o que aconteceu.
- **Responde 200 sempre que entendeu o payload**, mesmo se o disparo falhar depois. Plataforma de pagamento reenvia webhook que não recebeu 2xx, e loop de reenvio por erro nosso só piora. O que deu errado fica em `response_meta`/`response_ga4`.
- **Token no header `x-webhook-token` ou na querystring** (nem toda plataforma deixa configurar header). A URL completa nunca é logada, porque carrega o token.

---

## Disparo atrasado com retroalimentação (fase 7.5 — implementado)

No instante do PageView o sistema só conhece cookie, IP e geo. Email, nome e telefone só aparecem quando a pessoa converte — e aí o evento de topo de funil já foi enviado. O Meta não deixa atualizar evento recebido, então o dado se perdia pra sempre. Agora o evento espera numa fila no Postgres (padrão 15 min); a conversão grava a PII no visitante nesse meio-tempo, e o disparo sai enriquecido.

- **A retroalimentação é quase de graça** porque `event-dispatch.ts` sempre montou o `user_data` lendo `visitors` **no momento do envio**. Atrasar o envio foi o suficiente — nenhum payload é reescrito.
- **A regra do Meta que define a arquitetura inteira**, verificada na doc antes de desenhar: *"If we find the same server key combination (`event_id` and `event_name`) and browser key combination (`eventID` and `event`) sent to the same Pixel ID within 48 hours, **we discard the subsequent events**"* e *"we generally prefer the event that is received first"*. A dedup **já funcionava**; o problema nunca foi ela falhar, e sim qual dos dois sobrevive — o do navegador, porque chega primeiro. Pixel na hora + CAPI 15 min depois com o mesmo `event_id` não conta em dobro, mas descarta justamente o evento enriquecido. **Não "conserte" isso fazendo o pixel voltar a disparar sempre**: seria desligar o ganho da fase inteira.
- **Por isso o `track.js` decide por evento** (modo `adaptive`, o padrão): visitante anônimo → o `fbq('track')` **não** é chamado e o evento vai pra fila; visitante já identificado → não há o que esperar, então o pixel dispara e a CAPI vai junto, na hora. Nunca existem dois eventos com o mesmo id chegando em janelas diferentes. Os outros modos são `server_only` (o pixel nunca dispara; maior correspondência) e `hybrid` (experimental: pixel na hora E CAPI atrasada, pra medir se o Meta prefere o evento mais rico quando eles "diferem significativamente" — caso que a doc não cobre).
- **`pixel_fired` vem do navegador e manda no atraso.** É a única parte que sabe se já existe um evento igual a caminho do Meta. O servidor não tenta adivinhar: se o pixel disparou, a CAPI vai imediatamente.
- **`event_time` é o momento REAL do evento**, gravado em coluna própria e enviado ao Meta. Usar `Date.now()` na hora do envio (como era antes) faria um evento atrasado parecer ter acontecido 15 minutos depois, jogando a atribuição pra frente. O Meta aceita até 7 dias de defasagem.
- **Evento velho envenena o lote inteiro.** A doc: *"If any `event_time` in `data` is greater than 7 days in the past, we return an error for the **entire request** and process no events"*. Por isso `claim_pending_events` marca como `skipped` tudo com mais de 6 dias **antes** de montar qualquer lote. Sem isso, um evento esquecido derrubaria os eventos novos junto.
- **Um caminho só até o Meta.** Tanto o envio imediato (`dispatchEventNow`) quanto o do cron (`drainEventQueue`) reivindicam a linha atomicamente (`pending` → `sending`). É isso que torna impossível enviar o mesmo evento duas vezes, mesmo com o cron e a requisição original correndo juntos. Não acrescente um segundo caminho de envio.
- **Falha parcial não volta pra fila.** Só quando TODOS os pixels falham a linha é reagendada (backoff 1/5/15/60 min, `failed` na 5ª tentativa). Se um pixel deu certo e outro não, reenviar mandaria o evento de novo pro que funcionou.
- **Quem acorda a fila é o pg_cron + pg_net**, chamando `/api/cron/dispatch` de minuto em minuto. Nenhum serviço novo — mesma decisão que tirou o Redis do rate limit. O cron da Vercel exigiria um `vercel.json` (que o projeto não tem) e, no Hobby, roda 1x por dia.
- **O endpoint responde 202 ANTES de trabalhar**, e faz o envio no `after()`. O pg_net é fire-and-forget e derruba a conexão no timeout dele; o `after()` é o que mantém a função viva ("`after` will run for the platform's default or configured max duration of your route").
- **O token do cron vive só no Vault.** O pg_cron lê o valor bruto com `reveal_secret` pra mandar no header; o endpoint compara em tempo constante. Uma representação, uma fonte de verdade — trocar o token no painel vale no próximo tique, sem editar SQL.
- **Não existe passo de ativação (2026-09-23).** URL e token do cron se
  configuram sozinhos: `app/(dashboard)/layout.tsx` lê o header `Host` de toda
  página autenticada e agenda, num `after()`, `ensureCronDispatchConfigured()`
  (`lib/settings/cron-autoconfig.ts`), que grava `dispatch_cron_url` quando ele
  difere do domínio atual e gera o token quando ainda não existe. Na maioria
  das requisições isso é um `select` e nada mais. Consequências que valem
  guardar:
  - **O domínio registrado é o último pelo qual um admin acessou o painel.**
    Trocar de `*.vercel.app` para o domínio próprio se corrige no primeiro
    acesso pelo domínio novo. O lado ruim: um admin abrindo o painel por uma URL
    de **preview** faz o cron de produção apontar para o preview. O banco é o
    mesmo e o endpoint do preview também drena, então nada se perde — mas o
    próximo acesso pela produção é que devolve a URL para lá.
  - **O `Host` é lido ANTES do `after()`**, não dentro dele. Não há precedente
    no projeto de API dinâmica (`headers()`/`cookies()`) dentro do callback, e
    ler antes elimina a dúvida.
  - **O token do cron nunca aparece na tela.** Diferente do `webhook_token`
    (colado na plataforma de pagamento), ninguém precisa copiá-lo: só
    `tick_event_queue()` o lê, via `reveal_secret`. `regenerateCronToken`
    continua existindo, atrás de "Avançado", só para girá-lo de propósito.
  - **`saveDispatchSettings` não toca em `dispatch_cron_url`.** Se voltasse a
    gravar a coluna a partir do formulário, apagaria a URL a cada salvamento —
    o campo não existe mais na tela.
  - **Indicador de saúde:** `dispatch_cron_status()` (migration
    `20260923120000_cron_health.sql`, lida por `getCronStatus()`) devolve a
    última linha de `cron.job_run_details` do job
    `dispatch_event_queue_minutely`. É um heartbeat honesto de "o pg_cron está
    vivo", porque `tick_event_queue()` roda todo minuto mesmo sem trabalho —
    diferente de `event_queue_depth()`, que diz se o Meta está recebendo.
    Migration aditiva e só-leitura: sem ela, a RPC erra e a tela mostra "sem
    registro" em vez de quebrar, então aqui a ordem migration→deploy é
    recomendada, não obrigatória.
- **Liberação antecipada:** quando a conversão grava a PII (webhook de compra ou `/api/identify` com dado pessoal), `flush_visitor_events` adianta a fila daquele visitante. Quem converte não espera a janela inteira.
- **O enriquecimento do webhook roda ANTES do retorno de status não-aprovado.** Um boleto/Pix apenas gerado já traz o email do comprador, e é essa PII que os eventos na fila estão esperando — dias antes de a venda ser aprovada. Sair cedo ali desperdiçaria o melhor momento do funil.
- **`fill_visitor_pii` só preenche buraco, nunca sobrescreve.** O visitante pode ter um valor melhor (digitado pela própria pessoa); o webhook é fonte de segunda mão. É o inverso do `/api/identify`, onde o valor mais novo deve ganhar. A função devolve o que preencheu, então a mesma ida ao banco responde "vale liberar a fila?".
  - **Em PL/pgSQL, use `array_append(arr, 'x')` e não `arr || 'x'`.** Com um literal sem tipo o `||` é ambíguo entre concatenar dois arrays e anexar um elemento, e o Postgres tenta interpretar `'x'` como um `text[]` inteiro — `malformed array literal`. Aconteceu de verdade aqui: a migration aplicou sem reclamar (o corpo de uma função PL/pgSQL só é analisado na execução) e o erro só apareceu quando o `verify_phase7_5.sql` chamou a função.
- **`identified` NÃO pode sair do `/api/config/public`.** Aquele endpoint responde com `Cache-Control: public, max-age=60` — um CDN serviria o estado de um visitante pra todos os outros. Ele viaja na resposta do `/api/identify`, que é `no-store`.
- **BUG CORRIGIDO: o `hashPhone` não punha o código do país.** O comentário dizia "com código do país", o código só tirava não-dígitos e zeros à esquerda. Um celular digitado como `(11) 98765-4321` virava `11987654321` e nunca batia com o `5511987654321` que o Meta espera — sem erro nenhum, só correspondência zero. Agora há `normalizePhone(valor, país)`: 10 ou 11 dígitos = nacional e recebe o país (o que resolve até o DDD 55 de Santa Maria/RS); 12 ou 13 já começando com o país ficam como estão. **Todo `phone_hash` gravado antes disso é inútil pro Meta** — não há como recuperá-los, mas o volume era de desenvolvimento.
- **O país do telefone vem da moeda da transação, não de um campo do painel (2026-09-23).** Antes era `settings.default_phone_country`, um DDI fixo por deploy digitado na aba Delay. Isso quebrava o cliente que vende em mais de uma moeda: o comprador americano de uma venda Stripe em USD ganhava o prefixo 55 e nunca casava no Meta. Agora:
  - **Numa compra** (webhook, `enrichVisitorFromPurchase`, `dispatchPurchase`), o país é `obterPaisDaMoeda(purchase.currency)` (`lib/webhooks/adapters/index.ts`): BRL → BR, USD → US, EUR → PT. A moeda é o sinal confiável que o webhook traz. A geolocalização do visitante **nunca** entra nisso — ela erra com viagem e VPN, e continua sendo usada só para `ct`/`st`/`zp`/`country`.
  - **EUR → PT é aproximação**: o euro circula em ~20 países. Quando alguma plataforma passar a mandar o país do comprador, ele deve ter precedência sobre a moeda.
  - **Sem compra** (`/api/identify` — formulários e `negou.identify()`), não há moeda: vale `TRACKING_DEFAULT_PHONE_COUNTRY` (`lib/phone-country.ts`), uma env var por deploy, ISO-2, padrão `BR`. Moeda ausente ou não mapeada também cai nela, com `console.warn`.
  - **Por que o fallback não é simplesmente "BR" chumbado:** o tracker já atende clientes de países diferentes, e o `phone_hash` do `/api/identify` é o que TODO evento de navegador manda pro Meta. Um "BR" fixo zeraria a correspondência de telefone de todo deploy fora do Brasil, sem erro nenhum — exatamente o defeito que o campo antigo existia para evitar. A configurabilidade saiu do banco e da tela, não deixou de existir.
  - **`normalizePhone(telefone, país)` recebe ISO-2, não mais o código de discagem.** O parâmetro antigo era `"55"`; passar `"BR"` para a versão antiga tiraria os não-dígitos, ficaria vazio e devolveria o número **sem prefixo nenhum**. Por isso `DIAL_PLANS` em `lib/crypto/hash.ts` guarda, por país, o código E.164 **e os tamanhos do número nacional**. O tamanho importa: a regra antiga ("10 ou 11 dígitos = nacional") é brasileira, e aplicada a um americano que digitou `1 555 123 4567` (11 dígitos) prefixaria duas vezes. País fora da tabela cai no plano do país padrão, com aviso no log — nunca sem prefixo. Adicionar um país é uma linha.
  - **Telefone digitado com `+` vale como veio**, inclusive de um país diferente do da moeda (americano pagando em BRL). Fora isso, **para o Brasil o resultado é idêntico ao anterior** — conferido em 200 mil entradas aleatórias contra a versão antiga.
  - **Hashes de telefone gravados antes desta mudança não são recalculados.** Os de `visitors` não têm como (só o hash é guardado); os de `purchases` teriam, a partir de `buyer_phone`, mas não vale a migration: para BR o hash é o mesmo, e o volume fora do Brasil era de desenvolvimento.
- **BUG CORRIGIDO: o `ga_client_id` nunca era capturado na primeira visita.** O cookie `_ga` só nasce depois que o `gtag.js` baixa e executa — sempre DEPOIS do primeiro `/api/identify`. O `_fbp` tinha tratamento pra isso (`ensureFbp()`), o `_ga` não tinha. Resultado: todo visitante de primeira viagem ficava com `ga_client_id` e `ga_session_id` nulos, e a compra do webhook, que reusa esse id pra cair na sessão certa, virava tráfego direto órfão no GA4 — justamente no caso mais comum, visita/checkout/compra na mesma sessão. Agora `backfillGaClientId()` usa `gtag('get', id, 'client_id', cb)`, a API oficial, que enfileira o callback até o script estar pronto (sem polling nem palpite de timing), e manda um identify complementar só quando o id aparece. Como o `/api/identify` não apaga campo nulo, repetir é seguro. Detectado no primeiro visitante real da LP, em 2026-09-18.
- **Captura de formulário:** o caminho principal é o site chamar `negou.identify({...})`. O farejador de `submit`/clique é a rede de segurança. A **lista de proibições vem primeiro e é definitiva**: `type=password`, `hidden`, `file`, `autocomplete^="cc-"`, qualquer nome batendo senha/cartão/CVV/CPF/código, valor que passa no Luhn com 13-19 dígitos, e `data-negou-ignore`. Formulário que contém campo de senha é ignorado **por inteiro** (é tela de login: nada a ganhar, tudo a perder), e o mesmo vale pra formulário cujo `action` aponta pro checkout. Email é conferido antes de telefone, pra um campo chamado "email" com dígitos nunca ser lido como telefone.
- **O `_fbp` é gerado por nós quando não existe**, antes de carregar o `fbevents.js`. Com o `fbq('track')` suprimido não dá pra contar que o script do Meta grave o cookie, e quem bloqueia o `fbevents` por extensão nunca teria `_fbp` nenhum. Gravar **antes** é o que evita o pior caso: o fbevents acha o cookie pronto e reaproveita, em vez de criar um segundo valor — dois `_fbp` pro mesmo navegador derrubariam a correspondência.
- **O `init()` do `track.js` virou assíncrono** (espera o `/api/identify` com teto de 800 ms). Isso habilita o modo adaptativo e, de quebra, corrige um defeito que já existia: o PageView chegava ao servidor antes de `fbp`/`fbc`/geo serem gravados. Como `init` agora espera, um `negou.track()` chamado cedo é enfileirado localmente, e o `pagehide` esvazia essa fila na hora pra quem sai antes do teto.

### ⚠️ Ordem obrigatória: migration ANTES do deploy

`/api/event` grava as colunas novas. **Sem a migration aplicada, ele devolve 500 e a captura para por completo** — verificado na prática, não suposto. Diferente do rate limit (que falha aberto de propósito), aqui não há como degradar sem duplicar todo o caminho de disparo, e duplicá-lo abriria a porta pro envio em dobro. Então: rode a migration no SQL Editor **primeiro**, depois faça o deploy.

---

## Tela de Eventos (fase 8a — implementado)

A primeira das quatro telas do dashboard, e de propósito a primeira: é a única
que tem valor com o banco quase vazio, porque ela responde *"esse evento saiu?"*
sem abrir o SQL Editor. Antes dela, a única prova de vida da fila da fase 7.5 era
um script de terminal.

- **Leitura sob RLS, não `service_role`.** `lib/dashboard/events.ts` usa
  `createClient()` (anon + cookies). As policies `select using (true)` de
  `events_log`/`visitors`/`purchases` existem desde a fase 2 justamente para
  isso. `lib/settings/queries.ts` usa `service_role` por outro motivo (as tabelas
  de credencial não têm policy de SELECT nenhuma) — **não copie aquele padrão
  para as telas de dado.**
- **Dois módulos, não um.** Constantes e tipos dos filtros moram em
  `lib/dashboard/filters.ts`, sem `server-only`; `events.ts` (que importa
  `server-only`) fica só com as consultas. Se a barra de filtros, que é Client
  Component, importar uma constante de `events.ts`, o bundler arrasta o módulo
  inteiro pro cliente e o build morre com *"'server-only' cannot be imported from
  a Client Component module"*. Mesmo motivo de `lib/settings/dispatch-modes.ts`
  existir.
- **Não passe o query builder do Supabase por um genérico seu.** A primeira
  versão tinha um helper `aplicar<T extends {gte,eq,or}>(q: T)` e o TypeScript
  estourava com *"type instantiation is excessively deep and possibly infinite"*.
  O erro aponta para a linha do `.select()`, o que faz parecer que o culpado é a
  string de colunas — não é: com `select("*")` acontece igual. A solução é
  `condicoesDe()` devolver condições como dados e cada consulta aplicá-las num
  `for`, sem genérico nenhum no meio.
- **`Date.now()` não pode ser chamado dentro de um componente.** O lint do React
  19 (`react-hooks/purity`) recusa. Por isso `listEvents()` devolve `agoraMs` — é
  a função de dados que carimba o instante, e a tabela usa isso pra dizer quanto
  falta pro evento pendente sair.
- **Fuso fixo em `America/Sao_Paulo`** — hoje em `lib/dashboard/timezone.ts`, e
  usado tanto para formatar quanto para recortar e agregar. A Vercel roda em UTC:
  sem fixar, um evento das 21h apareceria como meia-noite do dia seguinte e a data
  renderizada no servidor divergiria da do navegador. **Esta fase só fixou o fuso
  da formatação e deixou o recorte e os baldes em UTC** — ver "Geolocalização e
  fuso horário" acima, onde isso foi corrigido.
- **Filtros na URL, não em estado de React.** `?evento=&status=&periodo=&q=&pagina=`.
  Link compartilhável, botão voltar funcionando, página ainda renderizada no
  servidor, zero `useEffect` de busca. Mudar qualquer filtro zera a paginação.
- **Os chips de contagem ignoram o filtro de status** (e só ele). Se contassem o
  status selecionado, os outros chips zerariam e deixariam de servir como
  navegação.
- **`skipped` é cinza, nunca vermelho nem âmbar.** Não é erro: é o evento com
  mais de 6 dias que `claim_pending_events` descarta de propósito, porque um
  `event_time` velho faz o Meta rejeitar o lote inteiro. O tooltip diz isso com
  todas as letras. Mesma lição da fase 4, onde um resultado esperado pintado de
  âmbar foi reportado como falha.
- **Payload vazio precisa dizer por quê.** `purge_old_event_payloads()` zera os 4
  jsonb depois de 14 dias; sem uma mensagem explícita o modal vazio parece
  "o disparo não aconteceu". O mesmo vale pro GA4, que legitimamente não é
  acionado em evento de navegador.
- **O topo da tela é um bloco de 2 colunas, não uma pilha.** À esquerda,
  título/descrição em cima e os chips de status embaixo (`justify-between`, que
  é o que faz a base das duas colunas coincidir); à direita, o gráfico ocupando
  a altura das duas linhas. Por isso os chips saíram de `Conteudo` e ganharam
  `ChipsSlot` com `Suspense` próprio. Abaixo de `lg` vira uma coluna só, na
  ordem título → chips → gráfico: os chips são navegação, o gráfico é
  indicador. Em "Tudo" não há gráfico, então o `grid-cols-2` **não** é aplicado
  — senão metade da largura ficaria em branco.
- **O gráfico virou um widget de linha no cabeçalho** (`events-chart-widget.tsx`),
  não mais um card de largura total entre os filtros e a tabela. Três detalhes
  que não são estéticos:
  - **Ele busca a própria série e tem o próprio `Suspense`.** O `<PageHeader>`
    renderiza FORA do Suspense principal, de propósito, pro título aparecer na
    hora. Se o widget dependesse do `Promise.all` de `Conteudo`, o título ficaria
    esperando a query do gráfico. Isso duplica uma chamada a `getSerieDiaria` —
    troca aceitável, é query independente e capada em 20k linhas.
  - **O toggle lê o `localStorage` por `useSyncExternalStore`, não por
    `useEffect` + `setState`** — este último é exatamente o que o lint do React
    19 acusa (`react-hooks/set-state-in-effect`), mesmo motivo de
    `hooks/use-mobile.ts` ter sido reescrito. Padrão é **visível**: aba anônima
    ou storage bloqueado não pode esconder o gráfico em silêncio.
  - **Os números nos pontos só aparecem com ≤ 10 pontos** (Hoje e 7 dias). Em 30
    dias, 30 rótulos viram borrão; o tooltip continua dando o valor exato.
  - **Há um `<YAxis hide>` com `padding.bottom`.** Ele não desenha nada: existe
    só para a linha do zero não encostar na base, porque os rótulos de `outros`
    (quase sempre 0) caíam em cima dos ticks de data.
- **A série do gráfico é agregada em JS, não em SQL.** Uma função de agregação
  exigiria migration nova (aplicada à mão no SQL Editor) e não valia travar a
  tela nisso. Só duas colunas são trazidas, com teto de 20k linhas. Se o volume
  passar disso, o certo é virar RPC.
- **`npm run seed` / `npm run seed:limpar`** (`scripts/seed-events.mjs`) criam e
  removem dados de demonstração para desenvolver as telas. Tudo que ele cria tem
  `trck_user_id` começando em `seed_`, e é só isso que o `--limpar` apaga. Ele
  escreve **direto no Postgres**, sem passar por `/api/event`: como o
  `test_event_code` está vazio, qualquer evento que passasse pelo endpoint
  contaria como real no pixel.

---

## Geolocalização e fuso horário (revisão pós-8a — implementado)

- **A geolocalização É a da Vercel, e sempre foi.** Não existe serviço externo de
  geoip no projeto: nenhuma dependência, nenhuma chamada, nenhuma credencial. Os
  headers `x-vercel-ip-*` são resolvidos na borda antes de a função rodar e são
  **gratuitos em todos os planos** (Hobby, Pro e Enterprise). Se um dia alguém
  propuser MaxMind/ipinfo/ipapi: custam US$ 20–50/mês, acrescentam credencial e
  uma chamada de rede no caminho quente de todo `/api/identify`, e o ganho sobre
  a base da Vercel é marginal.
- **`@vercel/functions` foi avaliado e recusado.** O `geolocation()` oficial não
  expõe o `timezone`, e o `region` que ele devolve é a região da Vercel que
  atendeu a requisição (`gru1`), não a do usuário. Seria uma dependência a mais
  para ler os mesmos headers com menos informação. `lib/geo.ts` lê direto.
- **São 8 headers e por muito tempo só 3 eram lidos.** Agora `getGeo()` devolve
  também `postalCode`, `latitude`, `longitude` e `timezone`. `x-vercel-ip-continent`
  segue de fora: não há uso num negócio de um país só.
- **O `zp` do Meta ia vazio.** `ct`/`st`/`country` sempre foram enviados; o CEP
  não, por falta de exatamente um header. `hashZip(valor, país)` segue a doc:
  minúsculo, sem espaço e sem traço, e **só os 5 primeiros dígitos quando o país
  é `US`**. CEP brasileiro vai com os 8 dígitos — cortar em 5 deixaria só o
  prefixo do bairro e destruiria a precisão justamente onde ela existe.
- **CEP de IP é sinal fraco; o do checkout é o bom.** O derivado de IP aponta a
  área do provedor, não o endereço da pessoa. Por isso `buyerPostalCode` entra em
  `fill_visitor_pii` (que só preenche buraco) e tem precedência no disparo da
  compra, exatamente como email e telefone.
- **MEDIDO EM PRODUÇÃO: no Brasil o `x-vercel-ip-postal-code` vem com 5 dígitos,
  não 8.** Um IP de São Paulo devolveu `01000` — o prefixo do CEP, não o CEP.
  Consequência honesta: o `zp` derivado de IP gera `sha256("01000")` e
  **praticamente nunca vai casar** com o CEP de 8 dígitos que o Meta tem do
  comprador. Ele continua sendo enviado (um parâmetro que não casa não subtrai
  dos outros, e há bases que também guardam CEP grosso), mas **quem vai fazer o
  `zp` valer é o CEP do checkout**, pelo caminho do webhook. Não interprete um
  `zp` presente como "correspondência por CEP funcionando". O mesmo vale, em
  menor grau, para `ct`: a cidade do IP é a da saída do provedor.
- **BUG CORRIGIDO: o GA4 geolocalizava toda compra no datacenter da Vercel.** O
  Measurement Protocol deriva a geografia do IP de **quem faz a chamada** — num
  envio server-side, a função. Sem `ip_override` o relatório de receita por
  região estava simplesmente errado, sem nenhum erro aparecer. `ip_override` vai
  no **topo** do corpo, ao lado de `client_id`; dentro de `params` ele seria
  tratado como parâmetro qualquer do evento e nada mudaria. Escolhido em vez de
  `user_location` porque o Google usa a própria base de geo, a mesma dos eventos
  que chegam pela gtag — os dois caminhos concordam. **Os dois campos não
  convivem:** a doc é explícita que `user_location`, quando presente, tem
  precedência e anula o `ip_override`.
- **BUG CORRIGIDO: o painel renderizava em Brasília e agregava em UTC.**
  `periodoInicio()` usava `setHours(0,0,0,0)`, que opera no fuso do **processo**
  (UTC na Vercel), e a série do gráfico usava `toISOString().slice(0,10)`. Então
  "Hoje" começava às 21h de ontem no horário de Brasília e trazia eventos que a
  própria tabela exibia com a data de ontem, e um evento das 22h caía no balde do
  dia seguinte. `lib/dashboard/timezone.ts` passa a ser a **única** fonte do fuso
  (`FUSO_PAINEL`), com `diaLocal()` e `inicioDoDiaLocal()`. `format.ts` importa a
  constante de lá em vez de declarar a sua — ter duas cópias foi o que permitiu a
  tela se contradizer.
- **`lib/dashboard/timezone.ts` NÃO tem `server-only`**, pelo mesmo motivo de
  `filters.ts`: a barra de filtros é Client Component e importa dali.
- **Os períodos são dias de calendário, não janelas deslizantes.** `hoje: 1`,
  `7d: 7`, `30d: 30`, e `periodoInicio()` devolve `inicioDoDiaLocal(dias - 1)`.
  Com janela deslizante o primeiro balde do gráfico nascia sempre parcial, porque
  ele agrupava por dia enquanto o filtro cortava no meio do dia mais antigo.
- **`inicioDoDiaLocal` faz duas passadas de offset de propósito.** O offset certo
  é o do instante ALVO, não o de agora. O Brasil não tem horário de verão desde
  2019, então hoje dá no mesmo — mas se voltar a ter, uma passada só erraria em
  uma hora nos dois dias de transição, em silêncio.
- **O fuso do painel é fixo; o do visitante é dado.** São coisas diferentes. O
  painel agrega sempre em `America/Sao_Paulo` (é o que faz servidor e navegador
  concordarem sobre onde um dia começa); o `geo_timezone` do evento aparece no
  modal como "hora local do visitante", e **só quando difere** do fuso do painel.
  Sem isso, um evento das 23h em Manaus é lido como meia-noite e vira "compra de
  madrugada" numa análise de horário — conclusão errada tirada de dado certo.
- **O `track.js` continua sem mandar fuso nenhum.** O `Intl` do navegador seria
  mais preciso que o derivado de IP, mas quebraria a invariante da fase 5 ("geo é
  sempre resolvido no servidor", com teste cobrindo) e obrigaria a republicar o
  script em todos os sites. O header resolve sem isso.
- **`events_log` guarda o geo do INSTANTE do evento**, duplicando o de `visitors`
  de propósito — já era assim para country/region/city. Quem compra em viagem tem
  o PageView num lugar e o Purchase em outro, e cada linha precisa mostrar onde
  ela aconteceu. O disparo, esse, continua lendo `visitors` na hora do envio.

### ⚠️ Ordem obrigatória: migration ANTES do deploy (de novo)

`20260918120000_geo_enriquecido.sql` acrescenta 8 colunas e troca a assinatura de
`fill_visitor_pii`. `/api/identify` e `/api/event` passam a gravar essas colunas —
**sem a migration aplicada, os dois devolvem 500 e a captura para por completo**,
igual à fase 7.5. Rode no SQL Editor primeiro, depois faça o deploy.

`create or replace` **não** adiciona parâmetro a uma função: cria uma sobrecarga, e
aí o PostgREST passa a recusar a chamada por ambiguidade. Por isso a migration faz
`drop function` antes. O parâmetro novo vai no fim e tem default, então as chamadas
posicionais de `verify_phase7_5.sql` continuam válidas.

---

## Tela de Vendas (fase 8b — implementado)

Substituiu o placeholder de Faturamento: a rota é `/vendas`, o item da sidebar
se chama **Vendas**, e `/faturamento` virou um `redirect("/vendas")` para não
quebrar link salvo. **Ter duas telas de receita era o risco real**, não o 404:
a de Leads soma só compras atribuídas e diria outro número.

- **Esta é a tela do total de vendas; a de Leads não é.** `lib/dashboard/vendas.ts`
  parte de `purchases`, então compra com `match_found = false` entra aqui e nunca
  aparece em Leads, que parte de `visitors`. Os dois números divergirem é o
  comportamento correto — não "conserte" a divergência igualando as consultas.
- **Taxas, Imposto, Custos de Produto e Faturamento Líquido ficaram DE FORA, de
  propósito.** O desenho de referência tinha os quatro, todos rotulados
  "estimado". Nenhum desses dados existe no banco nem chega pelo webhook, e
  estimá-los por percentual chutado produziria um "líquido" que parece número e
  não é. Entram quando a taxa real da plataforma passar a ser capturada — o
  array `commissions` do PerfectPay, onde `affiliation_type: 0` é a plataforma,
  é o candidato.
- **Leitura sob RLS**, com `createClient()` (anon + cookies), igual a Eventos e
  Leads. `purchases` tem `select using (true)` desde a fase 2. Não copiar o
  `service_role` de `lib/settings/queries.ts`, que existe por outro motivo.
- **O resumo ignora o filtro de status, e só ele** — mesma decisão dos chips de
  Eventos. Se o status entrasse, escolher "Reembolsadas" zeraria o card de
  faturamento e os cards deixariam de servir como panorama.
- **A quebra por forma de pagamento conta só venda APROVADA.** Um boleto gerado
  e não pago inflaria o "Boleto" e faria o gráfico descrever intenção, não venda.
- **Moeda não se soma.** R$ 100 + US$ 100 não são 200 de nada: o resumo agrega
  por moeda, exibe a predominante e avisa quando o recorte mistura mais de uma.
- **`created_at` NÃO é a hora do pagamento** — é a do primeiro webhook daquela
  transação, que para boleto e Pix é a da GERAÇÃO. Por isso a coluna se chama
  "Registrada em" e o painel lateral mostra `updated_at` ao lado. Chamar
  qualquer um dos dois de "hora da compra" convidaria a conclusão errada numa
  análise de horário.
- **A linha inteira abre o detalhe**, sem botão "ver". Como `<tr>` não é focável
  e o `SheetTrigger` do Radix só instala o `onClick`, a linha recebe `tabIndex`,
  `role="button"` e o tratamento de Enter/Espaço — sem isso a tela ficaria
  inalcançável por teclado.
- **O período fica FORA do popover de Filtros.** É o controle que muda o
  significado de todos os números da tela; escondê-lo deixaria o usuário lendo
  "R$ 12.400" sem ver de que janela ele fala. O resto (status, pagamento, busca)
  fica atrás do botão. Primeira vez que `ui/popover.tsx` é usado no app — ele
  importava `cn` do pacote `cn` em vez de `@/lib/utils`, corrigido aqui.
- **`payment_method` e `platform_payment_method` são duas colunas**, espelhando
  `status`/`platform_status`. O canônico tem 4 valores; o bruto preserva a
  granularidade que vira `other` (google_pay, apple_pay, picpay, paypal,
  open_finance) sem migration nova.
- **`null` não é `other`.** `null` = a plataforma não informou; `other` =
  informou algo fora dos três. A tela mostra "Não informado" no primeiro caso, e
  o filtro tem um valor próprio para ele. Confundir os dois esconderia
  justamente o sintoma de o adaptador ter parado de ler o campo.
- **A doc do PostBack do PerfectPay não é pública.** `payment_type_enum` está
  confirmado no OpenAPI (`app.perfectpay.com.br/docs/api.json`), mas ele
  documenta a API de vendas; a seção "Webhooks" não está lá e `llms-full.txt`
  responde 404. Ou seja: está confirmado que a plataforma TEM o campo, não que o
  postback o entregue com esse nome. Por isso `readPaymentMethod()` aceita
  `payment_type_enum`, `payment_method_enum`, `payment_type` e `payment_method`,
  número ou texto, e a ausência total vira `null` — mesma postura já usada ali
  para telefone e CEP. Quando a primeira venda real chegar, conferir
  `raw_webhook` e apertar a leitura.
- **Erro de leitura NÃO substitui a tela.** Os cards renderizam zerados e o
  aviso vem numa faixa acima deles. Trocar a página inteira por um alerta
  vermelho fazia uma falha momentânea parecer que o painel tinha quebrado. Mas o
  aviso **não pode sumir**: num painel de vendas, "R$ 0,00" silencioso não deixa
  distinguir "não vendi nada" de "a consulta falhou", e essa é a pior dúvida
  possível aqui. Por isso `getVendasResumo` devolve o resumo zerado E a mensagem.
- **As 4 formas canônicas aparecem sempre, mesmo zeradas** ("Cartão 0 · Pix 0 ·
  Boleto 0 · Outros 0"). Ver o vocabulário completo responde "não vendi no Pix"
  em vez de deixar a dúvida entre isso e "a tela não sabe sobre Pix".
  `nao_informado` é a exceção e só entra quando tem volume — ela não é uma forma
  de pagamento, é a ausência do dado, e mostrá-la zerada por padrão sugeriria um
  problema onde não há nenhum. O card também não elege uma forma "principal"
  quando tudo está zerado: exibe "—", porque escrever "Cartão" ali afirmaria algo
  que não aconteceu.
- **O seed passou a gerar forma de pagamento e nome do comprador.** Sem isso a
  tela nasceria inteira em "Não informado" com a coluna Comprador vazia, e não
  daria para desenvolver contra ela.
- **Dois defeitos do `seed-events.mjs` corrigidos de passagem:** (1) o
  `eventoDeBorda` tinha menos chaves que os outros eventos (faltavam as `utm_*`,
  `custom_data`, `dispatch_claimed_at` e `dispatch_error`), e o PostgREST recusa
  **o lote inteiro** com "All object keys must match" — o seed estava quebrado
  desde a revisão de geo/fuso, quando aquele evento foi acrescentado; (2) comprar
  exigia `identificado`, o que não corresponde ao sistema real — a vinculação
  principal é pelo `trck_user_id` da URL do checkout, que funciona para quem
  nunca preencheu formulário nenhum. Além de mais fiel, destravou o volume: 30
  visitantes rendiam 2 ou 3 compras, e a tela de Vendas ficava sem dado para
  conferir gráfico, quebra por pagamento e paginação.

### ⚠️ Ordem obrigatória: migration ANTES do deploy (de novo)

`20260919120000_purchases_forma_pagamento.sql` acrescenta as 2 colunas, e o
upsert do webhook passa a gravá-las numa chamada só. **Sem a migration, o
PostgREST rejeita a linha inteira e a compra deixa de ser registrada** — mesma
lição das fases 7.5, geo e da migration de dados do comprador. O backfill a
partir de `raw_webhook` vai junto no mesmo arquivo, e é específico do PerfectPay
(por isso filtra por `platform`): aplicar aquele mapa a outra plataforma
produziria dado errado em silêncio.

---

## Tela de Geo (fase 8c — implementado)

Mapa-múndi interativo que **já abre enquadrado onde os visitantes estão**, mais
três chips de ranking (países/estados/cidades) e a mesma quebra para
faturamento. **Nenhuma migration**: todas as colunas já existiam desde
`20260918120000_geo_enriquecido.sql`, cujo comentário previa exatamente isto
("o mapa da fase 8c, com precisão de ponto em vez de só pintar o estado").

- **O enquadramento automático é por PERCENTIL PONDERADO, não por média e desvio
  padrão.** Essa é a decisão que define a tela. Com média/desvio, um único
  visitante em Portugal contra 31 no Brasil — exatamente o que o banco tem hoje
  — alargaria a moldura até o meio do Atlântico e o mapa abriria mostrando
  oceano. Cortando 5% de cada ponta por eixo, o outlier sai do cálculo e uma
  concentração de verdade (30% num segundo país) continua dentro e alarga a
  moldura. Medido nos dois casos: 97% dos visitantes enquadrados no primeiro,
  os dois países visíveis no segundo. O ponto descartado continua **desenhado**
  no mapa; ele só não manda no enquadramento inicial.
- **O teto de zoom NÃO pode ser uma constante.** Foi assim na primeira versão
  (`ZOOM_MAX = 10`) e estava errado, porque o zoom aqui é um multiplicador sobre
  uma escala que já depende do tamanho da tela: o mesmo recorte do Brasil pedia
  4,3 no desktop e 13,9 num celular de 360 px. O teto fixo travava o celular em
  10 e o mapa abria mais afastado justamente onde sobra menos espaço. Agora
  `zoomMaximoDe(largura, altura)` deriva o teto de um limite **geográfico**
  (`ABERTURA_MINIMA_GRAUS = 8`). O mesmo número vai para o `maxZoom` do
  `ZoomableGroup` — se o mapa aceitasse menos zoom do que o enquadramento pede,
  o d3-zoom cortaria a diferença em silêncio.
- **A escala da projeção também é nossa, não a do d3.** O react-simple-maps não
  ajusta escala sozinho: sem `projectionConfig.scale`, ele usa a padrão do d3,
  dimensionada para 960×500, e num card de outro formato o mapa nasce cortado
  nas laterais — afastar o zoom até o fim nunca mostraria o mundo todo.
  `escalaDoMapa()` resolve, e `geo-fit.ts` recria a projeção **exatamente** como
  o componente a cria. Se as duas divergirem, o enquadramento calculado aponta
  para um lugar diferente do desenhado.
- **`lib/dashboard/geo-fit.ts` NÃO tem `server-only`**, e desta vez não é só pelo
  motivo de sempre: o cálculo roda mesmo é no cliente, porque depende do tamanho
  medido do card. O mapa é `dynamic(ssr: false)` — não existe enquadramento a
  computar no servidor, onde não há tamanho.
- **Quem guarda a vista do mapa é o `geo-view.tsx`, não o mapa.** Os chips são
  irmãos do mapa, não filhos; com o estado no pai, clicar num chip é um
  `setState` dentro de um handler de evento. As alternativas eram piores: um
  `useEffect` de sincronização é o que o lint do React 19 recusa
  (`react-hooks/set-state-in-effect`, a mesma pedra de `hooks/use-mobile.ts`), e
  remontar o mapa por `key` faria o topojson ser reprocessado e a tela piscar a
  cada clique.
- **A medida do card vem de um ref callback com `ResizeObserver`**, não de
  `useEffect`. `setState` dentro do callback do observer é evento, não efeito —
  é isso que mantém o arquivo fora daquele lint.
- **Os círculos são contra-escalados pelo zoom AO VIVO** (`useZoomPanContext`).
  Sem isso o círculo é ampliado junto com o mapa e, com zoom 8, uma cidade vira
  uma bolha do tamanho do estado. O raio é proporcional à **raiz** da contagem,
  porque quem se compara é a área. Os maiores são desenhados por último: em SVG
  quem vem depois fica por cima, e um ponto de 500 tapando um de 3 é melhor que
  o contrário.
- **A terra é `pointerEvents="none"`.** Sem isso ela rouba o hover dos círculos.
  O arrasto continua funcionando porque quem escuta é o retângulo transparente
  que o próprio `ZoomableGroup` põe por baixo.
- **Faturamento por região vem do visitante casado, e isso foi CONFERIDO no
  código antes de construir.** `app/api/webhook/compra/[platform]/route.ts:154`
  copia `geo_country/region/city` de `visitors` para `purchases` — não resolve
  geo do IP de quem chama o webhook, que seria o servidor da plataforma de
  pagamento e não diria nada sobre o comprador. Se fosse o contrário, a tela
  inteira estaria descrevendo o datacenter do PerfectPay (foi exatamente o bug
  que o GA4 tinha antes do `ip_override`).
- **Venda sem vínculo não some: ela é declarada.** Compra com
  `match_found = false` nasce sem geo e não entra em ranking nenhum — então o
  bloco diz, com todas as letras, quanto de receita ficou fora e por quê. Uma
  soma que não fecha sem explicação é pior que um número faltando.
- **Os chips de faturamento não são clicáveis, os de visitante são.**
  `purchases` não tem latitude nem longitude; não há para onde apontar o mapa a
  partir deles. Um botão que parece clicável e não faz nada seria pior do que o
  texto.
- **O padrão de período aqui é `7d`, igual ao de `lib/dashboard/filters.ts`** —
  que é de onde o seletor da topbar lê o dele. Divergir (como a tela de Vendas
  faz hoje, com `30d`) faz a topbar destacar "7 dias" enquanto a tela mostra
  outro recorte: a pílula acesa passa a mentir.
- **`/geo` precisou entrar em `SHOW_ON_ROUTES`** do
  `components/dashboard/topbar-period-selector.tsx`. Sem isso o seletor de
  período simplesmente não aparece na rota nova.
- **O país é traduzido por `Intl.DisplayNames`, o estado não.** "BR" vira
  "Brasil" sem tabela nenhuma para manter; a UF fica "SP" porque é como o
  brasileiro lê o dado — e escrever "São Paulo" no chip de estado o deixaria
  indistinguível do chip de cidade logo ao lado.
- **O TopoJSON é declarado em `types/world-atlas.d.ts`, não importado como
  literal.** Com `resolveJsonModule`, o TypeScript inferiria o arquivo inteiro
  (105 KB de coordenadas) a cada checagem, sem ganho nenhum. Ele sai num chunk
  próprio de 184 KB, carregado só quando alguém abre o mapa — conferido no
  `.next/static/chunks`.
- **Limitação registrada no código:** a longitude é tratada como eixo linear, então
  uma distribuição que cruzasse o antimeridiano (±180°) seria enquadrada no lado
  errado do planeta. Não acontece num negócio de um país só, e tratar direito
  exigiria estatística circular — fica escrito em vez de virar surpresa.
- **Fora do escopo, por decisão do usuário: demografia do GA4** (gênero, idade).
  O GA4 só RECEBE eventos deste sistema; ele não devolve demografia. Teria de ser
  uma integração de leitura nova — Google Analytics Data API, credencial de
  serviço por cliente (a arquitetura é multi-cliente) e cache por causa de cota.
  É uma fase própria, não um adendo desta.

---

## Tela de Integrações + Stripe (implementado)

Rota `/integracoes`, na lista principal da sidebar. Ela reúne o que fala **com**
o tracker (plataforma de venda, webhook, automação, MCP); Configurações continua
cuidando dos **destinos** para onde o tracker manda evento (Meta, GA4). São
direções opostas do mesmo fluxo, e foi a mistura das duas numa tela só que
motivou a separação.

- **O token global de webhook NÃO foi movido pra cá.** Ele continua em
  Configurações → Geral, e a tela nova apenas aponta pra lá. Duplicar a
  interface de um segredo em duas telas é convite pra as duas divergirem — e o
  token é um só para todas as plataformas.
- **O Stripe é a primeira plataforma cuja autenticação não é o token
  compartilhado.** Ele assina cada requisição: header `Stripe-Signature`, com
  `HMAC-SHA256(signing_secret, "<timestamp>.<corpo bruto>")`. As duas camadas
  convivem — o token global é o primeiro portão (vai na querystring da URL
  cadastrada, porque o Stripe não permite header customizado, mesma situação do
  PerfectPay), e a assinatura é a prova criptográfica de que o payload veio
  mesmo do Stripe.
- **Por isso `route.ts` passou a ler o corpo como TEXTO antes de virar JSON.**
  Reserializar o objeto muda um espaço e invalida a assinatura. `readJsonBody`
  ganhou um irmão, `parseJsonText`, que recebe o texto já lido; `readJsonBody`
  virou um wrapper dele, e o comportamento para `/api/event` e `/api/identify`
  é byte a byte o mesmo de antes.
- **`stripe_accounts` guarda DUAS credenciais no Vault, não uma** — é a
  diferença estrutural em relação a `meta_pixels`/`ga4_accounts`/
  `meta_ad_accounts`. A secret key autentica chamadas NOSSAS à API do Stripe
  (teste de conexão); o signing secret verifica o que o Stripe manda PRA GENTE.
  Os dois no Vault, e não como hash igual ao `webhook_token_hash`: aquele só
  precisa ser comparado, este precisa ser USADO como chave de HMAC.
- **Singleton (`id boolean`), como `settings`.** Um cliente por deploy, um
  Stripe por cliente — a mesma premissa que já trata o PerfectPay como único.
- **A chave de idempotência é o `payment_intent` (`pi_...`), não o id da
  Checkout Session.** É o único identificador que também aparece no evento de
  reembolso, então é o que amarra as transições de status na MESMA linha de
  `purchases`. Usar `cs_...` faria o reembolso criar uma venda nova.
- **A rota agora preserva o vínculo com a visita quando o webhook novo não traz
  vínculo próprio** (4º passo do `findVisitor`). Não é atribuição nova, é
  proteção: a gravação é upsert da linha inteira, e o evento de reembolso do
  Stripe não carrega o `client_reference_id` da sessão. Sem isso, o reembolso de
  um visitante que nunca deixou email no site apagaria o `trck_user_id` da
  compra — a venda perderia a origem justamente por ter sido reembolsada.
- **`client_reference_id` é o `?src=` do Stripe**, confirmado na doc oficial
  (`docs.stripe.com/payment-links/url-parameters`): parâmetro de URL aceito no
  Payment Link, até 200 caracteres, devolvido no `checkout.session.completed`.
  O `track.js` decora sozinho os links `buy.stripe.com`, sem sobrescrever valor
  que o site já tenha posto ali. Payment Link em domínio próprio do cliente
  (`pay.dominiodele.com`) não é reconhecido: nesse caso a venda cai no
  casamento por email, um degrau abaixo de confiança.
- **UTM de venda Stripe fica nula, e isso não é bug.** O Stripe aceita `utm_*`
  na URL do Payment Link, mas — a doc é explícita — elas só viajam para a URL de
  redirecionamento pós-pagamento, nunca para o webhook. A atribuição de campanha
  continua vindo do visitante casado, que a guarda desde o PageView.
- **Moeda zero-decimal foi tratada na origem.** O Stripe manda o valor na menor
  unidade, e para JPY/KRW/VND e outras 13 essa unidade já é a inteira. Dividir
  por 100 faria ¥5.000 virar ¥50 — erro financeiro que não apareceria como erro
  nenhum. Moedas de 3 casas (BHD, JOD, KWD, OMR, TND) dividem por 1000.
- **Reembolso PARCIAL é recusado de propósito.** A venda continua valendo, só
  com valor menor, e `purchases` não tem onde guardar "quanto voltou". Marcar a
  linha inteira como reembolsada zeraria uma receita que em boa parte ficou de
  pé — é o tipo de número errado que ninguém confere.
- **Chargeback/disputa ficou DE FORA desta entrega, e está escrito no código.**
  O objeto Dispute do Stripe não traz dados do comprador, e como a gravação é
  upsert da linha inteira, aceitá-lo apagaria email e nome já gravados. Fazer
  direito exige uma chamada extra à API do Stripe para reidratar o Charge. O
  enum de `purchases.status` já tem `chargeback` pronto para quando for a hora.
- **O teste de conexão do Stripe é leitura real** (`GET /v1/balance`), não envio
  de evento como no Meta Pixel: aqui a credencial é confirmada na hora, com 401
  sem rodeios quando está errada. Já o signing secret **não tem como ser testado
  antes** — nenhuma API prova que uma assinatura vai bater. A tela diz isso e
  manda disparar um webhook de teste pelo painel do Stripe, mesma honestidade já
  adotada com o `"verificar"` do GA4.
- **A tela orienta a assinar só os 4 eventos tratados.** Um endpoint cadastrado
  como "todos os eventos" faz o Stripe mandar dezenas de tipos que não são
  venda; eles são recusados sem efeito nenhum aqui, mas aparecem como falha no
  log do próprio Stripe e confundem na hora de investigar.
- **A tela de Vendas não precisou de mudança nenhuma.** `purchases.platform` é
  lida como texto puro, sem enum no TypeScript e sem filtro de plataforma na UI
  — conferido antes de construir. Venda do Stripe já aparece lá.

### ⚠️ Ordem obrigatória: migration ANTES do deploy (de novo)

`20260921130000_stripe_integration.sql` acrescenta `'stripe'` ao CHECK de
`purchases.platform` e cria `stripe_accounts`. Sem ela: o CHECK recusa a linha
e **a venda do Stripe não é registrada**, e a tela de Integrações não consegue
ler as credenciais. A tela avisa qual arquivo rodar em vez de quebrar, mas o
webhook não tem como degradar — ele recusa, porque aceitar sem poder conferir a
assinatura injetaria venda falsa no painel e no Meta.

---

## Arquitetura multi-cliente (1 repo → N deploys)

O mesmo repositório é implantado uma vez por cliente: cada um com seu projeto
Vercel, seu projeto Supabase e seu domínio. **Nada específico de cliente no
código** — o que distingue um deploy do outro são as variáveis de ambiente.
Passo a passo do onboarding em [ONBOARDING.md](./ONBOARDING.md); modelo das
variáveis em `.env.example`.

- **`TRACKING_ALLOWED_ORIGINS` é a variável que faz ou quebra a captura.** A
  allowlist de CORS era uma constante com os 6 domínios da Negou. Num deploy de
  cliente o site dele nunca entrava nela, e o resultado não era um erro: o
  `track.js` faz POST com `Content-Type: application/json`, o que obriga um
  preflight; sem `Access-Control-Allow-Origin` o navegador cancela o POST, o
  endpoint chega a responder 200, e o `post()` engole a falha com
  `.catch(function () {})`. Zero eventos, zero aviso. Continua sendo comparação
  por igualdade exata — **nunca** `endsWith`, pelo motivo já documentado no
  arquivo. A própria URL de produção do projeto entra sozinha na lista.
- **`TRACKING_DEFAULT_PHONE_COUNTRY` é o país (ISO-2) do telefone quando não há
  compra** para derivá-lo da moeda — ver "Disparo atrasado". Padrão `BR`; cliente
  fora do Brasil **precisa** preencher, porque errar não dá erro, só zera a
  correspondência de telefone no Meta. Entra no wizard do botão com
  `envDefaults` = `BR`. É `const` de topo de módulo: mudar exige novo deploy.
- **O nome do painel vem de `lib/branding.ts`**, não de string literal em nove
  `page.tsx`. `APP_NAME` vai no `<title>`; `BRAND_NAME` é o wordmark da sidebar
  e do login e cai para o `APP_NAME` quando não configurado. Os defaults são
  genéricos (`Tracking`) de propósito: um deploy mal configurado mostra um nome
  neutro, nunca a marca de outro cliente.
- **BUG CORRIGIDO: o cookie de identidade nunca era gravado em domínio
  `.com.br`.** `rootDomain()` pegava os dois últimos rótulos do hostname, o que
  só funciona num domínio de dois níveis como `negou.net`. Em
  `www.cliente.com.br` isso produzia `.com.br`, um sufixo público — e o
  navegador **ignora** a atribuição em vez de lançar erro, então o `catch` nunca
  rodava. A identidade caía só no localStorage e não atravessava subdomínio, em
  silêncio, em praticamente todo cliente brasileiro. Agora o `track.js` grava uma
  sonda do domínio mais amplo para o mais específico e fica no primeiro que o
  navegador aceitou de verdade. Comportamento em `negou.net` é idêntico ao de
  antes (verificado, 10/10 no teste de mesa).
- **O `track.js` não tem mais domínio de fallback.** `API_BASE` sai do `src` da
  própria tag; se não der para resolver, cai para `location.origin`. Um domínio
  fixo mandaria os eventos de um cliente para o tracker de outro.

### ⚠️ Ordem obrigatória: `TRACKING_ALLOWED_ORIGINS` ANTES do deploy

Mesma lição das migrations. A allowlist é um `const` de topo de módulo, resolvido
no cold start: preencher a variável depois **não** vale sem um novo deploy.
Publicar o código novo sem a variável preenchida derruba a captura do deploy
inteiro — inclusive o da própria Negou. Preencha na Vercel primeiro, depois
publique.

**Implementado (2026-09-22):** a allowlist agora sai também do painel. Uma
coluna `allowed_origins` em `settings` (tipo `text[]`) é editável em
**Configurações → Geral → Domínios liberados para captura**, e é lida com memo
de 60s no módulo `lib/settings/origins-config.ts` (mesmo padrão de
`dispatch-config.ts`). A variável **não foi aposentada**: ela vira bootstrap e
rede de segurança, porque uma falha de leitura do banco tem que **falhar
fechado** e manter o que a variável já libera. Allowlist final = variável ∪
banco, ambas lidas na função `isAllowedOrigin()` agora assíncrona de
`lib/cors.ts`. Mudança é totalmente invisível para quem chama (`corsHeaders`,
`jsonResponse`, `preflightResponse` viraram `async`, mas os handlers das 3 rotas
públicas já são `async` então não exigiu toques em call sites). O `verify:captura`
agora também consulta o banco e menciona ambas as vias de correção (painel ou
variável) quando uma origem falha no CORS.

### ⚠️ Produção PRECISA ser pública (Deployment Protection da Vercel)

**Aconteceu de verdade, em 2026-09-19:** o Deployment Protection do projeto
estava com `ssoProtection.deploymentType = "all"`, então **todo** o domínio —
`/track.js`, `/api/config/public`, `/api/identify`, `/api/event` — respondia
`302` para `vercel.com/sso-api`. O script nunca carregava e a captura ficou
zerada, sem um único erro em lugar nenhum.

O que torna esse bug traiçoeiro é **quem consegue testá-lo**: o navegador de
quem tem acesso ao projeto carrega uma sessão SSO da Vercel, atravessa a
proteção e vê o painel funcionar normalmente. Só o visitante anônimo é barrado —
exatamente o único que importa para a captura. Conclusão prática: **testar
tracking logado no painel não prova nada**; tem que ser janela anônima.

A configuração certa é *Vercel Authentication → Only Preview Deployments*
(`deploymentType: "preview"`). Não é frouxidão: os endpoints de captura são
públicos por contrato de arquitetura, e o painel continua atrás do `proxy.ts` e
da segunda checagem no `app/(dashboard)/layout.tsx`. Conferir com
`vercel project protection`, e o `npm run verify:captura` pega isso na primeira
checagem.

### ⚠️ `.env.local` não tem os segredos (variável "Secret" na Vercel)

Variável marcada como **Secret** na Vercel **não desce em texto puro** no
`vercel env pull` — o arquivo recebe o literal `[SENSITIVE]`. Hoje isso vale
para `TRACKING_ALLOWED_ORIGINS` e `SUPABASE_SERVICE_ROLE_KEY`, o que significa
que `npm run dev` e os scripts que leem `.env.local` (`verify:dispatch`, `seed`)
**não funcionam** com o arquivo recém-puxado: o Supabase devolve
`401 Invalid API key`. Não é credencial errada nem projeto trocado — é o valor
que nunca chegou. Preencha à mão os valores reais no `.env.local` local, ou
mude o tipo da variável na Vercel se ela não precisar ser Secret.

---

## Deploy 1-clique (implementado)

Três gargalos que exigiam o desenvolvedor — colar 10 migrations, criar o projeto
na Vercel, criar o usuário no Studio — viraram: rodar um arquivo, clicar num
botão, preencher um formulário. **Nenhuma migration nova**, nenhum `vercel.json`,
nenhuma variável de ambiente a mais.

- **`supabase/setup.sql` é GERADO, nunca editado à mão.**
  `scripts/build-setup-sql.mjs` concatena `supabase/setup-preflight.sql` +
  `supabase/migrations/*.sql`, e `npm run build` roda o `--check`, que **regenera
  em memória e compara byte a byte** — não confere hash contra um header, então
  pega migration nova, migration editada *e* alguém editando o resultado. Sem
  isso, acrescentar uma migration e esquecer de regerar daria a um cliente novo
  um banco incompleto, em silêncio.
- **Um arquivo, não dois, e a transação única é o motivo.** O SQL Editor executa
  o script colado numa transação só, então ou o schema inteiro aplica ou nada
  aplica. Isso não é obstáculo: é a proteção, porque as migrations **não são
  idempotentes** (`create table`/`create policy`/`create trigger` sem guarda).
  Dividir em "Parte A / Parte B" produziria o único estado do qual elas não se
  recuperam — meio aplicado. **Não divida.** `create extension` é transacional
  (não está na lista de comandos proibidos em bloco de transação) e o DDL é
  visível aos statements seguintes, então `pg_cron` criado no arquivo 1 e usado
  no 5 funciona. Nenhum `net.*` é *executado* no setup; a única referência está
  dentro do corpo de `tick_event_queue()`.
- **O preflight testa a VIEW do Vault, não o schema.** Das 4 funções de
  `vault_functions.sql`, três são `plpgsql` e são criadas sem erro mesmo sem o
  Vault — corpo de função PL/pgSQL só é analisado na execução, a mesma
  propriedade que escondeu o `malformed array literal` da fase 7.5. Quem quebra é
  `reveal_secret`, que é `language sql`. Por isso a checagem é
  `to_regclass('vault.decrypted_secrets')`.
- **`.gitattributes` com `*.sql text eol=lf` não é arrumação.** Com
  `core.autocrlf=true` as migrations ficam CRLF na árvore e LF no repositório; um
  gerador que lesse e escrevesse bytes crus faria o `--check` passar no Windows e
  falhar na Vercel, com a árvore perfeitamente correta. O gerador normaliza EOL
  por conta própria **e** o `.gitattributes` impede o arquivo gerado de sujar o
  `git status` para sempre.
- **O gerador é concatenação burra, de propósito.** O `setup.sql` carrega
  backfills que são no-op em banco vazio (o truque de dois passos do
  `event_queue`, o `drop function if exists` do geo, o `update ... where
  platform='perfectpay'`). Parecem errados e estão certos — "simplificar" criaria
  um segundo dialeto de SQL para manter em sincronia com o primeiro.
- **O botão é query param, não `vercel.json`.** O wizard de variáveis do
  "Deploy to Vercel" é controlado por `env`, `envDescription`, `envLink` e
  `envDefaults` na URL de `vercel.com/new/clone`. O `vercel.json` **não** tem
  parte nisso, e criá-lo reintroduziria o arquivo que o projeto decidiu não ter.
  `env` é a lista de variáveis **obrigatórias** — não existe "opcional" ali, e é
  por isso que `NEXT_PUBLIC_APP_NAME`/`BRAND_NAME` entram na lista com
  `envDefaults`: elas são inlinadas em tempo de build, então deixá-las de fora
  faria todo cliente abrir o painel escrito "Tracking" e precisar de um segundo
  deploy.
- **O botão NÃO configura o Deployment Protection, e isso piorou o risco.** Ele
  herda o padrão do time; em *Standard Protection* a produção inteira nasce atrás
  do SSO e a captura fica zerada sem um erro (o incidente de 2026-09-19). Antes o
  projeto era criado à mão e você passava por Settings; agora o fluxo é clicar e
  sair. Por isso virou passo destacado no ONBOARDING **e** aviso no README.
- **`estadoDoSetup()` falha fechado, e as três armadilhas foram verificadas na
  fonte do `@supabase/auth-js`:** (1) `data.total` só é populado dentro de
  `if (links.length > 0)`, então com 0 ou 1 usuário ele é `0` mesmo havendo
  usuário — use `data.users.length`; (2) em erro, `listUsers` devolve
  `{ data: { users: [] }, error }` em vez de lançar, então um `length === 0`
  ingênuo falharia **aberto** num endpoint que cria administrador; (3)
  `createServiceClient()` fica dentro do `try`, porque `supabaseServiceRoleKey()`
  lança quando a variável falta. Só `"vazio"` mostra o formulário.
- **`export const dynamic = "force-dynamic"` no `/login` é obrigatório.** A
  página era estática e pré-renderizada no build; virando assíncrona sem isso, a
  resposta "zero usuários" ficaria congelada no output e o formulário de primeiro
  acesso apareceria para sempre num painel já configurado.
- **`completeSetup` re-checa `estadoDoSetup()` dentro da action.** Ela não pode
  ter `requireUser()` (é o caminho de quem ainda não tem conta), e uma Server
  Action é um endpoint HTTP público — quem descobrir o id chama direto, sem
  passar pela página que esconde o formulário. Essa re-checagem é a única
  barreira que existe.
- **`app_metadata.org_name`, não `user_metadata`.** O usuário reescreve o segundo
  sozinho com a anon key (`auth.updateUser({ data })`); só o `service_role`
  escreve o primeiro, e `getUser()` devolve os dois igual. Um nome de marca
  reescrevível em silêncio viraria "por que o painel do cliente mudou de nome?".
  Não foi para `settings` porque a tabela é singleton e **nasce vazia** — a linha
  só existe depois que alguém aciona `createInitialSettings()`, que gera e mostra
  o `webhook_token` uma única vez; criá-la no setup queimaria o token sem
  ninguém ver.
- **`email_confirm: true` no `createUser` é o que evita o pior modo de falha.**
  Em projeto hospedado a confirmação de email é exigida por padrão e depende de
  SMTP, que um deploy novo não tem. Sem isso o `signInWithPassword` seguinte
  devolve `email_not_confirmed` e o cliente fica trancado para fora do painel que
  acabou de instalar, sem caminho de recuperação.
- **Se o login automático falhar, a conta NÃO é desfeita.** Ela existe e está
  confirmada; apagar seria pior. A action devolve "Conta criada, entre com o
  email e a senha" — e como agora há usuário, `estadoDoSetup()` vira
  `"com-usuario"` e a própria tela de login aparece. O caminho de falha se
  resolve sozinho.
- **Janela de reivindicação, conhecida e aceita.** Entre o deploy e o primeiro
  acesso, quem alcançar a URL cria a conta de administrador. A mitigação é ordem
  de passos, não código: o ONBOARDING manda fazer o primeiro acesso **ainda na
  URL `*.vercel.app`, antes de apontar o domínio** — um domínio customizado
  aparece em Certificate Transparency em minutos. Há também um TOCTOU de
  milissegundos entre a re-checagem e o `createUser`; fechá-lo exigiria
  `pg_advisory_xact_lock` ou uma tabela de lock, ou seja, uma migration — e a
  entrega inteira se apoia em não ter nenhuma.
- **Recuperação de senha sem SMTP é apagar o usuário.** A tela de primeiro acesso
  reaparece sozinha, e **nenhum dado de tracking se perde** — visitantes,
  eventos, vendas e os segredos do Vault não têm vínculo com o usuário do painel.
  Está escrito no ONBOARDING; o caminho alternativo é Reset password no Studio.
- **`TUTORIAL_CADASTRO_CLIENTE.md` deixou de duplicar o ONBOARDING** e virou só
  o lado do cliente. Ele divergia em 4 pontos, e o pior era **omitir o
  Deployment Protection** — um guia de onboarding que pula o passo que já
  derrubou a captura não é uma versão comercial, é uma armadilha com capa bonita.

### ⚠️ Antes de tornar o repositório público

O botão exige repo público (a doc da Vercel é explícita: *"Deploy **public** Git
projects"*). Antes de abrir: **o remote tem um PAT do GitHub em texto puro** no
`.git/config` — revogue e reconfigure sem credencial. E decida conscientemente
sobre `CLAUDE.md` (este arquivo tem nome de cliente, domínios de produção e
histórico de incidentes) e `implementation_plan.md`.

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

### Validação obrigatória antes de concluir

- **Antes de declarar qualquer tarefa de código como concluída, rode `npm run build` e confirme saída 0.** Build falhou: corrija, rode de novo, repita. Nunca diga "pronto" com o build vermelho. A mesma regra está no `AGENTS.md`, para os outros agentes; está duplicada aqui porque o Claude Code carrega este arquivo automaticamente e não o `AGENTS.md`.
- **O build não roda o ESLint.** Desde o Next.js 16, `next build` deixou de lintar (doc em `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`). Erro de lint não derruba o deploy, mas quem mexeu em código roda `npm run lint` nos arquivos tocados.
- **Duas camadas automáticas aplicam o mesmo gate, e as duas são rede de segurança, não substituto:** o hook `.husky/pre-push` (roda `npm run build` e recusa o push se falhar; contornável com `git push --no-verify`, e só existe numa máquina onde `npm install` rodou) e a GitHub Action `.github/workflows/build.yml` (roda em todo push e PR para `main`, não tem como contornar).
- **`git push` não é o único caminho até a Vercel.** Um `vercel --prod` pela CLI sobe o código direto, sem passar pelo hook nem pela Action. Nesse caminho, a única proteção é ter rodado o build antes.

---

## Fases (commit + aprovação do usuário ao final de cada uma)

1. ✅ **Fundação** — scaffold Next.js/React, Tailwind + shadcn/ui, design tokens, `.gitignore`, `CLAUDE.md`
2. ✅ **Banco de dados e segurança** — migrations (7 tabelas, RLS, Vault, pg_cron) aplicadas no Supabase e verificadas em 2026-09-16 (`verify_phase2.sql` passou limpo + conferência independente via REST API)
3. ✅ **Autenticação e shell do dashboard** — `proxy.ts` (sessão + guarda), login email/senha, layout autenticado com navegação responsiva, toggle de tema, e leitura autenticada real na Visão geral provando RLS
4. ✅ **Painel de configurações** — CRUD das 3 tabelas de conta com segredos write-only no Vault, token de webhook mostrado uma vez, e teste de conexão por conta (ver "Credenciais e destinos")
5. ✅ **Captura de eventos** — `/api/config/public`, `/api/identify`, `/api/event` e `public/track.js`, com CORS fechado, validação, geo no servidor, dedup por `event_id` e rate limit (ver "Captura de eventos")
6. ✅ **Disparo Meta CAPI + GA4 Measurement Protocol** — envio para todos os destinos ativos via `after()`, com a resposta de cada um gravada no log do evento (ver "Disparo server-side"). O módulo do GA4 está pronto mas só é chamado pelo webhook, na fase 7.
7. ✅ **Webhook de compra** — `/api/webhook/compra/[platform]` com adaptador do PerfectPay, vinculação da venda com a visita, idempotência com trava atômica e Purchase disparado pro Meta e pro GA4 (ver "Webhook de compra")
7.5. ✅ **Disparo atrasado com retroalimentação** — fila no Postgres, modo híbrido adaptativo no `track.js`, captura de formulário, enriquecimento do visitante pela compra e pg_cron drenando a fila (ver "Disparo atrasado")
8a. ✅ **Dashboard — tela de Eventos** — tabela com `dispatch_status`/`dispatch_attempts`/`dispatch_error`, chips de contagem, gráfico diário e modal de payload (ver "Tela de Eventos")
8b. ✅ **Dashboard — tela de Vendas** — faturamento, reembolsos, chargeback e quebra por forma de pagamento, com tabela paginada e painel lateral de detalhe da venda e do cliente (ver "Tela de Vendas"). Falta ainda a Visão geral (funil).
8c. ✅ **Dashboard — tela de Geo** — mapa-múndi com zoom/pan que já abre
enquadrado na concentração de visitantes, chips de país/estado/cidade que
reenquadram o mapa, e faturamento aprovado por região (ver "Tela de Geo").
Demografia do GA4 ficou de fora, como fase futura.
9. ⏳ Campanhas (Meta Ads Insights + ROAS/CPA)
10. ⏳ Auditoria de segurança e publicação

## Pendências manuais (fora do alcance de comandos automatizados)

Estas ações exigem login nas contas do próprio usuário e não podem ser feitas por aqui:

- ✅ ~~Criar o projeto Supabase~~ — feito; URL/anon/service_role em `.env.local`.
- ✅ ~~Rodar as 5 migrations da fase 2 + `verify_phase2.sql`~~ — feito e verificado (Vault já vinha habilitado no projeto, não precisou de passo extra em Database → Extensions).
- ✅ ~~Criar um usuário do painel no Supabase Studio~~ — feito; 2 contas cadastradas, ambas com email confirmado.
- ✅ ~~Limpar o `test_event_code`~~ — feito pelo usuário em 2026-09-17, confirmado no banco (`null`). Se voltar a preencher pra testar, lembrar de limpar de novo: enquanto tiver valor, nenhum evento conta pra atribuição ou otimização.
- ✅ ~~Rodar a migration `20260917170000_rate_limits.sql`~~ — feito; confirmado em 2026-09-17 via REST (`bump_rate_limit` responde 200).
- ✅ ~~Fase 7.5: habilitar `pg_net`, rodar `20260917190000_event_queue.sql`, gerar o token do cron, fazer o deploy e preencher a URL do cron~~ — **tudo feito**. Reverificado em 2026-09-18: `track.js` em produção com os mesmos 31.696 bytes do repositório, `/api/cron/dispatch` respondendo 401 sem token, e `npm run verify:dispatch -- --so-configuracao` dizendo TUDO CERTO (modo `adaptive`, janela 15 min, token no Vault, fila zerada).
- ✅ ~~Enviar o projeto ao GitHub~~ — feito; `main` está sincronizado com `origin/main`. **Mas `git push` não é o que publica**: o que está no ar subiu pela Vercel CLI. Para publicar uma fase nova, refaça o deploy do mesmo jeito.
- ✅ ~~Instalar o `track.js` na LP~~ — feito, está em `apps/lp.negou.net/app/layout.tsx` e responde no ar. Falta instalar nos outros subdomínios que devam ser rastreados (`quiz.negou.net` ainda não resolve DNS).
- ✅ ~~Gerar o primeiro dado real~~ — feito em 2026-09-18: uma visita à LP criou o visitante e o PageView, com `fbp`, IP, geo (`São Paulo/SP`) e `pixel_fired = false` (visitante anônimo, modo adaptativo), entrando na fila com a janela de 15 min. Foi essa visita que revelou o bug do `ga_client_id`.
- ✅ ~~Rodar a migration `20260918120000_geo_enriquecido.sql` e publicar a revisão de geo/fuso~~ — feito em 2026-09-18, nesta ordem. Migration aplicada e conferida no SQL Editor (8 colunas com os tipos certos; `fill_visitor_pii` com **uma só** assinatura, de 7 parâmetros — sem sobrecarga), deploy por `vercel --prod` e conferência ao vivo passando. Falta ainda confirmar o `purchase` no GA4 na primeira venda real (pendência herdada da fase 7).
- ✅ ~~Rodar as migrations `20260919090000_purchases_dados_comprador.sql` e `20260919120000_purchases_forma_pagamento.sql`~~ — feito pelo usuário em 2026-09-19 e conferido por REST: as 5 colunas novas de `purchases` respondem. **O deploy da fase 8b ainda não foi feito** — quando for, não há ordem a respeitar aqui, porque as migrations já estão no ar.
- ✅ ~~Stripe — rodar a migration `20260921130000_stripe_integration.sql`~~ —
  feito pelo usuário em 2026-09-21 e conferido por aqui: `stripe_accounts`
  existe (singleton, trigger `set_updated_at` disparando, `anon` bloqueada),
  `purchases.platform` aceita `'stripe'` **e continua aceitando** os 4 valores
  antigos, e o CHECK segue recusando qualquer valor fora do vocabulário — a
  troca de constraint não afrouxou nada. 18 checagens direto no banco, todas as
  linhas de teste escritas e apagadas na hora. **Falta só o resto do fluxo, que
  exige login nas contas do usuário:**
  (1) no painel, Integrações → Conectar Stripe, colando a **secret key**
  (Stripe → Desenvolvedores → Chaves de API) e o **signing secret** (Stripe →
  Desenvolvedores → Webhooks → o endpoint → Revelar); (2) no Stripe, cadastrar
  o endpoint `https://SEU_DOMINIO/api/webhook/compra/stripe?token=SEU_TOKEN`
  (o token é o de Configurações → Geral) assinando **apenas** os 4 eventos que
  a tela lista; (3) clicar em "Testar" no card do Stripe — a secret key é
  confirmada na hora; (4) disparar um webhook de teste pelo painel do Stripe e
  conferir a venda na tela de Vendas — é a única forma de provar que o signing
  secret está certo, porque nenhuma API confirma isso antes.
- **Criar o projeto na Vercel** (Import do repo `fdantas87/negou`, Root Directory = `apps/tracking.negou.net`), conforme `VERCEL_DEPLOY.md` da raiz — pode esperar até a fase 10, ou ser feito antes se quiser preview deploy fase a fase. *(Obsoleto para clientes novos: o botão do README faz isso. Ver "Deploy 1-clique".)*
- **Deploy 1-clique — o que falta, e é só do usuário:** (1) **revogar o PAT do GitHub** que está em texto puro na URL do remote em `.git/config` e reconfigurar sem credencial; (2) rodar o `supabase/setup.sql` num projeto Supabase **novo**, do zero, e conferir com `verify_phase2.sql` — é o gate: não publicar um botão que aponta para um SQL não testado; (3) tornar o repo `fdantas87/tracker` público (o botão exige repo público) depois de decidir sobre `CLAUDE.md` e `implementation_plan.md`; (4) abrir a URL do botão uma vez e conferir que os 7 campos aparecem com os 3 defaults preenchidos.
- **País do telefone pela moeda — o que falta:** (1) publicar o código; (2) **só depois** rodar `20260923130000_remove_default_phone_country.sql` no SQL Editor — ordem inversa da habitual, porque o código antigo ainda lê e grava a coluna (salvar a aba Delay falharia e `getDispatchConfig()` cairia no padrão, perdendo modo, janela e `test_event_code`); (3) em cada deploy de cliente **fora do Brasil**, preencher `TRACKING_DEFAULT_PHONE_COUNTRY` na Vercel e redeployar.
- Depois da fase 4 (painel de configurações): migrar os valores de `.credenciais-locais/` pro painel e apagar os arquivos.

---

## Comandos úteis

```bash
npm install       # instalar dependências
npm run dev       # desenvolvimento (http://localhost:3000)
npm run build     # build de produção (roda check:actions e check:setup-sql antes; é o que o pre-push e a CI rodam)
npm run start     # rodar a build de produção localmente
npm run lint      # ESLint (o build NÃO roda, desde o Next 16)
npm run typecheck # tsc --noEmit: só os tipos, mais rápido que o build completo

# Regera supabase/setup.sql a partir de supabase/migrations/. Acrescentou uma
# migration? Rode isto e commite — o `npm run build` falha se os dois divergirem.
npm run build:setup-sql
npm run check:setup-sql   # só confere, é o que roda no build

# Verifica a fila de disparo atrasado (fase 7.5): confere se a produção está com
# o código novo, se o painel está configurado e — com um código de teste real —
# se o pg_cron está REALMENTE drenando. Diz o que fazer em cada falha.
npm run verify:dispatch
npm run verify:dispatch -- --test-code TEST12345   # inclui o teste ao vivo
npm run verify:dispatch -- --so-configuracao       # só a conferência

# Verifica a CAPTURA do ponto de vista de um visitante anônimo: o track.js está
# público (pega Deployment Protection ligado), o CORS libera cada domínio do
# cliente, e o /api/config/public responde com os destinos. Rodar depois de todo
# deploy — é a checagem que falta quando "parou de rastrear e ninguém viu".
npm run verify:captura
npm run verify:captura -- --origem https://lp.cliente.com --origem https://cliente.com

# Dados de demonstração para desenvolver as telas do painel (fase 8).
# Escreve direto no Postgres, sem passar pelo /api/event — nada chega ao Meta.
npm run seed            # ~30 visitantes, ~60 eventos nos 5 estados, compras
npm run seed:limpar     # apaga só o que ele criou (trck_user_id "seed_*")

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
- [ONBOARDING.md](./ONBOARDING.md) (passo a passo de um cliente novo)

---

## Histórico

- **2026-09-24:** Catraca de build. Dois erros de TypeScript chegaram à Vercel
  no deploy anterior sem terem sido pegos na máquina local: variants do Framer
  Motion sem o tipo `Variants` (`overview-dashboard.tsx`) e a prop obrigatória
  `hasWebhookToken` faltando no `<StripeFormDialog>` (`platform-manager.tsx`).
  Um `npm run build` local teria barrado os dois. Agora há três camadas: a regra
  escrita (aqui e no `AGENTS.md`), o hook `.husky/pre-push` (Husky 9.1.7) e a
  GitHub Action `.github/workflows/build.yml`.
  - **O plano original tinha três premissas erradas, corrigidas antes de
    construir:** (1) a app não está em `apps/tracking.negou.net` — é a raiz do
    repositório; (2) o `next build` **não** roda o ESLint desde o Next 16, então
    a regra não podia prometer que o build pegava erro de lint; (3) a regra só no
    `AGENTS.md` não valeria para o Claude Code, que carrega o `CLAUDE.md`.
  - **O hook é local e contornável, por isso a Action.** `--no-verify`, um clone
    onde `npm install` não rodou, ou um commit feito pela interface do GitHub
    passam direto pelo hook. A Action não tem como ser pulada.
  - **O `prepare: husky` não quebra o build da Vercel.** Conferido no código do
    Husky 9.1.7: sem `.git` ele só imprime `.git can't be found` e sai com código
    0. É o caso do upload pela CLI, que não leva o `.git`.
  - **O `.gitignore` não precisou de mudança.** O Husky cria `.husky/_/` com um
    `.gitignore` próprio contendo `*`; só `.husky/pre-push` entra no repositório.
  - **O `.gitattributes` precisou: `.husky/* text eol=lf`.** Com
    `core.autocrlf=true`, um clone no Windows traria o hook em CRLF, o `sh -e`
    leria `npm run build\r` e o npm responderia "Missing script" — todo push
    seria recusado por um motivo que não tem nada a ver com o código.
  - **O Husky grava `core.hooksPath = .husky/_` no `.git/config` local.** É assim
    que ele funciona, e é por isso que o hook só vale depois de `npm install`.
  - Verificado: `npm run build` verde com as duas correções; **teste negativo do
    hook** com um erro de tipo proposital, disparado por `git hook run pre-push`
    (roda o gancho sem contatar o remoto), recusado com `husky - pre-push script
    failed (code 1)` e o TS2322 na tela; e **simulação da CI** numa worktree
    limpa, sem `.env.local` nem variável nenhuma: `npm ci` + `npm run build` com
    exit 0 e as mesmas 15 rotas. Isso confirma que o build não depende de secret
    (as env vars são lidas sob demanda em `lib/supabase/env.ts`).
  - **Não verificado:** a Action nunca rodou no GitHub. Isso só se prova no
    primeiro push, olhando a aba Actions.

- **2026-09-23:** O país do telefone passou a vir da moeda da transação. O
  campo "Código do país" da aba Delay e a coluna `settings.default_phone_country`
  saíram; `obterPaisDaMoeda()` (`lib/webhooks/adapters/index.ts`) decide o país
  nas 3 chamadas que nascem de uma compra, e `TRACKING_DEFAULT_PHONE_COUNTRY`
  (`lib/phone-country.ts`, env var nova) cobre o `/api/identify`, que não tem
  moeda. Migration `20260923130000_remove_default_phone_country.sql`.
  - **O pedido original partia de duas premissas que não batiam com o código:**
    o campo se chamava `default_phone_country`, não `country_code`, e guardava o
    código de discagem (`"55"`), não um ISO-2. Passar o `"BR"` de
    `obterPaisDaMoeda` para o `normalizePhone` antigo produziria número **sem
    prefixo**, em silêncio. Daí a troca de assinatura e o `DIAL_PLANS`.
  - **O plano inicial chumbava `"BR"` no `/api/identify`, e o usuário barrou**:
    já há clientes de vários países, e o hash desse endpoint é o que todo evento
    de navegador manda pro Meta. A flexibilidade saiu do banco, foi para o
    ambiente, e não deixou de existir.
  - **Defeito que teria entrado junto e foi pego no desenho:** a regra de
    tamanho do `normalizePhone` era brasileira ("10 ou 11 dígitos = nacional").
    Com o país vindo da moeda, um americano com `1 555 123 4567` (11 dígitos)
    viraria `115551234567`. O tamanho nacional agora é por país.
  - Achados de passagem: além de `visitor-enrich.ts`, havia mais 3 chamadas
    lendo o DDI do painel (2 no webhook, 1 no `purchase-dispatch.ts`), e o
    `getDispatchConfig()` do webhook e do `/api/identify` só existia para ler
    esse campo — os dois saíram. `verify-dispatch.mjs` não o referenciava.
  - Verificado: `check:actions` e `check:setup-sql` OK; lint limpo nos 12
    arquivos tocados; `tsc` sem nenhum erro nesses arquivos (os 6 que restam
    são de `overview-dashboard.tsx` e `platform-manager.tsx`, do commit
    `fb59e52`, anteriores a esta mudança); **59/59 num teste de mesa** contra o
    código real (os 3 mapeamentos de moeda, moeda nula/vazia/desconhecida
    caindo no padrão com aviso, BR/US/PT com e sem prefixo, DDD 55, `+`
    explícito de outro país, ISO sem plano, hash igual a um SHA-256 conhecido,
    adaptadores reais do PerfectPay em BRL/USD e do Stripe em BRL/USD/EUR, e a
    env var válida, inválida e ausente); e **200.000/200.000 entradas idênticas**
    à versão anterior para o Brasil.
  - **Não verificado por aqui:** a migration não foi aplicada (regra do
    projeto) e nada rodou contra o banco — o caminho webhook → `phone_hash`
    gravado depende do deploy.
- **2026-09-23:** O cron de disparo deixou de ter passo de ativação. Antes eram
  4 passos manuais na aba Delay: copiar o endereço mostrado, colar no campo "URL
  do cron", salvar e clicar em "Gerar token do cron". Nada disso exigia decisão
  humana — o endereço é sempre o domínio do próprio painel e o token só é lido
  pelo `tick_event_queue()` — então virou autoconfiguração: o layout do painel
  lê o `Host` e, num `after()`, `ensureCronDispatchConfigured()` grava URL e
  token quando faltam ou divergem. Em deploy novo, o primeiro login (qualquer
  tela) já deixa a fila drenando. O operador só escolhe modo e janela.
  - Houve uma versão intermediária no mesmo dia, com um botão "Ativar disparo
    automático" que ainda mostrava endereço e token. Foi descartada a pedido do
    usuário: o botão continuava obrigando alguém a saber que aquilo existia.
  - **O token do cron deixou de ser mostrado na tela**, inclusive ao girar.
    Ele nunca teve para onde ser colado; revelá-lo era só superfície a mais.
  - Nova migration aditiva `20260923120000_cron_health.sql` +
    `getCronStatus()`: indicador "pg_cron chamou este endereço há Xs" lendo
    `cron.job_run_details`. Antes, isso só se confirmava no SQL Editor.
  - Dois bugs corrigidos de passagem: `saveDispatchSettings` gravava
    `dispatch_cron_url` a partir do formulário e passaria a apagá-la quando o
    campo saísse da tela; e ela e `regenerateCronToken` faziam
    `revalidatePath("/pixels")`, mas quem mostra esses dados é `/eventos` —
    sobra do refactor que moveu a aba Delay, e salvar não atualizava a tela.
  - Verificado por aqui: `tsc` sem erro novo, lint limpo e `check:actions` e
    `check:setup-sql` OK. **Não verificado:** o `after()` num Server Component
    (primeiro uso no projeto) e o `Host` atrás do proxy da Vercel — isso só se
    prova depois do deploy, vendo `dispatch_cron_url` preenchido sozinho após um
    login e o chip da aba Delay ficando verde no minuto seguinte.
- **2026-09-22:** Allowlist de domínios editável no painel. Nova coluna
  `allowed_origins` em `settings` (tipo `text[]`), editável em Configurações →
  Geral, com UI `components/settings/allowed-origins-section.tsx` (novo), Server
  Action `saveAllowedOrigins` e módulo `lib/settings/origins-config.ts` (cache
  de 60s, mesmo padrão do dispatch-config.ts). A variável `TRACKING_ALLOWED_ORIGINS`
  continua valendo e funciona como bootstrap + fallback (se leitura do banco
  falhar, o que a variável libera segue liberado). Allowlist final = variável ∪
  banco. `lib/cors.ts` ficou assíncrona (3 funções agora retornam Promise, mas
  handlers das 3 rotas públicas já são async, então nenhum call site mudou).
  `scripts/verify-captura.mjs` agora consulta `allowed_origins` do banco e menciona
  ambas as vias de correção (painel ou variável) no "O QUE FAZER" de erro CORS.
  Descoberta importante: não foi necessário adicionar `await` em nenhuma rota —
  `return jsonResponse(...)` dentro de `async function` aceita tanto `Response`
  quanto `Promise<Response>`.
- **2026-09-21:** Tela de Integrações + Stripe. Rota `/integracoes` (item novo na
  sidebar), `lib/webhooks/adapters/stripe.ts`, `app/(dashboard)/integracoes/
  {page,actions}.tsx`, 2 componentes em `components/integrations/` e a migration
  `20260921130000_stripe_integration.sql`. **Nenhuma dependência nova** — nem o
  SDK do Stripe: a verificação de assinatura é `node:crypto` e a chamada de
  teste é um `fetch`, como já é feito com Meta e GA4.
  - **A decisão que define a integração:** a chave de idempotência é o
    `payment_intent`, não o id da Checkout Session. É o único identificador que
    aparece também no evento de reembolso — com `cs_...`, um reembolso criaria
    uma venda nova em vez de atualizar a existente.
  - **Bug de perda de dado encontrado durante o desenho e corrigido junto:** a
    gravação é upsert da linha inteira, e o `charge.refunded` do Stripe não
    carrega o `client_reference_id` da sessão. Um reembolso de visitante sem
    email no site apagaria o `trck_user_id` da compra. O `findVisitor` ganhou um
    4º passo que preserva o vínculo já gravado — vale para todas as plataformas,
    não só o Stripe.
  - **Confirmado na doc oficial antes de construir, não suposto:** (1) o
    `client_reference_id` é parâmetro de URL aceito em Payment Link e volta no
    `checkout.session.completed`; (2) as `utm_*` também são aceitas na URL, mas
    só chegam à URL de redirecionamento pós-pagamento — nunca ao webhook, por
    isso os campos de UTM da venda Stripe ficam nulos de propósito; (3) o
    formato exato do `Stripe-Signature` e do payload assinado.
  - **Duas armadilhas tratadas na origem:** moeda zero-decimal (JPY e outras 15,
    onde dividir por 100 daria ¥50 no lugar de ¥5.000) e reembolso parcial
    (recusado, porque marcar a linha como reembolsada zeraria uma receita que em
    boa parte ficou de pé).
  - **Fora do escopo, escrito no código e não escondido:** chargeback/disputa (o
    objeto Dispute não traz dados do comprador e o upsert os apagaria),
    assinaturas/recorrência, e Payment Link em domínio próprio do cliente.
  - Verificado: `tsc --noEmit` limpo, `npm run build` verde com `/integracoes`
    saindo como rota dinâmica, `check:actions` e `check:setup-sql` OK,
    `node --check` no `track.js`, **57/57 no teste de mesa** (30 de tradução de
    evento, 8 de reembolso, 5 de evento fora do escopo e 14 de assinatura HMAC —
    incluindo corpo alterado em 1 byte, replay de 10 minutos, rotação de secret
    com duas assinaturas e assinatura não-hex sem lançar) e **27/27 no teste ao
    vivo** contra o servidor real: os portões da rota, a regressão do PerfectPay
    depois do refactor de leitura do corpo (o caminho todo até o adaptador, sem
    gravar compra nenhuma), a regressão de `/api/event` e `/api/identify`, e a
    tela nova autenticada com as 6 telas anteriores ainda de pé. Usuário
    temporário apagado no fim, banco sem nenhuma escrita.
  - **O que NÃO foi verificado por aqui, e é o gate:** a migration não foi
    aplicada (regra do projeto: migration é colada no SQL Editor pelo usuário),
    então o caminho completo — assinatura válida → venda gravada → Purchase no
    Meta e no GA4 — depende dela e de uma conta Stripe de teste. O teste ao vivo
    prova que, sem a migration, o webhook **recusa** em vez de aceitar sem
    conferir assinatura, que é o comportamento certo.
- **2026-09-21:** Deploy 1-clique. Três gargalos que exigiam o desenvolvedor
  viraram um arquivo, um botão e um formulário. Arquivos novos:
  `scripts/build-setup-sql.mjs`, `supabase/setup-preflight.sql`,
  `supabase/setup.sql` (gerado, 58 KB), `.gitattributes`, `lib/auth/setup.ts`,
  `app/(auth)/login/setup-form.tsx`. **Nenhuma migration, nenhum `vercel.json`,
  nenhuma dependência e nenhuma variável de ambiente nova.**
  - **A premissa do plano original estava errada e foi corrigida antes de
    construir:** o wizard de variáveis do "Deploy to Vercel" é controlado por
    query params (`env`, `envDescription`, `envLink`, `envDefaults`), **não** por
    uma seção `env` do `vercel.json`. Conferido na doc. Resultado: o
    `vercel.json` saiu do escopo, o que também preserva a decisão registrada
    aqui de o projeto não ter esse arquivo.
  - **A decisão que define a Entrega 1:** um `setup.sql` só, e não dois. A
    transação única do SQL Editor é a *proteção*, não o obstáculo — as migrations
    não são idempotentes, então "tudo ou nada" é exatamente o que se quer.
    Dividir em duas partes produziria o único estado do qual elas não se
    recuperam.
  - **Três armadilhas do `listUsers` verificadas na fonte do
    `@supabase/auth-js`, não supostas** — e duas delas fariam o setup falhar
    ABERTO: `data.total` é `0` mesmo havendo usuário quando não há header `Link`
    (reabriria o formulário num painel configurado), e em erro a função devolve
    `{ users: [] }` em vez de lançar (chave errada viraria "banco vazio"). Ver
    "Deploy 1-clique".
  - **Detalhe que teria passado batido:** o `settings` é singleton mas **nasce
    vazio** — a linha só existe depois de `createInitialSettings()`, que gera e
    mostra o `webhook_token` uma única vez. Por isso o nome da organização foi
    para `app_metadata` do usuário, e não para uma coluna de `settings`: criar a
    linha no setup queimaria o token sem ninguém ver.
  - **Risco nomeado e mitigado por ordem de passos, não por código:** entre o
    deploy e o primeiro acesso, quem alcançar a URL cria a conta de
    administrador. O ONBOARDING manda fazer o primeiro acesso ainda na URL
    `*.vercel.app`, antes de apontar o domínio — um domínio novo aparece em
    Certificate Transparency em minutos.
  - **Documentação:** `ONBOARDING.md` virou a fonte única, em duas partes
    (operador / cliente), e o `TUTORIAL_CADASTRO_CLIENTE.md` deixou de duplicá-lo
    — ele divergia em 4 pontos e **omitia o Deployment Protection**, o passo que
    já derrubou a captura.
  - Verificado por aqui: `setup.sql` gerado com **11/11 arquivos presentes
    integralmente** (comparação byte a byte de cada fonte contra o trecho
    correspondente do resultado), na ordem cronológica, sem CRLF e sem sujar o
    `git status`; `--check` recusando migration nova, migration com nome fora do
    padrão e edição à mão, e passando quando em dia; `check:actions` OK;
    `tsc --noEmit` limpo; `npm run build` verde com `/login` saindo como rota
    **dinâmica** (prova do `force-dynamic`); ESLint sem erro nos 6 arquivos
    tocados.
  - **O que NÃO foi verificado por aqui, e é o gate da publicação:** o
    `setup.sql` nunca rodou contra um Postgres — não há banco nesta sessão. A
    matemática do gerador está coberta; o SQL precisa de um projeto Supabase novo
    antes de o botão ir ao ar. O mesmo vale para o fluxo de primeiro acesso ponta
    a ponta e para a renderização do wizard da Vercel.
- **2026-09-19:** Fase 8c — tela de Geo. `lib/dashboard/{geo,geo-fit,geo-filters}.ts`,
  `app/(dashboard)/geo/page.tsx` e 4 componentes novos (`geo-view`, `world-map`,
  `world-map-impl`, `ranking-chips`), mais `types/world-atlas.d.ts`.
  Dependências novas: `react-simple-maps` 5.0.5 (declara React 19 nos peers e traz
  os próprios tipos — o risco de compatibilidade levantado no plano não existia),
  `d3-geo` e `world-atlas`. **Nenhuma migration.**
  - **A decisão que define a tela:** enquadramento por percentil ponderado em vez
    de média/desvio. O banco de desenvolvimento tem 31 visitantes no Brasil e 2 em
    Portugal — o caso exato em que média e desvio abririam o mapa no Atlântico.
  - **Bug encontrado e corrigido durante a verificação:** o teto de zoom era uma
    constante (10), mas o zoom é um multiplicador sobre uma escala que depende do
    tamanho da tela. Medido: o mesmo recorte pedia 4,3 no desktop e 13,9 num
    celular de 360 px, então o celular batia no teto e abria mais afastado do que
    o calculado. Virou `zoomMaximoDe(largura, altura)`, derivado de um limite
    geográfico, usado também no `maxZoom` do mapa (senão o d3-zoom cortaria a
    diferença sem avisar). **Foi o teste de mesa que pegou** — no navegador isso
    passaria por "achei que o mapa abria meio longe".
  - **Conferido antes de construir, não suposto:** `purchases.geo_*` é copiado do
    visitante casado (`route.ts:154`), e não resolvido do IP de quem chama o
    webhook. Se fosse o IP, "faturamento por região" estaria descrevendo o
    datacenter do PerfectPay — o mesmo tipo de erro silencioso que o GA4 tinha
    antes do `ip_override`.
  - Verificado: build e lint limpos nos arquivos novos, `check:actions` OK,
    **19/19 no teste de mesa do enquadramento** (centro caindo no Brasil, 97% dos
    visitantes dentro da moldura, Lisboa fora por desenho, concentração de 30%
    alargando a moldura, cidade única sem estourar o zoom, formato de celular,
    mundo inteiro cabendo com zoom 1, e os casos degenerados — sem pontos, sem
    tamanho medido, contagem zero — todos sem `NaN`), e **29/29 no teste
    autenticado real** (usuário temporário pela Admin API, login pela
    `@supabase/ssr`, guarda de rota, a página abrindo, período pela URL, período
    inválido caindo no padrão, e as 5 telas anteriores ainda de pé). Onze dessas
    29 comparam os **números da tela** com uma agregação independente lida direto
    do banco — país, estado, cidade, receita por estado e total aprovado. Usuário
    temporário apagado no fim.
  - **O que NÃO foi verificado por aqui:** o comportamento visual do mapa —
    enquadramento na tela, arrastar, roda do mouse, tooltip no hover, clique no
    chip reenquadrando, e as cores nos dois temas. Não há navegador nesta sessão;
    a matemática está coberta por teste, o desenho precisa de olho humano.
  - **Dois erros de tipo PRÉ-EXISTENTES travavam o `next build`**, no
    `payment-method-chart-3d-impl.tsx` (trabalho em andamento, ainda não
    commitado): o pacote `anychart` publica os tipos como namespace global e não
    como módulo (TS2306), e o `this` do callback de tooltip era implícito.
    Corrigidos com `types/anychart.d.ts` (`export = anychart`) e uma anotação de
    `this` — o código compilava, quem parava era só o type check.
- **2026-09-19:** Incidente — a captura da LP parou por completo. **Eram dois bugs
  empilhados, e o segundo só ficou visível depois de corrigir o primeiro.**
  - **(1) Deployment Protection da Vercel com `deploymentType: "all"`.** Todo o
    domínio, inclusive `/track.js`, respondia `302` para `vercel.com/sso-api`. O
    script nunca carregava.
  - **(2) `TRACKING_ALLOWED_ORIGINS` sem nenhum domínio válido em produção.** Com a
    allowlist hardcoded removida no commit `d508c42`, sobrou só
    `tracking.negou.net` — e por acidente, porque `ownOrigin()` o acrescenta
    sozinho. Uma sonda origem a origem (preflight com cada domínio candidato)
    foi o que revelou isso sem precisar ler o valor da variável, que estava
    ilegível.
  - **A lição que mais importa: testar tracking logado no painel não prova nada.**
    Quem tem sessão na Vercel atravessa o Deployment Protection e vê tudo
    funcionando. Só o visitante anônimo é barrado — exatamente o único que
    importa. Toda verificação de captura tem que ser em janela anônima.
  - **Diagnóstico por ausência é o problema central desta classe de bug.** Nenhum
    dos dois defeitos gerou erro: o `post()` do `track.js` engole falha de rede,
    o endpoint chega a responder 200, e quem recusa é o navegador. Daí o
    `npm run verify:captura` (novo), que olha os três pontos pela ótica do
    visitante anônimo e diz o que clicar em cada falha.
  - **Corrigido também:** o Root Directory do projeto Vercel apontava para
    `apps/tracking.negou.net` num repositório standalone — inerte enquanto os
    deploys são por CLI, mas quebraria no dia em que o Git fosse conectado.
  - **Dois defeitos de tooling achados no caminho:** (1) variável marcada como
    **Secret** na Vercel não desce no `vercel env pull` — o arquivo recebe o
    literal `[SENSITIVE]`, e o Supabase devolve `401 Invalid API key` sem que
    nada indique que o valor simplesmente não chegou (`TRACKING_ALLOWED_ORIGINS`
    virou tipo *Config* por isso; a service_role continua Secret e precisa ser
    colada à mão); (2) o parser de `.env.local` do `verify-dispatch.mjs` não
    tirava as aspas que o `vercel env pull` escreve, e a URL do Supabase saía
    com aspas no meio (`Invalid URL`).
  - Verificado ao vivo: `verify:captura` passando nas 3 checagens para os 3
    domínios, e uma visita real em janela anônima gerando o PageView com geo
    (`São Paulo/SP`), `pixel_fired = false` e entrada na fila com a janela de
    15 min — o comportamento certo do modo adaptativo para visitante anônimo.
- **2026-09-19:** Fase 8b — tela de Vendas. `lib/dashboard/{vendas,vendas-filters}.ts`,
  `app/(dashboard)/vendas/{page,actions}.tsx` e 5 componentes novos em
  `components/dashboard/` (`stat-card`, `vendas-filters`, `vendas-table`,
  `payment-method-badge`, `payment-method-chart`, `sale-detail-sheet`). O item
  "Faturamento" da sidebar virou "Vendas"; a rota antiga passou a redirecionar.
  Nenhuma dependência nova — `recharts`, `chart`, `popover`, `select` e `table`
  já estavam no projeto, e `formatarMoeda` já existia.
  - **A decisão que define a tela: os quatro cards "estimados" do desenho de
    referência (Taxas, Imposto, Custos de Produto, Faturamento Líquido) não foram
    construídos.** Conferido coluna a coluna: `purchases` não tem nenhum desses
    campos, o `NormalizedPurchase` não os carrega e o adaptador não os extrai.
    Entregá-los com percentual chutado daria um "Faturamento Líquido" com cara de
    número auditado. Ficam para quando a taxa real da plataforma for capturada.
  - **Forma de pagamento entrou porque essa o dado sustenta:** `payment_type_enum`
    está confirmado no OpenAPI oficial do PerfectPay, e estava sendo descartado —
    sobrevivia só dentro de `raw_webhook`. Migration com 2 colunas (canônica +
    bruta, espelhando `status`/`platform_status`), backfill de `raw_webhook` no
    mesmo arquivo e leitura tolerante no adaptador.
  - **Limite que ficou registrado em vez de ser escondido:** a doc do PostBack não
    é pública (o `api.json` remete a uma seção "Webhooks" que não está nele, e o
    `llms-full.txt` responde 404). Está confirmado que a plataforma TEM o campo,
    não que o postback o entregue com esse nome — daí a leitura aceitar quatro
    nomes de campo e a ausência virar `null`, nunca `other`.
  - **Dois cuidados de correção que não apareceriam como erro:** somar moedas
    diferentes num total só (o resumo agrega por moeda e avisa quando há mistura)
    e tratar `created_at` como hora do pagamento — para boleto e Pix ele é o
    instante da GERAÇÃO, então a coluna chama "Registrada em" e o detalhe mostra
    `updated_at` ao lado.
  - **Migration aplicada pelo usuário no mesmo dia**, e a verificação completa
    rodou em seguida. Verificado: build e lint limpos, `check:actions` OK,
    **29/29 no teste de mesa do adaptador** (os 13 valores do enum, enum como
    string, valor desconhecido, os quatro nomes alternativos de campo, texto com
    acento e maiúscula, e os três casos de ausência virando `null` — mais 9
    checagens de regressão do resto do payload); **25/25 no teste autenticado
    real** (usuário temporário pela Admin API, login pela `@supabase/ssr`, guarda
    de rota, `/faturamento` → `/vendas`, filtros e paginação pela URL, busca com
    os separadores do PostgREST — `a,b)(*` —, parâmetros inválidos caindo no
    padrão, e as 4 telas anteriores ainda de pé); e **12/12 na conferência dos
    números** contra uma agregação independente lida direto do banco —
    faturamento, ticket médio, reembolso, chargeback, quantidade e a contagem de
    cada forma de pagamento, rodada nos dois extremos: com 8 compras e com o
    banco vazio. Usuário temporário apagado no fim.
  - **A conferência de números usa `periodo=tudo` de propósito.** Sem recorte de
    tempo, a comparação não depende de reimplementar a aritmética de fuso do
    painel no script de teste, e qualquer divergência é da agregação em si — que
    é o que se quer testar.
  - **Descoberta operacional:** havia um `next dev` antigo servindo a porta 3001 e
    outro app na 3000. Um teste HTTP contra a porta errada reprovou `/vendas` e
    `/leads` com 404 e pareceu um defeito do código novo — não era. Conferir a
    porta antes de acreditar num 404 em teste local.
- **2026-09-18:** Revisão de geolocalização e fuso horário. A pergunta de partida
  era se a Vercel já oferecia geo de graça, para trocar "o jeito atual" por ela —
  e a conferência mostrou que **o jeito atual já era a Vercel**: não havia nada
  para substituir, havia headers sendo ignorados. `lib/geo.ts` passou a ler os 4
  headers que faltavam (`postal-code`, `latitude`, `longitude`, `timezone`), 8
  colunas novas em `visitors`/`events_log`, `hashZip` preenchendo o `zp` da CAPI
  (que ia vazio), `lib/dashboard/timezone.ts` como fonte única do fuso, e o modal
  de Eventos mostrando localização e hora local do visitante.
  - **Dois bugs de dado achados no caminho, nenhum dos dois gerava erro:** (1) o
    GA4 geolocalizava toda compra do webhook no datacenter da Vercel, por falta de
    `ip_override`; (2) o painel renderizava em `America/Sao_Paulo` mas recortava
    período e montava os baldes do gráfico em UTC, então "Hoje" começava às 21h de
    ontem e um evento das 22h caía no dia seguinte do gráfico enquanto a tabela o
    exibia com a data de hoje.
  - **Descoberta que mudou uma decisão:** a normalização de `zp` do Meta manda
    usar "só os 5 primeiros dígitos" — mas a regra é **explicitamente para os
    EUA**. Aplicá-la ao Brasil cortaria o CEP de 8 dígitos em 5 e jogaria fora a
    precisão de rua, ficando só com o prefixo do bairro. Por isso `hashZip` recebe
    o país e a regra dos 5 dígitos só vale para `US`.
  - Verificado: build e lint limpos, `check-server-actions` OK, 9/9 no teste de
    mesa do fuso com o processo em UTC (incluindo virada de mês e o caso exato de
    22:30 BRT que estava errado), 12/12 na normalização de CEP contra SHA-256
    conhecido (BR, EUA com ZIP+4, Reino Unido alfanumérico), 13/13 na forma dos
    payloads (`zp` dentro de `user_data`, `ip_override` no topo e **não** dentro de
    `params`) e 16/16 na leitura dos headers (cidade percent-encoded, coordenada
    malformada virando null em vez de NaN, ausência total de headers fora da
    Vercel).
  - **Aplicado e publicado no mesmo dia**, migration primeiro. Conferência ao
    vivo contra `tracking.negou.net` em produção: `/api/identify` e `/api/event`
    respondendo 200 com as colunas novas (o que prova que migration e código
    casam), geo real chegando completo (`BR / SP / São Paulo / 01000 /
    -23.5475,-46.6361 / America/Sao_Paulo`), evento ficando na fila em vez de ir
    ao Meta, `track.js` no ar com os mesmos 33.004 bytes do repositório,
    `/api/cron/dispatch` devolvendo 401 sem token e com token errado, e o
    visitante e o evento de teste apagados no fim.
  - **Achado da conferência ao vivo:** o CEP de IP no Brasil vem com 5 dígitos.
    Ver a nota em "Geolocalização e fuso horário" — o `zp` derivado de IP
    dificilmente casa, e quem vai fazê-lo valer é o CEP do checkout.
- **2026-09-18:** Fase 8a — tela de Eventos. `lib/dashboard/{filters,events,format}.ts`, `app/(dashboard)/eventos/{page,actions}.tsx` e 6 componentes em `components/dashboard/`. `recharts` entrou via `npx shadcn add chart` (junto com `table` e `popover`); `calendar` foi dispensado em favor de períodos fixos (Hoje/7d/30d/Tudo), que cobrem o uso real sem arrastar `react-day-picker` + `date-fns`. Verificado: build e lint limpos, `hooks/use-mobile.ts` intacto depois do `shadcn add`, e **20/20 num teste autenticado real** (usuário temporário pela Admin API, login pela `@supabase/ssr`, as 3 páginas carregando, guarda de rota redirecionando sem sessão, filtros e paginação pela URL, estado vazio, e busca com os separadores do PostgREST — `a,b)(*` — sem quebrar a query). Usuário temporário apagado no fim.
  - **Revisão do estado real da fase 7.5:** a seção de pendências afirmava que a produção estava com o código anterior e que havia 30 commits não enviados. As duas coisas estavam desatualizadas — conferido ao vivo: `track.js` no ar com os mesmos 31.696 bytes do repo, `/api/cron/dispatch` devolvendo 401, `verify:dispatch` TUDO CERTO e `main` sincronizado com `origin/main`.
  - **Descoberta que custou tempo:** passar o query builder do Supabase por um genérico próprio (`aplicar<T extends {gte,eq,or}>`) faz o TypeScript estourar em "type instantiation is excessively deep". O erro aponta pro `.select()` e manda investigar a string de colunas, que não tem nada a ver — com `select("*")` o erro é o mesmo.
  - **O banco nunca recebeu um registro real.** Tudo que existe hoje veio do `npm run seed`. A tela está correta contra dado sintético que cobre os 5 estados de disparo; a primeira visita de verdade à LP é o que falta pra fechar o ciclo.
- **2026-09-17:** Fase 7.5 — disparo atrasado com retroalimentação. Fila de despacho em `events_log` (11 colunas novas + índice parcial), reivindicação atômica com `for update skip locked`, liberação antecipada na conversão, `pg_cron` + `pg_net` acordando `/api/cron/dispatch`, envio em lote de até 50 eventos por requisição, modo híbrido adaptativo no `track.js`, `negou.identify()` + farejador de formulário, e escrita da PII da compra de volta no visitante. Verificado: build e lint limpos, `node --check` no `track.js`, 13/13 casos de normalização de telefone, 15/15 casos do farejador (inclusive PAN com Luhn em campo de telefone, formulário de login e `action` de checkout, todos recusados), painel carregando autenticado nas 3 páginas com a aba nova presente e o usuário temporário apagado, e o `phone_hash` gravado pelo `/api/identify` batendo com o SHA-256 de `5511987654321` contra o banco real. O banco ficou limpo.
  - **Descoberta que mudou o desenho:** a doc de deduplicação do Meta diz, literalmente, que o evento que chega **depois** é descartado e que ele prefere o que chegou primeiro. Ou seja, atrasar a CAPI mantendo o pixel disparando na hora joga fora justamente o evento enriquecido. A técnica só funciona se o pixel não disparar aquele evento — daí o modo adaptativo.
  - **Bug pré-existente corrigido:** `hashPhone` nunca punha o código do país, então todo telefone brasileiro gerava um hash que o Meta jamais casaria — silenciosamente. Os `phone_hash` gravados antes disso são inúteis pro Meta.
  - **Verificado ao vivo depois da migration:** `verify_phase7_5.sql` passou nos 11 blocos, e um teste de ponta a ponta contra o Supabase e o Meta reais (com `test_event_code`, restaurado pra `null` no fim) passou em **22/22**. O que ele prova, e que é o ponto da fase inteira: um PageView capturado de visitante anônimo, que ficou na fila com `dispatch_after` 900s à frente, foi liberado pelo `/api/identify` da conversão e chegou ao Meta carregando `em`, `ph`, `fn` e `ln` — com o `event_time` do momento real da visita, e o Meta respondendo `events_received: 1`. Também conferidos: token do cron recusando 401 sem/errado e 202 com o certo, o cron drenando e o evento saindo igualmente enriquecido, duplicata não redisparando, e o `access_token` ausente do payload gravado. Banco ficou limpo.
  - **Formato de `events_log.payload_meta`:** `{ data: [evento], test_event_code }`, o mesmo que o disparo da compra grava. A requisição real pode ter levado 50 eventos, mas cada linha guarda só o seu — gravar o lote em cada uma duplicaria tudo 50 vezes. Uma forma só aqui é o que evita a tela de Eventos ter que adivinhar de onde a linha veio. A primeira versão gravava o objeto do evento sem o envelope e criou justamente essa divergência; o teste pegou.
  - **Bug de PL/pgSQL corrigido em seguida:** `v_filled || 'x'` num `text[]` é ambíguo e o Postgres tenta ler o literal como um array inteiro (`malformed array literal`). A migration aplica sem reclamar, porque o corpo da função só é analisado na execução. Use `array_append`.
- **2026-09-16:** Fase 1 concluída — scaffold Next.js 16.3.5/React 19.2.8, Tailwind v4 + shadcn/ui (Radix, preset nova), design tokens HSL (verde-neon/ciano/âmbar, dark padrão + toggle claro), fontes Manrope + JetBrains Mono, `.gitignore` protegendo os `.txt` de credencial soltos, página placeholder demonstrando o design system.
- **2026-09-16:** Projeto Supabase criado pelo usuário; URL/anon/service_role movidos para `.env.local`. Os 8 arquivos de credencial soltos (Meta, GA4, Supabase) consolidados em `.credenciais-locais/`, uma única pasta gitignorada — mais robusto do que listar nomes exatos.
- **2026-09-16:** Fase 2 (migrations) escrita — 5 arquivos SQL em `supabase/migrations/` (extensões, tabelas, RLS, funções de Vault, job de retenção) + `supabase/verify_phase2.sql`. Aplicação é manual (colar no SQL Editor do Supabase), por decisão do usuário de não compartilhar um Personal Access Token/senha de banco novo.
- **2026-09-17:** Fase 7 — webhook de compra. Adaptador do PerfectPay escrito a partir do OpenAPI oficial, endpoint com token, vinculação por `trck_user_id`/email/telefone, idempotência por trava atômica e Purchase pro Meta e GA4. 45 testes de integração passaram, com o Meta confirmando `events_received: 1` no Purchase. Durante o teste o `webhook_token_hash` foi trocado por um de teste e as contas GA4 desativadas (pra não injetar compra falsa nos relatórios); ambos restaurados no fim.
  - **Pendência honesta:** o caminho do GA4 na compra não foi confirmado ao vivo justamente por causa disso — o GA4 não tem modo de teste que fique fora dos relatórios, então qualquer verificação real injeta uma compra de mentira na receita. Confirmar na primeira venda de verdade, olhando o `purchase` no GA4.
- **2026-09-17:** Fase 6 — disparo server-side. `lib/meta/capi.ts` (payload conforme a doc + fan-out pros pixels ativos), `lib/ga4/mp.ts` (pronto, usado só pelo webhook na fase 7) e `lib/dispatch/event-dispatch.ts`, ligado ao `/api/event` via `after()`. Teste ponta a ponta contra a API real do Meta: 26 verificações, com `events_received: 1` confirmado, cada regra de hash conferida campo a campo, e a garantia de que o `access_token` não aparece no log. O `test_event_code` foi definido temporariamente pro teste não sujar produção e restaurado ao valor original no fim.
- **2026-09-17:** Fase 5 — captura de eventos. `/api/config/public` (só IDs públicos), `/api/identify` (upsert do visitante, hashes do Meta, geo no servidor) e `/api/event` (dedup por `event_id` nascido no navegador), mais o `public/track.js`: resolve identidade, carrega gtag e Pixel com os IDs do painel, decora links de checkout/WhatsApp e dispara PageView. 33 testes de integração contra o servidor e o banco reais — incluindo CORS recusando `negou.net.site-do-atacante.com`, geo forjado pelo cliente sendo ignorado, hashes batendo com a normalização do Meta e dedup de reenvio — passaram, e o banco ficou limpo.
- **2026-09-16:** Fase 4 — painel de configurações. CRUD dos 3 tipos de conta com segredos write-only no Vault, token de webhook gerado/mostrado uma vez e guardado só como hash, e teste de conexão por conta. Constante `META_GRAPH_API_VERSION = v26.0` (confirmada no changelog oficial: lançada 29/07/2026). Testes de contrato contra o banco real (store/reveal/update/delete no Vault, CHECK de formato, unique 23505, trigger de updated_at) passaram e o banco ficou limpo.
- **2026-09-16:** Fase 3 — autenticação e shell do painel. `proxy.ts` (nome novo do middleware no Next 16) cuidando de refresh de sessão, headers anti-cache e guarda de rota; login por email/senha via Server Action; layout autenticado com sidebar responsiva, menu de conta e toggle de tema; Visão geral fazendo leitura autenticada real das 3 tabelas pra provar o caminho sessão → RLS → dado. Guarda verificada por HTTP: `/`, `/eventos` e `/configuracoes` sem sessão devolvem 307 para `/login`.
- **2026-09-16:** Fase 2 aplicada e verificada no projeto Supabase. `verify_phase2.sql` passou limpo, e uma conferência independente pela REST API confirmou: as 7 tabelas existem; a chave `anon` leva 401 em `ga4_accounts` (revoke funcionando) e lê `visitors` com lista vazia (RLS filtrando); `reveal_secret` e `purge_old_event_payloads` respondem via RPC com `service_role`.
