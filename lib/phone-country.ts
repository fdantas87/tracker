/**
 * País de fallback para normalização de telefone, por deploy.
 *
 * Usado onde não há moeda de compra para derivar o país de
 * `obterPaisDaMoeda` (lib/webhooks/adapters/index.ts) — o caso central é
 * `/api/identify`, que roda antes de qualquer compra existir. Mesmo padrão de
 * `TRACKING_ALLOWED_ORIGINS`/`NEXT_PUBLIC_APP_NAME`: uma env var por cliente,
 * resolvida uma vez no cold start. Trocar o valor na Vercel só vale depois de
 * um novo deploy.
 */

export const DEFAULT_PHONE_COUNTRY = resolveDefaultPhoneCountry()

function resolveDefaultPhoneCountry(): string {
  const raw = process.env.TRACKING_DEFAULT_PHONE_COUNTRY?.trim().toUpperCase()
  if (!raw) return "BR"

  if (!/^[A-Z]{2}$/.test(raw)) {
    console.warn(
      `[phone-country] TRACKING_DEFAULT_PHONE_COUNTRY inválida ("${raw}"): ` +
        'use um ISO-2 (ex. "US"). Caindo para "BR".'
    )
    return "BR"
  }

  return raw
}
