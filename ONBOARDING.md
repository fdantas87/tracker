# Onboarding de um cliente novo

Do zero até o tracker capturando. **A ordem importa** — vários passos falham em
silêncio se feitos fora de hora, e o sintoma é sempre o mesmo ("não chega
evento"), que não aponta para a causa.

Tempo: ~20 min, tudo em painel web.

Este arquivo é a fonte única do procedimento. Ele tem duas partes:

- **Parte 1 — instalação** (passos 1 a 5): quem tem acesso ao Supabase e à
  Vercel.
- **Parte 2 — configuração do painel** (passos 6 a 8): pode ser o próprio
  cliente, sem depender de ninguém.

---

# Parte 1 — instalação

## 1. Supabase — criar o projeto

1. [dashboard.supabase.com](https://dashboard.supabase.com) → **New project**.
2. Escolha a região mais perto do público do cliente (`South America (São Paulo)`
   para Brasil).
3. Guarde a senha do banco (não é usada por aqui, mas é irrecuperável).
4. **Settings → API**, copie as três chaves:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Supabase — rodar o `setup.sql`

**SQL Editor → New query**, cole o conteúdo de
[`supabase/setup.sql`](https://github.com/fdantas87/tracker/raw/main/supabase/setup.sql)
e rode. Um arquivo, uma vez. Ele cria as 7 tabelas, as políticas de RLS, as
funções do Vault, a fila de disparo e os 3 jobs do `pg_cron`.

> **Baixe o arquivo cru** (o link acima é o `raw`) e cole a partir de um editor
> de texto. Copiar da página renderizada do GitHub, num arquivo de ~58 KB, já
> truncou conteúdo em casos conhecidos.

O script roda numa transação única: **ou o schema inteiro aplica, ou nada
aplica**. Não existe meio-termo, e é por isso que ele é um arquivo só.

Duas mensagens de erro possíveis, as duas na primeira linha e as duas com o que
fazer:

| Mensagem | O que fazer |
|---|---|
| `O Supabase Vault nao esta habilitado neste projeto` | **Database → Extensions**, habilite `supabase_vault`, rode de novo |
| `Este banco JA tem o schema do tracker instalado` | Você já rodou. Para atualizar um banco existente, aplique só a migration nova de `supabase/migrations/` |

Não é mais preciso habilitar `pg_net` à mão — o próprio script cria a extensão.

Depois, opcionalmente, rode `supabase/verify_phase2.sql` e
`supabase/verify_phase7_5.sql` para conferir RLS, Vault, cron e a fila.

> **Banco vazio = captura morta.** `/api/identify` e `/api/event` respondem 500
> na primeira visita se as tabelas não existirem. Este passo vem antes do
> deploy, sempre.
>
> **Se o arquivo único falhar** por qualquer motivo que não os dois acima, o
> caminho antigo continua valendo: aplique os arquivos de
> `supabase/migrations/` um a um, na ordem do nome.

## 3. Vercel — deploy

Clique no botão do [README](./README.md#deploy-de-um-cliente-novo-em-3-passos).
A Vercel clona o repositório na conta do cliente, pede as variáveis e faz o
deploy.

<a id="variaveis-de-ambiente"></a>

### Variáveis de ambiente

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | do passo 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | do passo 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | do passo 1 |
| `TRACKING_ALLOWED_ORIGINS` | todo site onde o track.js será instalado |
| `NEXT_PUBLIC_APP_NAME` | ex.: `Cliente A Tracking` |
| `NEXT_PUBLIC_BRAND_NAME` | ex.: `Cliente A` |
| `TRACKING_DEFAULT_PHONE_COUNTRY` | ISO-2 do país do cliente — `BR`, `US`, `PT`... (vem `BR`) |

`TRACKING_ALLOWED_ORIGINS` é separada por vírgula, com esquema e sem barra final:

```
https://cliente-a.com.br,https://www.cliente-a.com.br,https://lp.cliente-a.com.br
```

> **Se ficar vazia, o navegador bloqueia a captura inteira.** A comparação é por
> igualdade exata — subdomínio **não** herda, liste um por um. O domínio de
> produção do próprio projeto Vercel entra sozinho na lista.
>
> Mudar o valor depois **só vale com um novo deploy**: a allowlist é um `const`
> de topo de módulo, resolvido no cold start.

`NEXT_PUBLIC_APP_NAME` e `NEXT_PUBLIC_BRAND_NAME` já vêm preenchidas com
`Tracking` no formulário — troque pelo nome do cliente. O nome do cabeçalho do
painel ainda pode ser corrigido no passo 5, sem redeploy; o do `<title>` não.

> **`TRACKING_DEFAULT_PHONE_COUNTRY` vem `BR` — troque se o cliente não for do
> Brasil.** Numa compra, o país do telefone sai da moeda da venda (BRL → BR,
> USD → US, EUR → PT). Esta variável vale onde não há moeda: os formulários e o
> `thetrack.identify()` do site, antes de qualquer compra. País errado aqui não dá
> erro nenhum — o hash do telefone só deixa de casar no Meta. Mudar depois
> exige um novo deploy.

## 4. Primeiro acesso — AGORA, antes do domínio

Abra a URL `*.vercel.app` que a Vercel acabou de gerar. A tela de login mostra
**"Configurar pela primeira vez"**: preencha nome da organização, email e senha
(mínimo 10 caracteres). Você entra direto no painel.

> **Faça isso imediatamente, ainda na URL `*.vercel.app`.** Enquanto não existe
> nenhuma conta, quem alcançar a URL cria a de administrador. A URL da Vercel é
> desconhecida e não aparece em Certificate Transparency — mas um **domínio
> customizado aparece em minutos** depois de você apontar o DNS. Feito o
> primeiro acesso, essa tela some para sempre.

<a id="protecao"></a>

## 5. Vercel — proteção e domínio

1. **Settings → Deployment Protection → Vercel Authentication** → deixe em
   **"Only Preview Deployments"**.

   ⚠️ **Passo que já derrubou a captura inteira em produção.** No padrão
   *Standard Protection* a proteção vale para **todos** os deployments, e aí
   `/track.js` e os endpoints de captura respondem `302` para o login da Vercel.
   Nenhum visitante anônimo consegue carregar o script. E você **não percebe
   testando logado**: seu navegador tem sessão na Vercel, atravessa a proteção e
   mostra o painel funcionando. Confira com `vercel project protection` — o
   esperado é `"deploymentType": "preview"`.

   O botão de deploy herda o padrão do time, então **este passo nunca é
   automático**.
2. **Settings → Domains** → adicione `tracking.cliente-a.com.br` e aponte o CNAME
   no DNS do cliente.
3. Confira: `https://tracking.cliente-a.com.br/api/config/public` responde JSON,
   e `/api/cron/dispatch` responde **401** sem token (se responder 200, pare e
   investigue).

---

# Parte 2 — configuração do painel

Daqui para baixo é tudo dentro do painel, com a conta criada no passo 4.

## 6. Destinos e disparo

**Configurações → Contas:** cadastre os pixels do Meta, as propriedades GA4 e as
contas de anúncio do cliente. Use "Testar conexão" em cada uma.

**Disparo atrasado: não há nada para ativar.** O primeiro login no painel (em
qualquer tela) já registra sozinho o endereço que o pg_cron chama e o token
que ele usa, a partir do domínio por onde você acessou. Se o domínio mudar
depois (ex.: de `*.vercel.app` para `tracking.cliente-a.com.br`), o próximo
acesso pelo domínio novo corrige sozinho.

Em **Eventos → aba Delay** só resta escolher o modo e a janela, se o padrão
(`adaptive`, 15 min) não servir. A mesma aba mostra quando o pg_cron chamou o
endpoint pela última vez — é assim que se confirma que está funcionando, sem
abrir o SQL Editor.

**Configurações → Geral:** gere o `webhook_token` (também mostrado uma vez só) e
cadastre na plataforma de pagamento:

```
https://tracking.cliente-a.com.br/api/webhook/compra/perfectpay?token=SEU_TOKEN
```

## 7. Instalar o track.js nos sites

```html
<script src="https://tracking.cliente-a.com.br/track.js" defer></script>
```

Em todo site listado em `TRACKING_ALLOWED_ORIGINS`. O domínio do `src` é o que
define para onde os eventos vão.

## 8. Verificar de ponta a ponta

```bash
npm run verify:captura -- --origem https://lp.cliente-a.com.br
npm run verify:dispatch -- --so-configuracao
```

O primeiro olha a captura como um visitante anônimo olha: o `track.js` está
público, o CORS libera cada domínio do cliente, e o painel tem destinos
cadastrados. O segundo confere a fila.

Depois, no navegador, **em janela anônima** (logado você atravessa o Deployment
Protection e o teste mente): abra o site do cliente, confira em **Network** que
`/track.js` responde 200 e que `/api/identify` responde 200 (**não** um erro de
CORS), e veja o visitante aparecer em **Leads** e o PageView em **Eventos**.

---

## Perdi a senha do painel

Não há envio de email (um projeto Supabase novo não tem SMTP configurado), mas
há dois caminhos, os dois no painel do Supabase do cliente:

- **Authentication → Users → o usuário → Reset password.** Define uma senha nova
  direto, sem email.
- **Ou apague o usuário.** Na próxima visita a `/login`, a tela "Configurar pela
  primeira vez" reaparece sozinha, porque `auth.users` voltou a estar vazia.

Nos dois casos **nenhum dado de tracking é perdido** — visitantes, eventos,
vendas e os segredos do Vault não têm vínculo nenhum com o usuário do painel. No
segundo, só o nome da organização precisa ser digitado de novo.

Para criar um **segundo** acesso, use **Authentication → Users → Add user** com
**Auto Confirm User** marcado. Ele não terá o nome da organização no
`app_metadata`, então verá o valor de `NEXT_PUBLIC_BRAND_NAME` no cabeçalho —
copie o `app_metadata` do primeiro usuário se quiser que os dois vejam igual.

## Quando algo não chega

| Sintoma | Causa provável |
|---|---|
| Zero eventos, e `/track.js` responde 302 para `vercel.com/sso-api` | Deployment Protection ligado em Produção (passo 5.1) |
| Zero eventos, `/api/identify` falha com erro de CORS | O site não está em `TRACKING_ALLOWED_ORIGINS`, ou a variável mudou sem redeploy |
| Zero eventos, `/api/identify` responde 500 | `setup.sql` não aplicado |
| Eventos aparecem, mas ficam `pending` para sempre | URL/token do cron não configurados |
| Eventos saem, mas o Meta não casa ninguém | Pixel não cadastrado, ou token de CAPI sem permissão |
| Compra registrada sem atribuição | Normal quando o link de checkout não foi decorado; ver `match_method` |
| A tela de login mostra "Não foi possível verificar a instalação" | `SUPABASE_SERVICE_ROLE_KEY` ausente ou errada nas variáveis da Vercel |
| A tela de "Configurar pela primeira vez" aparece num painel já usado | Alguém apagou o usuário no Supabase. Recrie a conta — nenhum dado de tracking se perdeu |

## Checklist

- [ ] Projeto Supabase criado, 3 chaves copiadas
- [ ] `supabase/setup.sql` rodado, sem erro
- [ ] Deploy feito pelo botão, 6 variáveis preenchidas
- [ ] **Conta de administrador criada, ainda na URL `*.vercel.app`**
- [ ] Deployment Protection em "Only Preview Deployments"
- [ ] Domínio apontado, `/api/cron/dispatch` devolvendo 401
- [ ] `npm run verify:captura` passando
- [ ] Pixels/GA4 cadastrados e testados no painel
- [ ] URL e token do cron preenchidos **depois** do deploy
- [ ] `webhook_token` gerado e cadastrado na plataforma de pagamento
- [ ] track.js instalado nos sites
- [ ] Visita de teste aparecendo em Leads e Eventos
