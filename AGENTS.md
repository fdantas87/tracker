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

## Design System — Settings UI

Os cards de configuração seguem um padrão estético estrito ("Impeccable" + Glassmorphism).
Sempre que criar ou editar seções de configurações, obedeça os seguintes tokens de classes:

- **Container do Card:** `relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-8 text-center sm:p-12 shadow-sm`
- **Glow Background:** Um div absoluto topo `pointer-events-none absolute -top-24 left-1/2 h-48 w-full max-w-md -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-3xl`
- **Container Interno:** `relative z-10 flex w-full max-w-5xl flex-col items-center gap-10`
- **Headline (H2):** Usar um ícone `size-7 text-primary` ao lado de um `h2` com `text-2xl font-semibold tracking-tight sm:text-3xl`
- **Subheadline (p):** `mx-auto max-w-lg text-sm text-muted-foreground sm:text-base`
- **Inputs e Selects (Placeholders textuais):** Altura fixa `h-14` com `rounded-2xl border-primary/20 bg-background/80 px-5 shadow-sm backdrop-blur transition-colors hover:border-primary/40 focus:border-primary/40 focus:ring-0`
  - *Nota sobre Dropdowns:* No corpo da página, os dropdowns (`<SelectTrigger>`) devem ter estritamente a mesma altura dos Inputs (`h-14`). Essa regra não se aplica a barras de navegação ou Topbars.
- **Botões Principais (Salvar, Gerar):** Altura `h-12` com `rounded-xl px-12 sm:w-auto`
- **Botões Secundários (Copiar):** Altura `h-12` com `rounded-xl px-6 sm:w-auto`
- **Botões embutidos dentro de Inputs:** Altura `h-10 rounded-xl px-4` com posicionamento absoluto.
- **Anotações de Rodapé:** Fonte Manrope via estilo inline, `flex w-full items-start justify-center gap-2.5 text-left text-[14px] leading-relaxed text-muted-foreground sm:items-center sm:text-center`. O parágrafo filho deve ter `text-balance`.

---

## Design System — Topbar (Hierarquia de z-index)

O Topbar (cabeçalho principal da aplicação) deve SEMPRE ter o `z-index` mais alto nas telas (`z-50`), garantindo que a navegação global, breadcrumbs e menus de usuário sobreponham componentes de rolagem, mapas e gráficos complexos de forma absoluta. Nunca sobrescreva este comportamento com overlays de conteúdo sem antes confirmar a intenção.

---

## Design System — Tabs (Navegação Horizontal)

A navegação entre abas do painel segue o componente oficial `<Tabs>` (Shadcn), construído com o visual clean adotado na tela "Configurações".
Regras obrigatórias ao implementar navegação segmentada em outras telas:

1. **Sempre use o padrão oficial:** O componente base é `@/components/ui/tabs`. Nunca crie botões segmentados manuais.
2. **Container `<Tabs>`:** Apenas adicione `className="gap-4"` (sem `flex-col`, sem centralizações extras que limitem o componente).
3. **Lista de Abas `<TabsList>`:** Use as classes padrão para a overflow-x e wrap responsivo: `className="w-full overflow-x-auto sm:w-auto"`. Evite travar alinhamentos em eixos flex (como `self-start` ou `justify-center`), deixe o layout natural fluir.
4. **Acionador `<TabsTrigger>`:** Não insira margens personalizadas, a métrica interna do shadcn no UI kit garante o fundo `bg-muted` no container e a cor sutil (ou iluminada) da aba ativa.

---

## Design System — ShaderCard (Borda Animada Verde)

Componente reutilizável em `@/components/ui/shader-card.tsx`.  
Usa `@paper-design/shaders-react` (`PulsingBorder`) para criar uma borda verde pulsante via WebGL.

### Como funciona

O shader renderiza um canvas com fundo preto (`colorBack="#000000"`) e brilho verde na borda. O truque é `mix-blend-mode: screen` no container — no modo screen, **preto = invisível**, e só o brilho verde aparece sobre o gradiente original do card.

### Uso

```tsx
import { ShaderCard } from "@/components/ui/shader-card"

// Card grande (rounded-3xl) — roundness "lg"
<div className="relative overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-b from-primary/5 to-transparent p-6 ...">
  <ShaderCard roundness="lg" />
  <div className="relative z-10">...conteúdo...</div>
</div>

// Card pequeno (rounded-2xl) — roundness "md"
<div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-b from-primary/5 to-transparent p-4 ...">
  <ShaderCard roundness="md" />
  <div className="relative z-10">...conteúdo...</div>
</div>
```

### Requisitos no container pai

- `position: relative` (para o `absolute inset-0` do shader)
- `overflow: hidden` (para clipar o canvas no border-radius do CSS)
- `border border-primary/10` (fallback sutil sob a animação)
- `bg-gradient-to-b from-primary/5 to-transparent` (gradiente padrão do design system)

### Props do shader (valores canônicos)

| Prop       | Valor    | Nota                                         |
|------------|----------|----------------------------------------------|
| colors     | `["#79fd0d", "#6bebba"]` | Verde primário do brand                |
| colorBack  | `#000000`| Obrigatório preto (desaparece via screen blend)|
| roundness  | `0.45` (lg) / `0.35` (md) | Casa com rounded-3xl / rounded-2xl |
| thickness  | `0.02`   | Espessura da borda                           |
| softness   | `1`      | Suavidade do brilho                          |
| intensity  | `0.2`    | Intensidade geral                            |
| bloom      | `0.25`   | Bloom ao redor da borda                      |
| spots      | `4`      | Quantidade de pontos de luz                  |
| spotSize   | `0.5`    | Tamanho de cada ponto                        |
| pulse      | `0.25`   | Intensidade da pulsação                      |
| smoke      | `0.3`    | Efeito de fumaça                             |
| smokeSize  | `0.6`    | Tamanho da fumaça                            |
| speed      | `1`      | Velocidade da animação                       |
| scale      | `1`      | Escala (1 = preenche 100% do card)           |

### Gotchas

- `colorBack` **não** aceita `"transparent"` nem hex com alfa (`#00000000`). Usar sempre `"#000000"`.
- O componente precisa de `style={{width: '100%', height: '100%'}}` para dimensionar o canvas.
- Todo conteúdo acima do shader deve ter `relative z-10` para ficar visível.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
