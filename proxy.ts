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
   * - arquivos estáticos, por extensão.
   *
   * ATENÇÃO AO `js` NA LISTA: sem ele, o `/track.js` cai na guarda de sessão e
   * é redirecionado pro /login com 307. O script de captura simplesmente não
   * carrega em site nenhum, e nada no painel indica problema — a captura só
   * para de existir, em silêncio. Aconteceu em produção. Qualquer arquivo novo
   * servido de `public/` precisa ter a extensão listada aqui.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:js|mjs|css|map|svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|woff|woff2|ttf)$).*)",
  ],
}
