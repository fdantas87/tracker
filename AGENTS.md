# Git Scope Rule — tracking.negou.net

Este projeto vive dentro de um monorepo (`D:/Obsidian/Projetos/Negou`).
A raiz do `.git` está em `D:/Obsidian/Projetos/Negou`, **não** nesta pasta.

## Regra obrigatória para operações git

Sempre que o usuário estiver com o workspace aberto em `apps/tracking.negou.net`
e ordenar qualquer operação git (`add`, `commit`, `push`, `pull`, `status`, etc.),
a IA DEVE escopar a operação **exclusivamente** a esta pasta:

```bash
# Sempre rodar a partir da raiz do repo
cd D:/Obsidian/Projetos/Negou

# add: somente arquivos do tracking
git add apps/tracking.negou.net/

# commit: mensagem focada no tracking
git commit -m "..."

# push/pull: normal (afeta só o que foi staged)
git push
git pull
```

**Nunca** usar `git add .` ou `git add -A` quando o workspace ativo for
`apps/tracking.negou.net` — isso arrastaria arquivos de outros projetos do
monorepo.

Se o usuário abrir o workspace raiz (`D:/Obsidian/Projetos/Negou`),
aí sim as operações git valem para o repositório completo.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
