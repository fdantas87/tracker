# Onboarding de um cliente novo

Do zero até o tracker capturando. **A ordem importa** — vários passos falham em
silêncio se feitos fora de hora, e o sintoma é sempre o mesmo ("não chega
evento"), que não aponta para a causa.

Tempo: ~30 min, quase tudo em painel web.

---

## 1. Supabase — criar o projeto

1. [dashboard.supabase.com](https://dashboard.supabase.com) → **New project**.
2. Escolha a região mais perto do público do cliente (`South America (São Paulo)`
   para Brasil).
3. Guarde a senha do banco (não é usada por aqui, mas é irrecuperável).
4. **Settings → API**, copie as três chaves:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Supabase — habilitar `pg_net` ANTES das migrations

**Database → Extensions**, procure `pg_net`, habilite.

Sem ela a migration `20260917190000_event_queue.sql` falha. E, se você criar a
extensão depois, `tick_event_queue()` existe mas não chama a Vercel: a fila de
disparo atrasado nunca drena e **nenhum evento chega ao Meta** — sem erro
nenhum aparecer.

`pg_cron` e o Vault costumam já vir habilitados; a migration de extensões
cuida do resto.

## 3. Supabase — aplicar as migrations

**SQL Editor** → cole o conteúdo de cada arquivo de `supabase/migrations/` e
rode, **na ordem do nome** (timestamp crescente):

```
20260916140000_extensions.sql
20260916140100_tables.sql
20260916140200_rls_policies.sql
20260916140300_vault_functions.sql
20260916140400_retention_job.sql
20260917170000_rate_limits.sql
20260917190000_event_queue.sql          <- exige pg_net (passo 2)
20260918120000_geo_enriquecido.sql
20260919090000_purchases_dados_comprador.sql
20260919120000_purchases_forma_pagamento.sql
```

São aplicadas à mão de propósito: manter o banco atualizado não exige
compartilhar nenhum token novo.

Depois, rode `supabase/verify_phase2.sql` e confira que RLS, Vault e cron estão
como esperado.

> **Banco vazio = captura morta.** `/api/identify` e `/api/event` respondem 500
> na primeira visita se as tabelas não existirem. Este passo vem antes do
> deploy, sempre.

## 4. Supabase — criar o usuário do painel

**Authentication → Users → Add user**, com email e senha, **Auto Confirm User**
marcado.

Não existe rota de cadastro no painel, de propósito. Sem este passo ninguém
consegue entrar.

## 5. Vercel — criar o projeto

1. **Add New → Project**, importe o repositório do tracker.
2. Framework: Next.js (detectado sozinho).
3. Root Directory: a raiz do repositório.
4. **Não faça o deploy ainda** — configure as variáveis primeiro (passo 6).

## 6. Vercel — variáveis de ambiente

**Settings → Environment Variables**, em Production e Preview:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | do passo 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | do passo 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | do passo 1 |
| `TRACKING_ALLOWED_ORIGINS` | todo site onde o track.js será instalado |
| `NEXT_PUBLIC_APP_NAME` | ex.: `Cliente A Tracking` |
| `NEXT_PUBLIC_BRAND_NAME` | ex.: `Cliente A` |

`TRACKING_ALLOWED_ORIGINS` é separada por vírgula, com esquema e sem barra final:

```
https://cliente-a.com.br,https://www.cliente-a.com.br,https://lp.cliente-a.com.br
```

> **Se ficar vazia, o navegador bloqueia a captura inteira.** A comparação é por
> igualdade exata — subdomínio **não** herda, liste um por um. O domínio de
> produção do próprio projeto Vercel entra sozinho na lista.

## 7. Vercel — domínio e deploy

1. **Settings → Domains** → adicione `tracking.cliente-a.com.br`.
2. Aponte o CNAME no DNS do cliente.
3. Faça o deploy.
4. Confira: `https://tracking.cliente-a.com.br/api/config/public` responde JSON,
   e `/api/cron/dispatch` responde **401** sem token (se responder 200, pare e
   investigue).

## 8. Painel — destinos e disparo

Entre com o usuário do passo 4.

**Configurações → Contas:** cadastre os pixels do Meta, as propriedades GA4 e as
contas de anúncio do cliente. Use "Testar conexão" em cada uma.

**Configurações → Disparo:**
- **URL do cron:** `https://tracking.cliente-a.com.br/api/cron/dispatch`
- **Token do cron:** gere e **guarde** — ele só aparece uma vez.
- Modo: `adaptive` (padrão) e janela de 15 min, salvo pedido contrário.

Sem a URL do cron preenchida, `tick_event_queue()` sai em silêncio e a fila
nunca drena. Este passo é **depois** do deploy, porque a URL só existe agora.

**Configurações → Geral:** gere o `webhook_token` (também mostrado uma vez só) e
cadastre na plataforma de pagamento:

```
https://tracking.cliente-a.com.br/api/webhook/compra/perfectpay?token=SEU_TOKEN
```

## 9. Instalar o track.js nos sites

```html
<script src="https://tracking.cliente-a.com.br/track.js" defer></script>
```

Em todo site listado em `TRACKING_ALLOWED_ORIGINS`. O domínio do `src` é o que
define para onde os eventos vão.

## 10. Verificar de ponta a ponta

```bash
npm run verify:dispatch -- --so-configuracao
```

Depois, no navegador: abra o site do cliente, confira em **Network** que
`/api/identify` responde 200 (**não** um erro de CORS), e veja o visitante
aparecer em **Leads** e o PageView em **Eventos** no painel.

---

## Quando algo não chega

| Sintoma | Causa provável |
|---|---|
| Zero eventos, `/api/identify` falha com erro de CORS | O site não está em `TRACKING_ALLOWED_ORIGINS` |
| Zero eventos, `/api/identify` responde 500 | Migrations não aplicadas |
| Eventos aparecem, mas ficam `pending` para sempre | URL/token do cron não configurados, ou `pg_net` desabilitado |
| Eventos saem, mas o Meta não casa ninguém | Pixel não cadastrado, ou token de CAPI sem permissão |
| Compra registrada sem atribuição | Normal quando o link de checkout não foi decorado; ver `match_method` |

## Checklist

- [ ] Projeto Supabase criado, 3 chaves copiadas
- [ ] `pg_net` habilitado **antes** das migrations
- [ ] 10 migrations aplicadas na ordem + `verify_phase2.sql` limpo
- [ ] Usuário do painel criado e confirmado
- [ ] Projeto Vercel criado
- [ ] 6 variáveis preenchidas, `TRACKING_ALLOWED_ORIGINS` inclusive
- [ ] Domínio apontado, deploy feito, `/api/cron/dispatch` devolvendo 401
- [ ] Pixels/GA4 cadastrados e testados no painel
- [ ] URL e token do cron preenchidos **depois** do deploy
- [ ] `webhook_token` gerado e cadastrado na plataforma de pagamento
- [ ] track.js instalado nos sites
- [ ] Visita de teste aparecendo em Leads e Eventos
