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
│   │   ├── faturamento/page.tsx            # [fase 8]
│   │   ├── campanhas/page.tsx              # [fase 9]
│   │   ├── geo/page.tsx                    # [fase 8]
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
│   ├── auth/actions.ts                     # ✅ fase 3 — signIn/signOut (Server Actions)
│   ├── auth/require-user.ts                # ✅ fase 4 — guarda obrigatória de toda Server Action
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
│   ├── dashboard/filters.ts                # ✅ fase 8a — constantes dos filtros (SEM server-only)
│   ├── dashboard/events.ts                 # ✅ fase 8a — consultas da tela de Eventos (sob RLS)
│   ├── dashboard/format.ts                 # ✅ fase 8a — data/hora com fuso fixo America/Sao_Paulo
│   ├── geo.ts                              # ✅ fase 5 — IP real + headers x-vercel-ip-*
│   ├── rate-limit.ts                       # ✅ fase 5 — Upstash quando configurado, memória senão
│   ├── cors.ts                             # ✅ fase 5 — allowlist exata dos endpoints públicos
│   ├── validation.ts                       # ✅ fase 5 — limpeza de tudo que entra
│   ├── crypto/hash.ts                      # ✅ fase 5 — normalização + SHA-256 do Meta
│   ├── webhooks/adapters/{index,types,perfectpay}.ts  # ✅ fase 7 — formato normalizado por plataforma
│   └── dispatch/purchase-dispatch.ts       # ✅ fase 7 — Purchase pro Meta + GA4
├── components/
│   ├── ui/                                 # ✅ shadcn (button, card, badge, separator, switch, sidebar, sheet, dropdown-menu, input, label, alert, tooltip, skeleton, table, popover, chart)
│   ├── settings/dispatch-tab.tsx           # ✅ fase 7.5 — modo, janela, formulários, token do cron, fila
│   ├── dashboard/                          # ✅ fase 8a — events-table, events-filters, events-chart,
│   │                                       #    status-chips, dispatch-status-badge, event-detail-dialog,
│   │                                       #    pagination-links
│   ├── dashboard-sidebar.tsx               # ✅ fase 3 — navegação (drawer no celular, sidebar no desktop)
│   ├── user-menu.tsx                       # ✅ fase 3 — conta + sair
│   ├── page-header.tsx                     # ✅ fase 3 — cabeçalho e placeholder de fase
│   ├── theme-provider.tsx                  # ✅ fase 1
│   └── theme-toggle.tsx                    # ✅ fase 1
├── hooks/use-mobile.ts                     # ✅ fase 3 — reescrito com useSyncExternalStore (ver "Autenticação e shell")
├── public/track.js                         # ✅ fase 5 — script embutível nos sites (identidade, gtag, pixel, decoração de links)
├── scripts/check-server-actions.mjs        # ✅ fase 4 — roda no build, ver "Credenciais e destinos"
├── scripts/seed-events.mjs                 # ✅ fase 8a — npm run seed / seed:limpar
└── supabase/
    ├── migrations/                          # ✅ fase 2 — SQL das 7 tabelas + RLS + Vault + pg_cron
    │                                        #    fase 5 — rate_limits; fase 7.5 — event_queue
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
- **GA4:** duas coisas foram verificadas e as duas são limitação do Google, não do código: o endpoint de validação **não confere credenciais** (com `api_secret` inválido e com `measurement_id` inexistente, os dois devolvem HTTP 200 e zero mensagens) e o endpoint de coleta devolve **204 sempre**, dando certo ou errado. Não existe resposta de API que prove que a credencial está certa. Por isso o teste faz duas coisas: valida o formato no endpoint de debug e **envia de verdade** um evento `negou_teste_conexao` (nome próprio, pra não entrar nas métricas de página/sessão) com `debug_mode`, que aparece no DebugView em segundos se a credencial estiver certa. O status é `"verificar"`, com link direto pro DebugView.
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

