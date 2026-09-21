"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import type { GeoJsonObject } from "geojson"
import { Locate, Minus, Plus } from "lucide-react"
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Sphere,
  ZoomableGroup,
  useZoomPanContext,
} from "react-simple-maps"
import mundo from "world-atlas/countries-110m.json"

import { cn } from "@/lib/utils"
import { nomeDoPais } from "@/lib/dashboard/geo-filters"
import {
  casaDestaque,
  escalaDoMapa,
  zoomMaximoDe,
  ZOOM_MIN,
  type Destaque,
  type Enquadramento,
  type GeoPonto,
} from "@/lib/dashboard/geo-fit"

/**
 * O mapa. Carregado só no cliente (ver `world-map.tsx`), porque ele depende de
 * medir o próprio tamanho para projetar — um HTML renderizado no servidor, sem
 * dimensão nenhuma, nasceria com o enquadramento errado.
 *
 * É um componente CONTROLADO: quem guarda a vista (centro e zoom) é o
 * `geo-view.tsx`, que também é quem ouve os chips. Foi assim que o clique num
 * chip virou "reenquadrar o mapa" sem estado duplicado nem efeito de
 * sincronização — o tipo de `useEffect` + `setState` que o lint do React 19
 * recusa (`react-hooks/set-state-in-effect`), e que já mordeu este projeto em
 * `hooks/use-mobile.ts` e no widget de gráfico da tela de Eventos.
 */

const RAIO_MIN = 3.5
const RAIO_MAX = 15
const PASSO_ZOOM = 1.6

/** Área proporcional ao número de visitantes — por isso a raiz, não o valor. */
function raioDe(count: number, maximo: number): number {
  if (maximo <= 0) return RAIO_MIN
  return RAIO_MIN + (RAIO_MAX - RAIO_MIN) * Math.sqrt(count / maximo)
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), maximo)
}

export function descricaoDoPonto(ponto: GeoPonto): string {
  const partes = [
    ponto.city,
    ponto.region,
    ponto.country ? nomeDoPais(ponto.country) : null,
  ].filter(Boolean)

  return partes.length ? partes.join(" · ") : "Local não identificado"
}

type Tamanho = { largura: number; altura: number }

type DicaAberta = { ponto: GeoPonto; x: number; y: number }

/**
 * Os círculos.
 *
 * Mora num componente separado para poder ler o zoom AO VIVO
 * (`useZoomPanContext`) e dividir o raio por ele. Sem isso o círculo é ampliado
 * junto com o mapa e, com zoom 8, uma cidade vira uma bolha do tamanho do
 * estado — muita tinta, nenhuma informação a mais.
 */
function Marcadores({
  pontos,
  destaque,
  maximo,
  aoApontar,
  aoSair,
}: {
  pontos: GeoPonto[]
  destaque: Destaque | null
  maximo: number
  aoApontar: (ponto: GeoPonto, evento: React.MouseEvent) => void
  aoSair: () => void
}) {
  const { k } = useZoomPanContext()

  return (
    <>
      {pontos.map((ponto) => {
        const emFoco = casaDestaque(ponto, destaque)

        return (
          <Marker
            key={`${ponto.lat},${ponto.lng}`}
            coordinates={[ponto.lng, ponto.lat]}
            onMouseEnter={(evento) => aoApontar(ponto, evento)}
            onMouseMove={(evento) => aoApontar(ponto, evento)}
            onMouseLeave={aoSair}
            role="img"
            aria-label={`${descricaoDoPonto(ponto)}: ${ponto.count.toLocaleString("pt-BR")} ${
              ponto.count === 1 ? "visitante" : "visitantes"
            }`}
            className="cursor-pointer"
          >
            <circle
              r={raioDe(ponto.count, maximo) / k}
              fill="var(--primary)"
              fillOpacity={emFoco ? 0.45 : 0.08}
              stroke="var(--primary)"
              strokeOpacity={emFoco ? 0.95 : 0.2}
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
            />
          </Marker>
        )
      })}
    </>
  )
}

export type WorldMapProps = {
  pontos: GeoPonto[]
  destaque: Destaque | null
  tamanho: Tamanho | null
  vista: Enquadramento | null
  onMedida: (largura: number, altura: number) => void
  onVista: (vista: Enquadramento) => void
  onReenquadrar: () => void
}

