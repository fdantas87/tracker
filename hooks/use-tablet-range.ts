import * as React from "react"

const TABLET_RANGE_QUERY = "(min-width: 768px) and (max-width: 1023px)"

/**
 * Hook para detectar se a viewport está na faixa "tablet retrato/paisagem estreita"
 * (768px–1023px), usada para decidir se o sidebar deve nascer colapsado por padrão
 * na primeira visita.
 *
 * Segue o mesmo padrão que `hooks/use-mobile.ts`: `useSyncExternalStore` com
 * `matchMedia`, nunca `useEffect` + `setState`. O lint do React 19
 * (`react-hooks/set-state-in-effect`) já foi uma dor de cabeça aqui; não repita
 * o padrão.
 *
 * `getServerSnapshot()` retorna `false` (assume "fora da faixa tablet" no SSR),
 * o mesmo trade-off já aceito em `use-mobile.ts:38`. É aceitável porque o
 * ajuste de auto-colapso roda só uma vez no mount do cliente, sem efeitos
 * colaterais visíveis.
 */

let mediaQueryList: MediaQueryList | null = null

function getMediaQueryList() {
  if (!mediaQueryList) {
    mediaQueryList = window.matchMedia(TABLET_RANGE_QUERY)
  }
  return mediaQueryList
}

function subscribe(onChange: () => void) {
  const mql = getMediaQueryList()
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot() {
  return getMediaQueryList().matches
}

function getServerSnapshot() {
  return false
}

export function useIsTabletRange() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
