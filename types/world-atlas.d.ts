/**
 * O mapa-múndi vem do pacote `world-atlas` como TopoJSON (105 KB), e é DADO —
 * não tipo. Sem esta declaração o `resolveJsonModule` faz o TypeScript inferir
 * o literal inteiro (milhares de coordenadas) a cada checagem, sem nenhum ganho:
 * o `<Geographies>` só precisa saber que aquilo é um Topology.
 *
 * É a versão de baixa resolução (110m) de propósito: a de 50m tem ~5x o tamanho
 * e a diferença não aparece num mapa de painel. Fica embutida no bundle em vez
 * de ser buscada de um CDN em runtime, pelo mesmo motivo que o rate limit mora
 * no Postgres em vez de num Redis novo — menos coisa fora do nosso controle.
 */
declare module "world-atlas/countries-110m.json" {
  import type { Topology } from "topojson-specification"

  const topologia: Topology
  export default topologia
}
