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
- **Supabase** (Postgres + Auth + Vault/pgsodium + pg_cron) — **ainda não provisionado** (ver "Pendências manuais")
- **Recharts** e **react-simple-maps** — entram nas fases 8/9 (dashboard/geo), não instalados ainda
- **Upstash Redis** (`@upstash/ratelimit`) — entra na fase 5 (captura de eventos)
- **GitHub** para versionamento, **Vercel** para deploy (projeto próprio, root directory `apps/tracking.negou.net`, sem `vercel.json` — env vars só na dashboard da Vercel, seguindo `VERCEL_DEPLOY.md` da raiz do monorepo)

---

## Arquitetura (visão-alvo; itens ainda não implementados marcados)

```
apps/tracking.negou.net/
├── middleware.ts                          # [fase 3] @supabase/ssr: refresh de sessão + guarda do dashboard
├── app/
│   ├── (auth)/login/page.tsx               # [fase 3] único ponto de entrada, sem signup
│   ├── (dashboard)/                        # [fase 3+] layout autenticado, nav, páginas
│   │   ├── page.tsx                        # Visão geral        [fase 8]
│   │   ├── eventos/page.tsx                # [fase 8]
│   │   ├── faturamento/page.tsx            # [fase 8]
│   │   ├── campanhas/page.tsx              # [fase 9]
│   │   ├── geo/page.tsx                    # [fase 8]
│   │   └── configuracoes/                  # [fase 4] CRUD de credenciais (Server Actions)
│   ├── layout.tsx                          # ✅ fase 1 — fontes, ThemeProvider
│   ├── page.tsx                            # ✅ fase 1 — placeholder do design system (será substituída pela home do dashboard)
│   ├── globals.css                         # ✅ fase 1 — tokens HSL, gradiente, glass, tabular-nums
│   └── api/
│       ├── identify/route.ts               # [fase 5]
│       ├── event/route.ts                  # [fase 5]
│       ├── config/public/route.ts          # [fase 5]
│       └── webhook/compra/[platform]/route.ts   # [fase 7]
├── lib/
│   ├── supabase/{server,service,middleware}.ts   # [fase 2/3]
│   ├── crypto/{vault,webhook-token}.ts           # [fase 2/4]
│   ├── meta/capi.ts                        # [fase 6] META_GRAPH_API_VERSION numa constante única
│   ├── ga4/mp.ts                           # [fase 6]
│   ├── geo.ts                              # [fase 5] headers x-vercel-ip-*
│   ├── rate-limit.ts                       # [fase 5]
│   └── webhooks/adapters/{index,perfectpay}.ts   # [fase 7]
├── components/
│   ├── ui/                                 # ✅ shadcn (button, card, badge, separator, switch — mais componentes conforme necessário)
│   ├── theme-provider.tsx                  # ✅ fase 1
│   └── theme-toggle.tsx                    # ✅ fase 1
├── public/track.js                         # [fase 5] snippet embutível para lp.negou.net/quiz.negou.net
└── supabase/migrations/                    # [fase 2] SQL das 7 tabelas + RLS + Vault + pg_cron
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
- Os 5 arquivos soltos `*.txt` na raiz do app (credenciais de referência) estão no `.gitignore` — **nunca remover essas linhas**; eles serão apagados pelo usuário depois de migrados para o painel (fase 4)

### Código

- Server Actions para CRUD que só o próprio dashboard usa; Route Handlers só para os 3 contratos externos (captura, webhook, config pública) — ver estrutura acima
- Sempre checar a documentação oficial (Meta Graph API, GA4) antes de fixar uma versão/endpoint — a versão da Graph API do Meta vive numa única constante (`META_GRAPH_API_VERSION`), fácil de atualizar

---

## Fases (commit + aprovação do usuário ao final de cada uma)

1. ✅ **Fundação** — scaffold Next.js/React, Tailwind + shadcn/ui, design tokens, `.gitignore`, `CLAUDE.md`
2. ⏳ Banco de dados e segurança (migrations, RLS, Vault, pg_cron)
3. ⏳ Autenticação e shell do dashboard
4. ⏳ Painel de configurações (CRUD credenciais + testar conexão)
5. ⏳ Captura de eventos (`/api/identify`, `/api/event`, script cliente)
6. ⏳ Disparo Meta CAPI + GA4 Measurement Protocol
7. ⏳ Webhook de compra (PerfectPay primeiro)
8. ⏳ Dashboard: Visão geral, Eventos, Faturamento, Geo
9. ⏳ Campanhas (Meta Ads Insights + ROAS/CPA)
10. ⏳ Auditoria de segurança e publicação

## Pendências manuais (fora do alcance de comandos automatizados)

Estas ações exigem login nas contas do próprio usuário e não podem ser feitas por aqui:

- **Criar o projeto Supabase** (supabase.com/dashboard → New Project) e me passar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (via `.env.local`, nunca colados no chat em texto plano se puder evitar) antes da fase 2.
- **Criar o projeto na Vercel** (Import do repo `fdantas87/negou`, Root Directory = `apps/tracking.negou.net`), conforme `VERCEL_DEPLOY.md` da raiz — isso pode esperar até a fase 10, mas pode ser feito antes se você preferir já ter o preview deploy rodando fase a fase.
- Habilitar as extensões `pgcrypto`, `pgsodium`/Vault e `pg_cron` no projeto Supabase (feito via migration na fase 2, mas a *ativação* do Vault também tem um passo de UI em Database → Vault).

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
