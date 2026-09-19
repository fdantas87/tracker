# Escopo deste repositório

Este projeto é o tracker multi-cliente: **um repositório, N deploys**. O mesmo
código roda para vários clientes, cada um com o seu projeto Vercel, o seu
projeto Supabase e o seu domínio. O que distingue um deploy do outro são só as
variáveis de ambiente — ver `.env.example` e `ONBOARDING.md`.

## Regra ao mexer no código

Nada específico de um cliente entra no código: nem domínio, nem marca, nem
credencial. Domínio de captura vem de `TRACKING_ALLOWED_ORIGINS`; nome do painel
vem de `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_BRAND_NAME`; pixels, contas GA4,
contas de anúncio e tokens ficam no banco de cada cliente.

Se precisar de um valor novo que varia por cliente, ele vira variável de
ambiente (e entra no `.env.example` e no `ONBOARDING.md`) ou coluna em
`settings` — nunca uma constante no código.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
