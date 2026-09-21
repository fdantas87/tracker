import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { LeadDetailSheet } from "@/components/dashboard/lead-detail-sheet"
import { formatarCompleto, formatarDataHora, formatarMoeda } from "@/lib/dashboard/format"
import type { LeadRow } from "@/lib/dashboard/leads"

function Vazio({ filtrado }: { filtrado: boolean }) {
  return (
    <div className="glass flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl p-8 text-center">
      <p className="text-sm font-medium">
        {filtrado ? "Nenhum lead com esses filtros" : "Nenhum visitante capturado ainda"}
      </p>
      <p className="max-w-md text-sm text-muted-foreground">
        {filtrado
          ? "Tente ampliar o período ou limpar os filtros."
          : "Assim que alguém visitar um site com o track.js instalado, o visitante aparece aqui — identificado ou não."}
      </p>
    </div>
  )
}

function Identificador({ lead }: { lead: LeadRow }) {
  if (lead.email) {
    return <span className="block truncate text-sm">{lead.email}</span>
  }
  return (
    <span
      className="block truncate font-mono text-xs text-muted-foreground"
      title={lead.trckUserId}
    >
      {lead.trckUserId.slice(0, 16)}…
    </span>
  )
}

function Origem({ lead }: { lead: LeadRow }) {
  if (!lead.utmSource) {
    return <span className="text-muted-foreground">direto</span>
  }
  return (
    <span className="flex flex-col">
      <span>{lead.utmSource}</span>
      {lead.utmCampaign ? (
        <span className="truncate text-xs text-muted-foreground">{lead.utmCampaign}</span>
      ) : null}
    </span>
  )
}

function Local({ lead }: { lead: LeadRow }) {
  const partes = [lead.geoCity, lead.geoRegion ?? lead.geoCountry].filter(Boolean)
  if (!partes.length) return <span className="text-muted-foreground">—</span>
  return <span className="whitespace-nowrap">{partes.join(", ")}</span>
}

function Compras({ lead }: { lead: LeadRow }) {
  if (!lead.totalCompras) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex flex-col">
      <span className="font-mono text-sm tabular-nums">
        {formatarMoeda(lead.valorAprovado, "BRL")}
      </span>
      <span className="text-xs text-muted-foreground">
        {lead.totalCompras} {lead.totalCompras === 1 ? "compra" : "compras"}
      </span>
    </span>
  )
}

export function LeadsTable({ rows, filtrado }: { rows: LeadRow[]; filtrado: boolean }) {
  if (!rows.length) return <Vazio filtrado={filtrado} />

  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Lead</TableHead>
            <TableHead className="hidden lg:table-cell">Origem</TableHead>
            <TableHead className="hidden xl:table-cell">Local</TableHead>
            <TableHead>Visitas</TableHead>
            <TableHead>Páginas</TableHead>
            <TableHead>Cadastros</TableHead>
            <TableHead>Compras</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((lead) => (
            <TableRow key={lead.trckUserId}>
              <TableCell className="max-w-[16rem]">
                <Identificador lead={lead} />
              </TableCell>

              <TableCell className="hidden max-w-[12rem] text-sm lg:table-cell">
                <Origem lead={lead} />
              </TableCell>

              <TableCell className="hidden text-sm xl:table-cell">
                <Local lead={lead} />
              </TableCell>

              <TableCell className="font-mono tabular-nums text-sm">
                {lead.totalVisitas.toLocaleString("pt-BR")}
              </TableCell>

              <TableCell className="font-mono tabular-nums text-sm">
                {lead.totalPaginas.toLocaleString("pt-BR")}
              </TableCell>

              <TableCell className="font-mono tabular-nums text-sm">
                {lead.totalCadastros.toLocaleString("pt-BR")}
              </TableCell>

              <TableCell>
                <Compras lead={lead} />
              </TableCell>

              <TableCell
                className="font-mono text-xs whitespace-nowrap tabular-nums"
                title={formatarCompleto(lead.createdAt)}
              >
                {formatarDataHora(lead.createdAt)}
              </TableCell>

              <TableCell className="text-right">
                <LeadDetailSheet
                  trckUserId={lead.trckUserId}
                  label={lead.email ?? lead.trckUserId}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
