import "server-only"

/**
 * Leitura completa de um recorte, para toda agregação do painel.
 *
 * O PostgREST do Supabase devolve no máximo 1.000 linhas por requisição, então
 * `.limit(20_000)` sozinho NÃO traz 20 mil: traz mil, em silêncio — e o card
 * passa a mostrar "1.000" enquanto a tabela, que usa `count: "exact"`, diz 1.621.
 * Regra do painel: **contar é `count: "exact", head: true`; somar/agrupar é
 * `lerTudo()`**. Nunca `.limit(N)` para agregar.
 *
 * A consulta de cada chamador PRECISA ter `.order()` numa coluna única: paginar
 * sem ordem estável repete e pula linhas entre páginas.
 */

export const TAMANHO_PAGINA = 1_000

/** Rede de segurança contra uma leitura sem fim; a tela avisa quando bate. */
export const TETO_AGREGACAO = 100_000

/** Páginas buscadas em paralelo. */
const LOTE = 5

type Pagina = { data: unknown; error: { message: string } | null }

export async function lerTudo<T>(
  buscar: (de: number, ate: number) => PromiseLike<Pagina>
): Promise<{ linhas: T[]; truncado: boolean; error: string | null }> {
  const linhas: T[] = []

  for (let de = 0; de < TETO_AGREGACAO; de += TAMANHO_PAGINA * LOTE) {
    const paginas = await Promise.all(
      Array.from({ length: LOTE }, (_, i) =>
        buscar(de + i * TAMANHO_PAGINA, de + (i + 1) * TAMANHO_PAGINA - 1)
      )
    )

    let acabou = false
    for (const { data, error } of paginas) {
      if (error) return { linhas: [], truncado: false, error: error.message }
      const pagina = (data ?? []) as T[]
      linhas.push(...pagina)
      if (pagina.length < TAMANHO_PAGINA) acabou = true
    }
    if (acabou) return { linhas, truncado: false, error: null }
  }

  return { linhas, truncado: true, error: null }
}
