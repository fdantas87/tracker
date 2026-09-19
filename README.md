# Tracking Panel

Tracking server-side (Meta Conversions API + GA4 Measurement Protocol) com painel
próprio: visita → checkout → compra, sobrevivendo a bloqueio de cookie e de
ad-blocker.

**Um repositório, N deploys.** O mesmo código roda para vários clientes. Cada
cliente tem o seu projeto na Vercel, o seu projeto no Supabase e o seu domínio;
o que distingue um deploy do outro são apenas as variáveis de ambiente. Pixels,
contas GA4, contas de anúncio e tokens de webhook ficam no banco de cada
cliente, configurados pelo painel — não existe credencial de cliente no código.

```
1 repositório
├── Vercel: tracking.cliente-a.com.br  → Supabase do Cliente A
├── Vercel: tracking.cliente-b.com.br  → Supabase do Cliente B
└── Vercel: tracking.cliente-c.com.br  → Supabase do Cliente C
```

Melhorou o código? Um push atualiza todos os deploys.

---

## Rodando local

```bash
npm install
cp .env.example .env.local   # preencha com os dados do seu projeto Supabase
npm run dev                  # http://localhost:3000
```

Sem as migrations aplicadas no Supabase, `/api/identify` e `/api/event`
respondem 500 e nada é capturado. Ver [ONBOARDING.md](./ONBOARDING.md).

## Variáveis de ambiente

| Variável | Obrigatória | O que é |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | URL do projeto Supabase do cliente |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | Chave anon (respeita RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Chave service_role (ignora RLS, só em código `server-only`) |
| `TRACKING_ALLOWED_ORIGINS` | **sim** | Origens que podem capturar, separadas por vírgula. Vazia = captura bloqueada pelo navegador, em silêncio |
| `NEXT_PUBLIC_APP_NAME` | não | Nome no `<title>`. Default: `Tracking` |
| `NEXT_PUBLIC_BRAND_NAME` | não | Marca no cabeçalho do painel. Default: o `APP_NAME` |

## Comandos

```bash
npm run dev             # desenvolvimento
npm run build           # build de produção (roda check:actions antes)
npm run lint            # ESLint
npm run verify:dispatch # confere a fila de disparo atrasado deste deploy
npm run seed            # dados de demonstração (escreve direto no Postgres)
npm run seed:limpar     # apaga só o que o seed criou
```

## Instalando o tracker num site

```html
<script src="https://tracking.SEUDOMINIO.com/track.js" defer></script>
```

O domínio do `src` é o que define para onde os eventos vão — o mesmo arquivo
serve qualquer cliente, sem edição. O site precisa estar em
`TRACKING_ALLOWED_ORIGINS` no deploy correspondente.

## Onboarding de um cliente novo

Passo a passo completo — Supabase, migrations, pg_cron, Vercel, domínio e
configuração do painel — em [ONBOARDING.md](./ONBOARDING.md).

## Documentação de arquitetura

[CLAUDE.md](./CLAUDE.md) é o registro vivo do projeto: decisões, armadilhas já
encontradas e o porquê de cada uma. Vale ler antes de mexer em captura, disparo
ou webhook.
