/**
 * A matemática do mapa: onde enquadrar, e com quanto de zoom.
 *
 * Módulo puro, SEM `server-only`, porque roda nos dois lados — o enquadramento
 * inicial e o reenquadramento ao clicar num chip acontecem no cliente, que é
 * quem sabe o tamanho real do mapa na tela.
 *
 * A projeção é recriada aqui exatamente como o `<ComposableMap>` a cria
 * internamente (`geoEqualEarth` transladada para o centro do viewBox). Se as
 * duas divergirem, o enquadramento calculado aponta para outro lugar do que o
 * desenhado — por isso `escalaDoMapa()` é exportada e o componente do mapa a
 * usa em `projectionConfig`, em vez de cada lado escolher a sua.
 */

import { geoEqualEarth } from "d3-geo"

export type GeoPonto = {
  lat: number
  lng: number
  count: number
  country: string | null
  region: string | null
  city: string | null
}

export type Enquadramento = {
  /** [longitude, latitude] — a ordem que o react-simple-maps espera. */
  center: [number, number]
  zoom: number
}

/** Seleção vinda de um chip: o mapa destaca, e o enquadramento se ajusta. */
export type Destaque = { tipo: "pais" | "estado" | "cidade"; valor: string }

/**
 * Quanto da distribuição é descartado em cada ponta, por eixo.
 *
 * É ESTA constante que faz o mapa abrir onde a maior parte dos visitantes está.
 * A alternativa óbvia — centro e desvio-padrão — é sensível a outlier: um único
 * visitante em Portugal contra 29 no Brasil já alargaria a moldura até o
 * Atlântico, e o mapa abriria mostrando oceano em vez de gente. Cortando 5% em
 * cada ponta, o visitante isolado sai do cálculo e uma concentração de verdade
 * (20% num segundo país, digamos) continua dentro e alarga a moldura, que é o
 * comportamento certo nos dois casos.
 *
 * O ponto descartado continua desenhado no mapa — ele só não manda no
 * enquadramento inicial. Afastar o zoom mostra tudo.
 */
export const P_CAUDA = 0.05

/** Folga em volta da caixa, para os círculos da borda não colarem na moldura. */
export const MARGEM = 0.18

/**
 * Abertura mínima, em graus. Sem isto, um recorte com uma cidade só teria caixa
 * de tamanho zero e o zoom estouraria no teto, abrindo em nível de rua sobre um
 * mapa-múndi de baixa resolução — muita ampliação, nenhuma informação.
 */
export const EXTENSAO_MINIMA_GRAUS = 14

export const ZOOM_MIN = 1

/**
 * O mais fechado que o mapa chega, em graus de longitude visíveis.
 *
 * É um limite GEOGRÁFICO, e não um número de zoom fixo, e isso não é
 * preciosismo: o zoom aqui é um multiplicador sobre uma escala que já depende
 * do tamanho da tela. Num celular o mundo inteiro cabe em 360 px, então
 * enquadrar o Brasil exige um multiplicador MUITO maior do que num monitor —
 * medido, o mesmo recorte pedia 4,3 no desktop e 13,9 no celular. Com um teto
 * fixo (era 10), o celular batia no limite e o mapa abria mais afastado do que
 * o calculado, justamente na tela em que sobra menos espaço.
 *
 * 8° é mais fechado que a abertura mínima do enquadramento automático (14°), de
 * propósito: o automático nunca cola no teto, e ainda sobra margem para a
 * pessoa aproximar na mão.
 */
export const ABERTURA_MINIMA_GRAUS = 8

/** Sem dado nenhum: mundo inteiro, centrado. */
export const VISAO_MUNDO: Enquadramento = { center: [0, 0], zoom: 1 }

/**
 * Tamanho do mundo inteiro, em pixels, na escala padrão do d3 (177.158).
 * MEDIDO, não deduzido: projetando a malha de -180..180 × -85..85 com
 * `geoEqualEarth()` sem configurar nada, o resultado ocupa 959,0 × 464,1.
 */
const MUNDO_PADRAO = { largura: 959.0, altura: 464.1, escala: 177.158 }

/**
 * Escala da projeção para o mundo inteiro caber no viewBox com zoom 1.
 *
 * O react-simple-maps NÃO ajusta escala sozinho: sem isto ele usa a escala
 * padrão do d3, dimensionada para um viewport de 960×500, e num card mais
 * estreito o mapa nasce cortado nas laterais — afastar o zoom até o fim nunca
 * mostraria o mundo todo.
 */
export function escalaDoMapa(largura: number, altura: number): number {
  return (
    MUNDO_PADRAO.escala *
    Math.min(largura / MUNDO_PADRAO.largura, altura / MUNDO_PADRAO.altura)
  )
}

/**
 * Teto de zoom para este tamanho de tela — vale tanto para o enquadramento
 * automático quanto para o botão de aproximar. Os dois PRECISAM sair da mesma
 * conta: se o mapa aceitasse menos zoom do que o enquadramento calcula, o
 * d3-zoom cortaria a diferença e a moldura sairia mais aberta que o pedido.
 */
