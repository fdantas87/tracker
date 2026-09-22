-- Allowlist de CORS editável no painel (Configurações → Geral).
--
-- Soma-se à variável TRACKING_ALLOWED_ORIGINS, não a substitui: allowlist
-- final = variável ∪ esta coluna. A variável continua sendo a rede de
-- segurança, e mudar esta coluna vale em até 60s, sem deploy novo.
--
-- Sem CHECK, como dispatch_immediate_events: o formato (só esquema + host,
-- sem caminho nem barra final) é validado na Server Action que grava.
--
-- Esquecer de rodar esta migration NÃO derruba a captura: a leitura cai no
-- fallback de lista vazia e a variável segue valendo. Só o botão de salvar
-- do painel falha até ela ser aplicada.

alter table public.settings
  add column if not exists allowed_origins text[] not null default '{}';
