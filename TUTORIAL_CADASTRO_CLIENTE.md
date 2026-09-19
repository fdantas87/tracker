# Tutorial: Como Cadastrar e Publicar um Novo Cliente no Tracker

Este guia é o passo a passo definitivo para você criar o ambiente de um novo cliente usando a arquitetura **1 Único Repositório (`tracker`) ➔ N Projetos na Vercel**.

---

## Visão Geral do Processo

```
1. Criar Supabase do Cliente (Banco isolado)
2. Ativar pg_net e rodar as Migrations SQL
3. Criar o Usuário de Acesso do Cliente
4. Criar o Projeto na Vercel conectado ao repo "tracker"
5. Configurar as Variáveis de Ambiente na Vercel
6. Adicionar Domínio Personalizado
7. Configurar Pixels e Integrações no Painel Web
```

---

## Passo 1: Criar o Supabase do Cliente

1. Acesse [supabase.com](https://supabase.com) e crie um **New Project**.
2. Defina:
   - **Name:** Nome do cliente (ex: `tracker-clientex`)
   - **Region:** `South America (São Paulo)`
   - Guarde a senha mestra do banco em local seguro.
3. Vá em **Project Settings ➜ API** e copie as 3 chaves:
   - **Project URL** (ex: `https://xxxxxx.supabase.co`)
   - **anon / public key**
   - **service_role / secret key**

---

## Passo 2: Extensões e Migrations no Supabase

> ⚠️ **ATENÇÃO:** A extensão `pg_net` precisa ser ligada ANTES de rodar as tabelas!

1. No menu lateral do Supabase, vá em **Database ➜ Extensions**.
2. Procure por **`pg_net`** e clique para **habilitar/ativar**.
3. Vá em **SQL Editor** no Supabase e execute os scripts da pasta `supabase/migrations/` na ordem numérica (ou use o consolidado):
   - `20260916140000_extensions.sql`
   - `20260916140100_tables.sql`
   - `20260916140200_rls_policies.sql`
   - `20260916140300_vault_functions.sql`
   - `20260916140400_retention_job.sql`
   - `20260917170000_rate_limits.sql`
   - `20260917190000_event_queue.sql`
   - `20260918120000_geo_enriquecido.sql`
   - `20260919090000_purchases_dados_comprador.sql`
   - `20260919120000_purchases_forma_pagamento.sql`

---

## Passo 3: Criar o Usuário para o Cliente Entrar no Painel

O tracker não tem cadastro aberto público por segurança. O usuário é criado no Supabase:

1. No Supabase, vá em **Authentication ➜ Users**.
2. Clique em **Add user ➜ Create user**.
3. Preencha o **Email** e a **Senha** de acesso do cliente.
4. Marque a opção **Auto Confirm User** (para não exigir confirmação de e-mail).
5. Salve.

---

## Passo 4: Criar o Projeto na Vercel

1. Acesse [vercel.com](https://vercel.com).
2. Clique em **Add New... ➜ Project**.
3. Localize e importe o repositório **`fdantas87/tracker`**.
4. Defina o **Project Name** na Vercel (ex: `tracker-clientex`).
5. **Framework Preset:** Next.js (já detecta sozinho).
6. **Root Directory:** Deixe `.` (a raiz).

---

## Passo 5: Configurar as Variáveis de Ambiente na Vercel

Na mesma tela de criação do projeto (ou depois em *Settings ➜ Environment Variables*), adicione:

| Variável | Descrição / Exemplo |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase criado no Passo 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave `anon` pública do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave `service_role` secreta do Supabase |
| `NEXT_PUBLIC_APP_NAME` | Nome exibido na aba do navegador (ex: `Tracking · Loja X`) |
| `NEXT_PUBLIC_BRAND_NAME` | Nome da marca na barra lateral e login (ex: `Loja X`) |
| `TRACKING_ALLOWED_ORIGINS` | URLs dos sites onde o pixel vai capturar (separadas por vírgula, sem barra no final). Ex: `https://lojax.com.br,https://lp.lojax.com.br` |

Clique em **Deploy**.

---

## Passo 6: Domínio do Cliente

1. No projeto da Vercel, vá em **Settings ➜ Domains**.
2. Adicione o subdomínio desejado (ex: `tracking.lojax.com.br`).
3. No painel de DNS do domínio do cliente (Cloudflare, Registro.br, GoDaddy, etc.):
   - Crie um apontamento tipo **CNAME**:
     - Nome: `tracking`
     - Destino: `cname.vercel-dns.com`
4. Aguarde o SSL da Vercel ficar verde.

---

## Passo 7: Configurações Finais no Painel do Tracker

Acesse o endereço do cliente (ex: `https://tracking.lojax.com.br/login`):

1. **Faça login** com o email e senha criados no Passo 3.
2. **Configurações ➜ Contas:**
   - Adicione o **ID do Pixel do Meta** e o **Token da Conversions API (CAPI)**.
   - Adicione o **Measurement ID do GA4** e o **API Secret** (se aplicável).
   - Teste a conexão pelo próprio botão no painel.
3. **Configurações ➜ Disparo:**
   - Preencha a URL do Cron: `https://tracking.lojax.com.br/api/cron/dispatch`
   - Gere e salve o Token do Cron.
4. **Instalar o Script na Loja/Landing Page:**
   Coloque a tag no `<head>` ou antes de fechar o `</body>` de todos os sites listados em `TRACKING_ALLOWED_ORIGINS`:
   ```html
   <script src="https://tracking.lojax.com.br/track.js" defer></script>
   ```

---

## 🚀 E as atualizações futuras?

Sempre que você desenvolver novidades, novas telas ou correções no código do `tracker`:
- Basta fazer o `git push` no repositório `tracker`.
- **A Vercel atualizará todos os clientes automaticamente em minutos!**
