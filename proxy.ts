import type { NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/proxy"

/**
 * No Next.js 16 o antigo `middleware.ts` passou a se chamar `proxy.ts`
 * (mesma funcionalidade, só o nome do arquivo e do export mudaram). Roda no
 * runtime Node.js por padrão.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  /**
   * Roda em tudo, menos:
   * - /api/*  → endpoints públicos de captura e webhook (fases 5 a 7). Eles
   *   não têm sessão, são de alto volume e não podem ser redirecionados pro
   *   login; rodar o refresh neles seria só latência à toa.
   * - assets estáticos do Next e arquivos de imagem.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
