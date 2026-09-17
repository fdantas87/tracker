import { createServiceClient } from "@/lib/supabase/service"
import { jsonResponse, preflightResponse } from "@/lib/cors"

/**
 * GET /api/config/public
 *
 * Devolve só os IDs PÚBLICOS dos destinos ativos, pro track.js saber qual
 * gtag e qual pixel carregar no navegador sem nada hardcoded.
 *
 * O que sai daqui é público por natureza: measurement ID e pixel ID aparecem
 * no HTML de qualquer site que use GA4 ou Pixel. Os segredos (api_secret,
 * capi_token) NUNCA passam por este endpoint — eles vivem cifrados no Vault e
 * só são lidos no servidor, no instante do disparo.
 */

export async function OPTIONS(request: Request) {
  return preflightResponse(request)
}

export async function GET(request: Request) {
  try {
    const supabase = createServiceClient()

    const [pixels, ga4] = await Promise.all([
      supabase.from("meta_pixels").select("pixel_id").eq("is_active", true),
      supabase
        .from("ga4_accounts")
        .select("measurement_id")
        .eq("is_active", true),
    ])

    if (pixels.error || ga4.error) {
      return jsonResponse(request, { error: "config_unavailable" }, 503)
    }

    return jsonResponse(
      request,
      {
        pixels: (pixels.data ?? []).map((row) => row.pixel_id),
        ga4: (ga4.data ?? []).map((row) => row.measurement_id),
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