export default function WorldMapImpl({
  pontos,
  destaque,
  tamanho,
  vista,
  onMedida,
  onVista,
  onReenquadrar,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dica, setDica] = useState<DicaAberta | null>(null)

  /**
   * Ref callback em vez de `useEffect`: a medição precisa acontecer quando o
   * nó existe, e o `ResizeObserver` avisa sozinho a partir daí. `setState`
   * dentro do callback do observer é evento, não efeito — que é justamente o
   * que mantém este arquivo fora do lint que proíbe efeito que só copia estado.
   */
  const medir = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return

      containerRef.current = node

      const observer = new ResizeObserver(([entrada]) => {
        const { width, height } = entrada.contentRect
        if (width < 1 || height < 1) return
        onMedida(Math.round(width), Math.round(height))
      })

      observer.observe(node)

      return () => {
        observer.disconnect()
        containerRef.current = null
      }
    },
    [onMedida]
  )

  const maximo = useMemo(
    () => pontos.reduce((maior, p) => Math.max(maior, p.count), 0),
    [pontos]
  )

  const aoApontar = useCallback((ponto: GeoPonto, evento: React.MouseEvent) => {
    const caixa = containerRef.current?.getBoundingClientRect()
    if (!caixa) return

    setDica({
      ponto,
      x: evento.clientX - caixa.left,
      y: evento.clientY - caixa.top,
    })
  }, [])

  const aoSair = useCallback(() => setDica(null), [])

  const escala = tamanho ? escalaDoMapa(tamanho.largura, tamanho.altura) : undefined
  const zoomMaximo = tamanho ? zoomMaximoDe(tamanho.largura, tamanho.altura) : ZOOM_MIN

  function ajustarZoom(fator: number) {
    if (!vista) return
    onVista({
      center: vista.center,
      zoom: limitar(vista.zoom * fator, ZOOM_MIN, zoomMaximo),
    })
  }

  return (
    <div
      ref={medir}
      className="relative size-full overflow-hidden rounded-2xl"
      onMouseLeave={aoSair}
    >
      {tamanho && vista && escala ? (
        <ComposableMap
          width={tamanho.largura}
          height={tamanho.altura}
          projection="geoEqualEarth"
          projectionConfig={{ scale: escala }}
          className="size-full"
        >
          <ZoomableGroup
            center={vista.center}
            zoom={vista.zoom}
            minZoom={ZOOM_MIN}
            maxZoom={zoomMaximo}
            onMoveEnd={({ coordinates, zoom }) => {
              if (!coordinates || zoom === undefined) return
              onVista({ center: [coordinates[0], coordinates[1]], zoom })
            }}
          >
            <Sphere
              id="oceano"
              fill="var(--muted)"
              fillOpacity={0.25}
              stroke="var(--border)"
              strokeWidth={0.5}
            />

            {/* A terra não recebe ponteiro: sem isso ela roubaria o hover dos
                círculos. O arrasto continua funcionando, porque quem escuta é
                o retângulo transparente que o ZoomableGroup põe por baixo. */}
            <Geographies geography={mundo as unknown as GeoJsonObject}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="var(--muted)"
                    stroke="var(--border)"
                    strokeWidth={0.5}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                ))
              }
            </Geographies>

            <Marcadores
              pontos={pontos}
              destaque={destaque}
              maximo={maximo}
              aoApontar={aoApontar}
              aoSair={aoSair}
            />
          </ZoomableGroup>
        </ComposableMap>
      ) : null}

      {pontos.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            Nenhum visitante com localização neste período.
          </p>
        </div>
      ) : null}

      {dica ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-lg border bg-popover/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-sm"
          style={{ left: dica.x, top: dica.y }}
        >
          <p className="font-medium">{descricaoDoPonto(dica.ponto)}</p>
          <p className="font-mono tabular-nums text-muted-foreground">
            {dica.ponto.count.toLocaleString("pt-BR")}{" "}
            {dica.ponto.count === 1 ? "visitante" : "visitantes"}
          </p>
        </div>
      ) : null}

      <div className="absolute right-3 bottom-3 flex flex-col gap-1">
        <BotaoMapa rotulo="Aproximar" onClick={() => ajustarZoom(PASSO_ZOOM)}>
          <Plus className="size-4" />
        </BotaoMapa>
        <BotaoMapa rotulo="Afastar" onClick={() => ajustarZoom(1 / PASSO_ZOOM)}>
          <Minus className="size-4" />
        </BotaoMapa>
        <BotaoMapa rotulo="Reenquadrar" onClick={onReenquadrar}>
          <Locate className="size-4" />
        </BotaoMapa>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-muted-foreground">
        O tamanho do círculo é o número de visitantes
      </p>
    </div>
  )
}

function BotaoMapa({
  rotulo,
  onClick,
  children,
}: {
  rotulo: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={rotulo}
      aria-label={rotulo}
      className={cn(
        "glass flex size-8 items-center justify-center rounded-lg border text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      )}
    >
      {children}
    </button>
  )
}