`POST /api/webhook/compra/[platform]` — PerfectPay implementado; Hotmart, Kiwify e Eduzz entram escrevendo um adaptador e registrando em `lib/webhooks/adapters/index.ts`.

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
- **Liberação antecipada:** quando a conversão grava a PII (webhook de compra ou `/api/identify` com dado pessoal), `flush_visitor_events` adianta a fila daquele visitante. Quem converte não espera a janela inteira.
- **O enriquecimento do webhook roda ANTES do retorno de status não-aprovado.** Um boleto/Pix apenas gerado já traz o email do comprador, e é essa PII que os eventos na fila estão esperando — dias antes de a venda ser aprovada. Sair cedo ali desperdiçaria o melhor momento do funil.
- **`fill_visitor_pii` só preenche buraco, nunca sobrescreve.** O visitante pode ter um valor melhor (digitado pela própria pessoa); o webhook é fonte de segunda mão. É o inverso do `/api/identify`, onde o valor mais novo deve ganhar. A função devolve o que preencheu, então a mesma ida ao banco responde "vale liberar a fila?".
  - **Em PL/pgSQL, use `array_append(arr, 'x')` e não `arr || 'x'`.** Com um literal sem tipo o `||` é ambíguo entre concatenar dois arrays e anexar um elemento, e o Postgres tenta interpretar `'x'` como um `text[]` inteiro — `malformed array literal`. Aconteceu de verdade aqui: a migration aplicou sem reclamar (o corpo de uma função PL/pgSQL só é analisado na execução) e o erro só apareceu quando o `verify_phase7_5.sql` chamou a função.
- **`identified` NÃO pode sair do `/api/config/public`.** Aquele endpoint responde com `Cache-Control: public, max-age=60` — um CDN serviria o estado de um visitante pra todos os outros. Ele viaja na resposta do `/api/identify`, que é `no-store`.
- **BUG CORRIGIDO: o `hashPhone` não punha o código do país.** O comentário dizia "com código do país", o código só tirava não-dígitos e zeros à esquerda. Um celular digitado como `(11) 98765-4321` virava `11987654321` e nunca batia com o `5511987654321` que o Meta espera — sem erro nenhum, só correspondência zero. Agora há `normalizePhone(valor, país)`: 10 ou 11 dígitos = nacional e recebe o país (o que resolve até o DDD 55 de Santa Maria/RS); 12 ou 13 já começando com o país ficam como estão. **Todo `phone_hash` gravado antes disso é inútil pro Meta** — não há como recuperá-los, mas o volume era de desenvolvimento.
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
- **Fuso fixo em `America/Sao_Paulo`** (`lib/dashboard/format.ts`). A Vercel roda
  em UTC: sem fixar, um evento das 21h apareceria como meia-noite do dia seguinte
  e a data renderizada no servidor divergiria da do navegador.
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
5. ✅ **Captura de eventos** — `/api/config/public`, `/api/identify`, `/api/event` e `public/track.js`, com CORS fechado, validação, geo no servidor, dedup por `event_id` e rate limit (ver "Captura de eventos")
6. ✅ **Disparo Meta CAPI + GA4 Measurement Protocol** — envio para todos os destinos ativos via `after()`, com a resposta de cada um gravada no log do evento (ver "Disparo server-side"). O módulo do GA4 está pronto mas só é chamado pelo webhook, na fase 7.
7. ✅ **Webhook de compra** — `/api/webhook/compra/[platform]` com adaptador do PerfectPay, vinculação da venda com a visita, idempotência com trava atômica e Purchase disparado pro Meta e pro GA4 (ver "Webhook de compra")
7.5. ✅ **Disparo atrasado com retroalimentação** — fila no Postgres, modo híbrido adaptativo no `track.js`, captura de formulário, enriquecimento do visitante pela compra e pg_cron drenando a fila (ver "Disparo atrasado")
8a. ✅ **Dashboard — tela de Eventos** — tabela com `dispatch_status`/`dispatch_attempts`/`dispatch_error`, chips de contagem, gráfico diário e modal de payload (ver "Tela de Eventos")
8b. ⏳ Dashboard: Visão geral (funil) + Faturamento
8c. ⏳ Dashboard: Geo — mapa do Brasil com `react-simple-maps`
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
- **Gerar o primeiro dado real**: abrir `https://lp.negou.net` em um navegador de verdade (curl não executa o `track.js`). Até agora `visitors`/`events_log`/`purchases` nunca receberam um registro que não fosse de teste — as telas do painel estão sendo construídas contra o `npm run seed`.
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

# Verifica a fila de disparo atrasado (fase 7.5): confere se a produção está com
# o código novo, se o painel está configurado e — com um código de teste real —
# se o pg_cron está REALMENTE drenando. Diz o que fazer em cada falha.
npm run verify:dispatch
npm run verify:dispatch -- --test-code TEST12345   # inclui o teste ao vivo
npm run verify:dispatch -- --so-configuracao       # só a conferência

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
- [VERCEL_DEPLOY.md](../../VERCEL_DEPLOY.md) (regras de deploy do monorepo)

---

## Histórico

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