export function zoomMaximoDe(largura: number, altura: number): number {
  const larguraDoMundoPx =
    MUNDO_PADRAO.largura * (escalaDoMapa(largura, altura) / MUNDO_PADRAO.escala)

  if (larguraDoMundoPx <= 0) return ZOOM_MIN

  return Math.max(ZOOM_MIN, (360 * largura) / (larguraDoMundoPx * ABERTURA_MINIMA_GRAUS))
}

function projecaoDoMapa(largura: number, altura: number) {
  return geoEqualEarth()
    .translate([largura / 2, altura / 2])
    .scale(escalaDoMapa(largura, altura))
}

export function casaDestaque(ponto: GeoPonto, destaque: Destaque | null): boolean {
  if (!destaque) return true

  if (destaque.tipo === "pais") return ponto.country === destaque.valor
  if (destaque.tipo === "estado") return ponto.region === destaque.valor
  return ponto.city === destaque.valor
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), maximo)
}

/**
 * Quantil sobre uma distribuição já ordenada e ponderada pelo número de
 * visitantes de cada ponto — não pelo número de pontos. Uma capital com 500
 * visitantes tem que pesar 500, senão uma cidade com 1 visitante teria a mesma
 * influência sobre a moldura.
 */
function quantilPonderado(
  ordenados: { valor: number; peso: number }[],
  total: number,
  q: number
): number {
  const alvo = total * q
  let acumulado = 0

  for (const item of ordenados) {
    acumulado += item.peso
    if (acumulado >= alvo) return item.valor
  }

  return ordenados[ordenados.length - 1].valor
}

function abrirAteMinimo(min: number, max: number, minimo: number): [number, number] {
  const falta = minimo - (max - min)
  if (falta <= 0) return [min, max]

  const meio = (min + max) / 2
  return [meio - minimo / 2, meio + minimo / 2]
}

/**
 * A moldura inicial do mapa, a partir de onde os visitantes realmente estão.
 *
 * `largura`/`altura` são as do viewBox do mapa (que aqui é medido em pixels da
 * tela, 1:1), porque o zoom que cabe depende do formato do card: a mesma
 * distribuição precisa de menos zoom num card largo e baixo.
 *
 * Limitação consciente: a longitude é tratada como um eixo linear. Uma
 * distribuição que cruzasse o antimeridiano (±180°) — visitantes na Nova
 * Zelândia e no Havaí, digamos — seria enquadrada no lado errado do planeta.
 * Tratar isso direito exigiria estatística circular; não se paga para um
 * negócio de um país só, mas fica escrito em vez de virar surpresa.
 */
export function calcularEnquadramento(
  pontos: GeoPonto[],
  largura: number,
  altura: number
): Enquadramento {
  if (!pontos.length || largura <= 0 || altura <= 0) return VISAO_MUNDO

  const total = pontos.reduce((soma, p) => soma + p.count, 0)
  if (total <= 0) return VISAO_MUNDO

  const porLat = pontos
    .map((p) => ({ valor: p.lat, peso: p.count }))
    .sort((a, b) => a.valor - b.valor)
  const porLng = pontos
    .map((p) => ({ valor: p.lng, peso: p.count }))
    .sort((a, b) => a.valor - b.valor)

  let [latMin, latMax] = abrirAteMinimo(
    quantilPonderado(porLat, total, P_CAUDA),
    quantilPonderado(porLat, total, 1 - P_CAUDA),
    EXTENSAO_MINIMA_GRAUS
  )
  let [lngMin, lngMax] = abrirAteMinimo(
    quantilPonderado(porLng, total, P_CAUDA),
    quantilPonderado(porLng, total, 1 - P_CAUDA),
    EXTENSAO_MINIMA_GRAUS
  )

  latMin = limitar(latMin, -80, 80)
  latMax = limitar(latMax, -80, 80)
  lngMin = limitar(lngMin, -180, 180)
  lngMax = limitar(lngMax, -180, 180)

  // A caixa é projetada por amostragem, não pelos 4 cantos: na equal-earth os
  // meridianos são curvos, e usar só os cantos subestimaria a largura real.
  const projecao = projecaoDoMapa(largura, altura)
  const PASSOS = 8
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity

  for (let i = 0; i <= PASSOS; i++) {
    for (let j = 0; j <= PASSOS; j++) {
      const lng = lngMin + ((lngMax - lngMin) * i) / PASSOS
      const lat = latMin + ((latMax - latMin) * j) / PASSOS
      const projetado = projecao([lng, lat])
      if (!projetado) continue

      const [x, y] = projetado
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue

      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
  }

  if (!Number.isFinite(x0) || !Number.isFinite(y0)) return VISAO_MUNDO

  const larguraCaixa = Math.max(x1 - x0, 1) * (1 + MARGEM)
  const alturaCaixa = Math.max(y1 - y0, 1) * (1 + MARGEM)

  const zoom = limitar(
    Math.min(largura / larguraCaixa, altura / alturaCaixa),
    ZOOM_MIN,
    zoomMaximoDe(largura, altura)
  )

  const centro = projecao.invert?.([(x0 + x1) / 2, (y0 + y1) / 2])
  if (!centro || !Number.isFinite(centro[0]) || !Number.isFinite(centro[1])) {
    return { center: VISAO_MUNDO.center, zoom }
  }

  return { center: [centro[0], centro[1]], zoom }
}
