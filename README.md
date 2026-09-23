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

## Deploy de um cliente novo, em 3 passos

1. **Supabase:** crie o projeto e rode
   [`supabase/setup.sql`](https://github.com/fdantas87/tracker/raw/main/supabase/setup.sql)
   no SQL Editor — um arquivo, uma colada, o schema inteiro.
2. **Vercel:** clique no botão e preencha as 7 variáveis (as 3 chaves do
   Supabase vêm do passo 1).

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffdantas87%2Ftracker&project-name=tracking-cliente&repository-name=tracking-cliente&envDescription=Cole+as+3+chaves+do+projeto+Supabase+do+cliente+%28Settings+%3E+API%29%2C+liste+os+sites+onde+o+track.js+sera+instalado%2C+escolha+o+nome+do+painel+e+o+pais+padrao+do+telefone+%28ISO-2%2C+ex.+BR%29.&envLink=https%3A%2F%2Fgithub.com%2Ffdantas87%2Ftracker%2Fblob%2Fmain%2FONBOARDING.md%23variaveis-de-ambiente&envDefaults=%7B%22NEXT_PUBLIC_APP_NAME%22%3A%22Tracking%22%2C%22NEXT_PUBLIC_BRAND_NAME%22%3A%22Tracking%22%2C%22TRACKING_DEFAULT_PHONE_COUNTRY%22%3A%22BR%22%7D&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,TRACKING_ALLOWED_ORIGINS,NEXT_PUBLIC_APP_NAME,NEXT_PUBLIC_BRAND_NAME,TRACKING_DEFAULT_PHONE_COUNTRY)

3. **Painel:** abra a URL gerada e crie a conta de administrador na própria tela
   de login. Depois, cadastre pixels e GA4 em Configurações.

> **Assim que o deploy terminar, faça duas coisas, nesta ordem:** crie a conta de
> administrador (enquanto ninguém mais conhece a URL) e ponha o *Deployment
> Protection* em **"Only Preview Deployments"**. O segundo já derrubou a captura
> inteira em produção uma vez — ver
> [ONBOARDING.md](./ONBOARDING.md#protecao).

---

## Rodando local

```bash
npm install
cp .env.example .env.local   # preencha com os dados do seu projeto Supabase
npm run dev                  # http://localhost:3000
```

Sem o `supabase/setup.sql` aplicado no Supabase, `/api/identify` e `/api/event`
respondem 500 e nada é capturado. Ver [ONBOARDING.md](./ONBOARDING.md).

<a id="variaveis-de-ambiente"></a>

## Variáveis de ambiente

| Variável | Obrigatória | O que é |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | URL do projeto Supabase do cliente |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | Chave anon (respeita RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Chave service_role (ignora RLS, só em código `server-only`) |
| `TRACKING_ALLOWED_ORIGINS` | **sim** | Origens que podem capturar, separadas por vírgula. Vazia = captura bloqueada pelo navegador, em silêncio |
| `NEXT_PUBLIC_APP_NAME` | não | Nome no `<title>`. Default: `Tracking` |
| `NEXT_PUBLIC_BRAND_NAME` | não | Marca no cabeçalho do painel. Default: o `APP_NAME` |
| `TRACKING_DEFAULT_PHONE_COUNTRY` | não | País (ISO-2) do telefone quando não há compra para derivá-lo da moeda. Default: `BR`. **Cliente fora do Brasil precisa preencher** |

`NEXT_PUBLIC_APP_NAME` e `NEXT_PUBLIC_BRAND_NAME` são inlinadas em tempo de
build, então o wizard do botão as pede mesmo assim, já preenchidas com
`Tracking` — mudá-las depois exigiria um novo deploy. O nome que aparece no
cabeçalho do painel também pode ser corrigido no primeiro acesso, sem redeploy.
`TRACKING_DEFAULT_PHONE_COUNTRY` também vem no wizard, preenchida com `BR`:
errar o país não dá erro nenhum, só zera a correspondência de telefone no Meta.

## Comandos

```bash
npm run dev              # desenvolvimento
npm run build            # build de produção (roda check:actions e check:setup-sql antes)
npm run lint             # ESLint
npm run build:setup-sql  # regera supabase/setup.sql a partir das migrations
npm run verify:captura   # olha a captura como um visitante anônimo olha
npm run verify:dispatch  # confere a fila de disparo atrasado deste deploy
npm run seed             # dados de demonstração (escreve direto no Postgres)
npm run seed:limpar      # apaga só o que o seed criou
```

`supabase/setup.sql` é **gerado** a partir de `supabase/migrations/`. Acrescentou
uma migration? Rode `npm run build:setup-sql` e commite o resultado — o
`npm run build` falha se os dois divergirem.

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
