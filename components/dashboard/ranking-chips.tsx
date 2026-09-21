"use client"

import { cn } from "@/lib/utils"
import type { Ranking } from "@/lib/dashboard/geo"
import type { Destaque } from "@/lib/dashboard/geo-fit"

/**
 * Um grupo de chips de ranking — Países, Estados ou Cidades.
 *
 * O mesmo componente serve para contagem de visitantes e para faturamento: o
 * que muda é o `formatar` e o fato de os chips de visitante serem clicáveis
 * (eles reenquadram o mapa) enquanto os de faturamento são só leitura —
 * `purchases` não guarda latitude nem longitude, então não há para onde
 * apontar o mapa a partir deles.
 *
 * A barrinha de fundo é proporcional ao maior do grupo. Ela existe porque uma
 * lista de números soltos obriga a comparar de cabeça; com a barra, a
 * proporção entre o primeiro e o quinto se lê sem ler número nenhum.
 */
export function RankingChips({
  titulo,
  ranking,
  formatar,
  tipo,
  destaque,
  onSelecionar,
}: {
  titulo: string
  ranking: Ranking
  formatar: (valor: number) => string
  /** Presente só quando os chips reenquadram o mapa. */
  tipo?: Destaque["tipo"]
  destaque?: Destaque | null
  onSelecionar?: (destaque: Destaque) => void
}) {
  const baseItens = ranking.itens.slice(0, 5)
  const itens = [...baseItens]

  while (itens.length < 5) {
    itens.push({ chave: `vazio-${itens.length}`, label: "-", valor: 0 })
  }

  const maior = itens[0]?.valor ?? 0
  const restantes = Math.max(0, ranking.distintos - baseItens.length)

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-1.5 transition-colors">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-[9px] font-bold uppercase tracking-tighter text-muted-foreground sm:text-[10px]">
          {titulo}
        </h3>
        {restantes > 0 ? (
          <span className="text-[9px] text-muted-foreground">
            + {restantes.toLocaleString("pt-BR")}
          </span>
        ) : null}
      </header>

      <div className="flex flex-col gap-1 w-full">
        {itens.map((item) => {
          const isVazio = item.label === "-"
          const selecionado =
            !isVazio && Boolean(tipo) && destaque?.tipo === tipo && destaque?.valor === item.chave
          const proporcao = maior > 0 && !isVazio ? Math.max((item.valor / maior) * 100, 2) : 0

          const conteudo = (
            <>
              {proporcao > 0 ? (
                <span
                  className="absolute inset-y-0 left-0 bg-primary/12 transition-all"
                  style={{ width: `${proporcao}%` }}
                  aria-hidden
                />
              ) : null}
              <span className={cn("relative min-w-0 truncate font-medium", isVazio && "text-muted-foreground")}>
                {item.label}
              </span>
              <span
                className={cn(
                  "relative ml-auto font-mono font-semibold tabular-nums",
                  isVazio && "text-muted-foreground"
                )}
              >
                {isVazio ? "-" : formatar(item.valor)}
              </span>
            </>
          )

          const classe = cn(
            "relative flex items-center gap-1.5 overflow-hidden rounded-md px-1.5 py-0.5 text-[10px] leading-tight transition-colors",
            selecionado
              ? "bg-primary/20 text-primary ring-1 ring-primary/30"
              : isVazio
                ? "opacity-50"
                : "hover:bg-muted/30"
          )

          if (!tipo || !onSelecionar || isVazio) {
            return (
              <div key={item.chave} className={classe}>
                {conteudo}
              </div>
            )
          }

          return (
            <button
              key={item.chave}
              type="button"
              onClick={() => onSelecionar({ tipo, valor: item.chave })}
              aria-pressed={selecionado}
              className={cn(
                classe,
                "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              )}
            >
              {conteudo}
            </button>
          )
        })}
      </div>
    </section>
  )
}
