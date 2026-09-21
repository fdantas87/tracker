/**
 * O pacote `anychart` publica os tipos como um NAMESPACE GLOBAL
 * (`declare namespace anychart` em `dist/index.d.ts`), e não como módulo. Sem
 * esta ponte, `import anychart from "anychart"` falha com
 * "File '…/anychart/dist/index.d.ts' is not a module" (TS2306) e o
 * `next build` inteiro para no type check, mesmo com o código compilando.
 *
 * `export =` do próprio namespace é o padrão clássico para isso: ele leva junto
 * os tipos aninhados, então `anychart.charts.Pie` continua valendo como tipo no
 * mesmo arquivo em que `anychart.pie3d(...)` vale como valor.
 */
declare module "anychart" {
  export = anychart
}
