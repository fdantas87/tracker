import { createServiceClient } from "@/lib/supabase/service"
import { jsonResponse, preflightResponse } from "@/lib/cors"
import { getClarityProjectId } from "@/lib/settings/clarity-config"
import { getDispatchConfig } from "@/lib/settings/dispatch-config"

/**
 * GET /api/config/public
 *
 * Devolve só os IDs PÚBLICOS dos destinos ativos, pro track.js saber qual
 * gtag e qual pixel carregar no navegador sem nada hardcoded. Desde a fase 7.5
 * devolve também o modo de disparo, que é o que diz ao script se ele deve ou
 * não chamar `fbq('track')`.
 *
 * O que sai daqui é público por natureza: measurement ID e pixel ID aparecem
 * no HTML de qualquer site que use GA4 ou Pixel. Os segredos (api_secret,
 * capi_token) NUNCA passam por este endpoint — eles vivem cifrados no Vault e
 * só são lidos no servidor, no instante do disparo.
 *
 * NADA POR VISITANTE PODE ENTRAR AQUI. Esta resposta sai com
 * `Cache-Control: public`, então um CDN serviria o valor de um visitante pra
 * todos os outros. É por isso que o `identified` (que decide o disparo do
 * pixel no modo adaptativo) viaja na resposta do /api/identify, que é
 * `no-store`, e não neste endpoint.
 *
 * O tamanho da janela de atraso também não sai daqui: o navegador não tem uso
 * pra ele (a decisão que ele precisa é só disparar ou não o pixel), e publicar
 * a janela exata seria dar de graça a única parte não óbvia da estratégia.
 */

export async function OPTIONS(request: Request) {
  return preflightResponse(request)
}

export async function GET(request: Request) {
  try {
    const supabase = createServiceClient()

    const [pixels, ga4, dispatch, clarity] = await Promise.all([
      supabase.from("meta_pixels").select("pixel_id").eq("is_active", true),
      supabase
        .from("ga4_accounts")
        .select("measurement_id")
        .eq("is_active", true),
      getDispatchConfig(),
      // Nunca lança: sem a migration do Clarity, é só "Clarity desligado".
      getClarityProjectId(),
    ])

    if (pixels.error || ga4.error) {
      return jsonResponse(request, { error: "config_unavailable" }, 503)
    }

    return jsonResponse(
      request,
      {
        pixels: (pixels.data ?? []).map((row) => row.pixel_id),
        ga4: (ga4.data ?? []).map((row) => row.measurement_id),
        dispatch: {
          mode: dispatch.mode,
          never_delay: dispatch.immediateEvents,
        },
        forms: { capture: dispatch.formCaptureEnabled },
        // Público como o pixel ID: aparece no <script> de qualquer site com
        // Clarity. O token da Data Export API nunca passa por aqui.
        clarity,
      },
      200,
      {
        // Config muda raramente; cache curto tira a maior parte da carga sem
        // atrasar demais a propagação de uma mudança no painel.
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      }
    )
  } catch {
    return jsonResponse(request, { error: "config_unavailable" }, 503)
  }
}
