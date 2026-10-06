import { clarityHeatmapUrl, claritySessionRange } from "@/lib/clarity/deeplinks"
import { caminhoDaUrl, fmtInteiro, fmtPct } from "@/lib/clarity/format"
import type { PaginaTopSinal } from "@/lib/clarity/queries"

/**
 * As páginas que mais pesam num sinal de atrito, para ficar embaixo do card
 * dele. A ordem é por sessões afetadas (ver `topPorSinal` em queries.ts); o
 * número exibido é o % da própria página, que é o que se compara com o card.
 * Cada linha abre o mapa de calor daquela página no Clarity.
 */
export function TopPaginasSinal({
  paginas,
  projectId,
  dias,
}: {
  paginas: PaginaTopSinal[]
  projectId: string
  dias: number
}) {
  const range = claritySessionRange(dias)

  if (paginas.length === 0) {
    return (
      <p className="border-t pt-3 text-center text-xs text-muted-foreground">
        Nenhuma página com esse sinal.
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-1.5 border-t pt-3 text-left">
      {paginas.map((p, i) => (
        <li key={p.url}>
          <a
            href={clarityHeatmapUrl(projectId, p.url, range)}
            target="_blank"
            rel="noreferrer"
            title={`${p.url}\n≈ ${fmtInteiro(p.afetadas)} de ${fmtInteiro(p.sessoes)} sessões`}
            className="flex items-center gap-2 rounded-md text-xs transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="w-3 shrink-0 font-mono tabular-nums text-muted-foreground/70">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-mono">{caminhoDaUrl(p.url)}</span>
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{fmtPct(p.pct)}</span>
          </a>
        </li>
      ))}
    </ol>
  )
}
