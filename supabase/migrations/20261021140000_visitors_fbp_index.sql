-- Costura de identidade (lib/dispatch/visitor-stitch.ts): o /api/identify
-- procura, pelo `_fbp`, o mesmo navegador gravado com outro trck_user_id.
-- `ga_client_id` já tem índice desde a fase 2; o `fbp` não tinha.
-- Aditiva: sem ela a costura funciona igual, só com uma varredura mais lenta.
create index if not exists visitors_fbp_idx on public.visitors (fbp);
