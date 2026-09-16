import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { supabaseAnonKey, supabaseUrl } from "./env"

/** Rotas que podem ser abertas sem sessão. */
const PUBLIC_ROUTES = ["/login"]

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}

/**
 * Renova a sessão do Supabase a cada requisição e faz a guarda otimista das
 * rotas do painel.
 *
 * Importante (documentação do @supabase/ssr): não colocar nenhuma lógica
 * entre `createServerClient()` e `getUser()`, e chamar `getUser()` antes de
 * gerar a resposta — se o refresh terminar depois que a resposta já saiu, a
 * sessão nova se perde e o usuário cai em loop de refresh/logout aleatório.
 *
 * Isto é uma checagem OTIMISTA. A documentação do Next.js é explícita que o
 * proxy não deve ser a única barreira de autorização, então o layout do
 * painel confere `getUser()` de novo antes de renderizar qualquer coisa.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })

        response = NextResponse.next({ request })

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })

        // Resposta que grava cookie de sessão NUNCA pode ser cacheada por CDN
        // ou proxy reverso — senão o token de um usuário acaba servido para
        // outro. A própria lib entrega os headers corretos aqui.
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value)
        })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !isPublicRoute(pathname)) {
    return redirectTo("/login", request, response)
  }

  if (user && isPublicRoute(pathname)) {
    return redirectTo("/", request, response)
  }

  return response
}

/**
 * Redireciona preservando os cookies que o refresh de sessão acabou de gravar
 * — se a gente devolvesse um `NextResponse.redirect()` limpo, a sessão
 * renovada seria descartada e o usuário seria deslogado na próxima navegação.
 */
function redirectTo(
  pathname: string,
  request: NextRequest,
  current: NextResponse
) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ""

  const redirectResponse = NextResponse.redirect(url)

  current.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie)
  })
  redirectResponse.headers.set("Cache-Control", "private, no-store")

  return redirectResponse
}
