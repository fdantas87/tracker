import { clarityHeatmapUrl, claritySessionRange } from "@/lib/clarity/deeplinks"
import { caminhoDaUrl, fmtDuracao, fmtInteiro, fmtPct } from "@/lib/clarity/format"
import type { LinhaClarity } from "@/lib/clarity/normalize"
import type { ClarityPanorama } from "@/lib/clarity/queries"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * Página vem primeiro: é a única quebra que leva a algum lugar — cada linha
 * abre o mapa de calor daquela página no Clarity. Os cards de atrito só
 * listam página QUANDO ela tem o sinal; é aqui que aparecem scroll e tempo
 * ativo das páginas com mais tráfego, tenham elas problema ou não.
 */
const ABAS = [
  { key: "url", label: "Página" },
  { key: "device", label: "Dispositivo" },
  { key: "channel", label: "Canal" },
  { key: "country", label: "País" },
] as const

/** Valor vazio = o Clarity não soube classificar (ex.: canal sem referência). */
function rotulo(chave: string): string {
  return chave || "(não informado)"
}

function Tabela({ linhas, linkDe }: { linhas: LinhaClarity[]; linkDe?: (chave: string) => string }) {
  if (linhas.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sem dado neste período.</p>
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            <TableHead className="text-right">Sessões</TableHead>
            <TableHead className="text-right">Págs/sessão</TableHead>
            <TableHead className="text-right">Scroll</TableHead>
            <TableHead className="text-right">Tempo ativo</TableHead>
            <TableHead className="text-right">Rage</TableHead>
            <TableHead className="text-right">Dead</TableHead>
            <TableHead className="text-right">Quick back</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={l.chave}>
              {linkDe ? (
                <TableCell className="max-w-[18rem]">
                  <a
                    href={linkDe(l.chave)}
                    target="_blank"
                    rel="noreferrer"
                    title={`${l.chave}\nAbrir o mapa de calor no Clarity`}
                    className="block truncate font-mono text-xs transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {caminhoDaUrl(l.chave)}
                  </a>
                </TableCell>
              ) : (
                <TableCell className="font-medium">{rotulo(l.chave)}</TableCell>
              )}
              <TableCell className="text-right font-mono tabular-nums">{fmtInteiro(l.sessoes)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {(l.paginasPorSessao ?? 0).toFixed(2).replace(".", ",")}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{fmtPct(l.scroll)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{fmtDuracao(l.tempoAtivo)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{fmtPct(l.atrito.rage)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{fmtPct(l.atrito.dead)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{fmtPct(l.atrito.quickback)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function ClarityBreakdown({
  quebras,
  projectId,
  dias,
}: {
  quebras: ClarityPanorama["quebras"]
  projectId: string
  dias: number
}) {
  const range = claritySessionRange(dias)
  const linkDaPagina = (url: string) => clarityHeatmapUrl(projectId, url, range)

  return (
    <Tabs defaultValue="url" className="gap-3">
      <TabsList className="w-full overflow-x-auto sm:w-auto">
        {ABAS.map((aba) => (
          <TabsTrigger key={aba.key} value={aba.key}>
            {aba.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {ABAS.map((aba) => (
        <TabsContent key={aba.key} value={aba.key}>
          <Tabela
            linhas={quebras[aba.key]}
            linkDe={aba.key === "url" ? linkDaPagina : undefined}
          />
        </TabsContent>
      ))}
    </Tabs>
  )
}
