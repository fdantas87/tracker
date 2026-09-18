/**
 * Leitor grosseiro de `user_agent`, só para a ficha do lead mostrar SO,
 * dispositivo e navegador em três badges — não é um parser forense.
 *
 * Sem dependência nova de propósito: não existe `ua-parser-js` (nem similar)
 * em `package.json`, e a mesma postura do projeto que já recusou Redis,
 * `@vercel/functions` e geoip externo (ver CLAUDE.md) vale aqui — um punhado
 * de `includes()` resolve o suficiente para uma coluna de painel.
 *
 * Sem `server-only`: string pura, reaproveitável por um Client Component
 * (a tabela/ficha de leads) sem puxar nada do lado do servidor.
 */

export type DeviceInfo = {
  os: "Windows" | "macOS" | "iOS" | "Android" | "Linux" | "Outro"
  deviceType: "Desktop" | "Mobile" | "Tablet"
  browser: "Chrome" | "Safari" | "Firefox" | "Edge" | "Outro"
}

/**
 * A ORDEM das checagens importa: Edge e Chrome incluem "Safari" na string por
 * herança do WebKit, e a maioria dos Android inclui "Linux". Checar do mais
 * específico para o mais genérico evita falso positivo.
 */
export function parseUserAgent(ua: string | null): DeviceInfo | null {
  if (!ua) return null

  const iOS = /iPhone|iPad|iPod/.test(ua)
  const android = /Android/.test(ua)

  const os: DeviceInfo["os"] = iOS
    ? "iOS"
    : android
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Macintosh|Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Outro"

  // iPad moderno não traz "Mobile" na string — só "Macintosh" com touch, mas
  // isso já caiu em iOS acima via outro caminho quando ainda se identifica
  // como iPad; Android sem "Mobile" é o sinal confiável de tablet.
  const tablet = /iPad/.test(ua) || (android && !/Mobile/.test(ua))
  const deviceType: DeviceInfo["deviceType"] = tablet
    ? "Tablet"
    : iOS || (android && /Mobile/.test(ua))
      ? "Mobile"
      : "Desktop"

  const browser: DeviceInfo["browser"] = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Outro"

  return { os, deviceType, browser }
}
