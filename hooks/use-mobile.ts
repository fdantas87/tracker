import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Versão do hook do shadcn reescrita com `useSyncExternalStore`.
 *
 * O original usava `useEffect` + `setState`, que o lint do React 19 acusa
 * (`react-hooks/set-state-in-effect`) e que causa um render extra a cada
 * montagem. Um media query é exatamente o caso de uso de "store externa":
 * assinar, ler o valor atual e ter um valor definido no servidor.
 *
 * Se você rodar `npx shadcn@latest add sidebar` de novo com --overwrite,
 * este arquivo volta pra versão com useEffect e o lint quebra. Reaplique
 * esta versão.
 */

let mediaQueryList: MediaQueryList | null = null

function getMediaQueryList() {
  if (!mediaQueryList) {
    mediaQueryList = window.matchMedia(MEDIA_QUERY)
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

/** No servidor não há viewport: assume desktop, igual ao comportamento antigo. */
function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
