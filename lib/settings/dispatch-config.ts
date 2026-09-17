import "server-only"

import { createServiceClient } from "@/lib/supabase/service"
import {
  DEFAULT_DISPATCH_CONFIG,
  isDispatchMode,
  type DispatchConfig,
} from "./dispatch-modes"

/**
 * Leitura da configuração de disparo (fase 7.5).
 *
 * Isto é consultado em TODO evento capturado, que é o caminho mais quente do
 * sistema. Uma ida ao banco por pageview seria desperdício puro: a
 * configuração muda uma vez por mês, no painel. Por isso o valor fica
 * memorizado por 60s no módulo.
 *
 * O memo é por instância da função serverless, então uma mudança no painel
 * demora no máximo 60s pra valer em todas — mesmo raciocínio (e mesma janela)
 * do Cache-Control de /api/config/public.
 */

let cached: { value: DispatchConfig; expiresAt: number } | null = null

const TTL_MS = 60_000

export async function getDispatchConfig(): Promise<DispatchConfig> {
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.value

  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from("settings")
      .select(
        "dispatch_mode, dispatch_delay_seconds, dispatch_immediate_events, form_capture_enabled, default_phone_country, test_event_code"
      )
      .eq("id", true)
      .maybeSingle()

    const value: DispatchConfig = data
      ? {
          mode: isDispatchMode(data.dispatch_mode)
            ? data.dispatch_mode
            : DEFAULT_DISPATCH_CONFIG.mode,
          delaySeconds: Number(data.dispatch_delay_seconds ?? 0),
          immediateEvents: Array.isArray(data.dispatch_immediate_events)
            ? (data.dispatch_immediate_events as string[])
            : [],
          formCaptureEnabled: Boolean(data.form_capture_enabled),
          defaultPhoneCountry: String(data.default_phone_country ?? "55"),
          testEventCode: data.test_event_code ?? null,
        }
      : DEFAULT_DISPATCH_CONFIG

    cached = { value, expiresAt: now + TTL_MS }
    return value
  } catch {
    // Falha de leitura não pode derrubar a captura. Sem configuração, o
    // comportamento seguro é o de antes desta fase: disparar na hora.
    return DEFAULT_DISPATCH_CONFIG
  }
}

/** Usado pelas Server Actions depois de salvar, pra não esperar o TTL. */
export function invalidateDispatchConfig(): void {
  cached = null
}

/**
 * Daqui a quanto tempo este evento deve ir pro Meta.
 *
 * No modo `adaptive`, `pixelFired` manda: se o navegador já disparou o fbq,
 * atrasar a CAPI garantiria a perda do evento enriquecido, porque o Meta
 * descarta o que chega depois. Então o envio é imediato e os dois chegam
 * juntos, como sempre foi.
 *
 * O `hybrid` é a exceção proposital: ali o atraso vale MESMO com o pixel
 * disparado, porque o modo existe justamente pra medir se o Meta prefere o
 * evento mais rico quando os dois "diferem significativamente" — caso que a
 * doc não cobre. É experimento, não é o padrão.
 */
export function resolveDispatchDelayMs(
  config: DispatchConfig,
  eventName: string,
  pixelFired: boolean
): number {
  if (config.delaySeconds <= 0) return 0
  if (config.immediateEvents.includes(eventName)) return 0
  if (config.mode === "hybrid") return config.delaySeconds * 1000
  if (pixelFired) return 0
  return config.delaySeconds * 1000
}
