# Arquitetura Multi-Cliente: 1 Repo → N Deploys

## O que vamos fazer

Transformar o tracker atual em um produto que pode ser implantado para **N clientes** a partir de **1 único repositório GitHub**, onde cada cliente tem seu próprio projeto na Vercel com suas próprias credenciais.

---

## User Review Required

> [!IMPORTANT]
> **Uma decisão antes de começar:** o tracker hoje vive dentro de um **monorepo** (`D:/Obsidian/Projetos/Negou/apps/tracking.negou.net`). Para a arquitetura multi-cliente funcionar bem na Vercel, o ideal é extrair o tracker para um **repositório GitHub separado e independente** (ex: `negou-tracker`).
>
> Isso significa: o código do tracker sai do monorepo e passa a ter seu próprio repo. O monorepo continua existindo com seus outros projetos, mas o tracker passa a viver em outro lugar.
>
> **Você confirma que quer extrair o tracker para um repo próprio no GitHub?**

---

## Proposta de Mudanças

### Fase 1 — Código (mudança pequena e necessária)

Hoje o nome `"Negou Tracking"` está hardcoded nas `<title>` de todas as páginas. Para o tracker ser genérico entre clientes, esse nome precisa vir de uma variável de ambiente.

**Nova env var:** `NEXT_PUBLIC_APP_NAME`

#### [MODIFY] [layout.tsx](file:///d:/Negou/apps/tracking.negou.net/app/layout.tsx)
- `title: "Negou Tracking"` → `title: process.env.NEXT_PUBLIC_APP_NAME ?? "Tracking"`

#### [MODIFY] Todas as `page.tsx` do dashboard (vendas, leads, eventos, geo, campanhas, configurações, login)
- `title: "Vendas · Negou Tracking"` → `title: \`Vendas · ${process.env.NEXT_PUBLIC_APP_NAME ?? "Tracking"}\``
- (idem para cada página)

> [!NOTE]
> **Só isso no código.** Pixels, GA4, contas de anúncio e tokens já ficam no banco do Supabase de cada cliente — não há mais nada hardcoded que precise virar env var.

---

### Fase 2 — Criar o repo standalone no GitHub

1. Criar novo repositório no GitHub: `negou-tracker` (privado)
2. Copiar o código atual do tracker para esse novo repo
3. Garantir que `.gitignore` exclui `.env.local` (já exclui ✅)
4. Fazer o primeiro push

---

### Fase 3 — Configurar o deploy atual (tracking.negou.net) na Vercel

Para o projeto **atual** (seu próprio tracker da Negou):

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase atual |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon atual |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role atual |
| `NEXT_PUBLIC_APP_NAME` | `Negou Tracking` |

---

### Fase 4 — Playbook para onboarding de novo cliente

Para cada novo cliente, o processo se reduz a:

```
1. Criar projeto Supabase → copiar as 3 chaves
2. Criar projeto Vercel → apontar para o repo negou-tracker
3. Colar as 4 env vars (3 Supabase + APP_NAME)
4. Configurar domínio do cliente na Vercel
5. Pronto — o cliente já tem o tracker rodando
```

**Quando você melhorar o código:** push no GitHub → todos os projetos Vercel recebem o deploy automaticamente. Zero trabalho extra.

---

## Visão final da arquitetura

```
GitHub: negou-tracker (1 repo)
│
├── Vercel: tracking.negou.net        (env: Supabase da Negou)
├── Vercel: tracking.cliente-a.com.br (env: Supabase do Cliente A)
├── Vercel: tracking.cliente-b.com.br (env: Supabase do Cliente B)
└── Vercel: tracking.cliente-c.com.br (env: Supabase do Cliente C)
```

---

## Plano de execução (em ordem)

- `[ ]` **1.** Ajustar as `<title>` das páginas para usar `NEXT_PUBLIC_APP_NAME`
- `[ ]` **2.** Criar novo repo `negou-tracker` no GitHub (privado)
- `[ ]` **3.** Fazer push do código para o novo repo
- `[ ]` **4.** Criar projeto na Vercel conectado ao novo repo
- `[ ]` **5.** Adicionar as 4 env vars na Vercel
- `[ ]` **6.** Configurar domínio `tracking.negou.net` na Vercel
- `[ ]` **7.** Verificar que o deploy funciona

---

## Verificação

- [ ] `tracking.negou.net` continua funcionando igual após a migração
- [ ] Um push de teste no GitHub reflete automaticamente no Vercel
- [ ] As env vars do `.env.local` local não vão para o GitHub

