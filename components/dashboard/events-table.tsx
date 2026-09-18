import { MousePointerClick, ServerCog } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DispatchStatusBadge } from "@/components/dashboard/dispatch-status-badge"
import { EventDetailDialog } from "@/components/dashboard/event-detail-dialog"
import { formatarCompleto, formatarDataHora, faltaPara } from "@/lib/dashboard/format"
import type { EventRow } from "@/lib/dashboard/events"

function Vazio({ filtrado }: { filtrado: boolean }) {
  return (
    <div className="glass flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl p-8 text-center">
      <p className="text-sm font-medium">
        {filtrado ? "Nenhum evento com esses filtros" : "Nenhum evento capturado ainda"}
      </p>
      <p className="max-w-md text-sm text-muted-foreground">
        {filtrado
          ? "Tente ampliar o período ou limpar os filtros."
          : "Assim que alguém visitar um site com o track.js instalado, o PageView aparece aqui — inclusive enquanto espera na fila."}
      </p>
    </div>
  )
}

function Local({ evento }: { evento: EventRow }) {
  const partes = [evento.geoCity, evento.geoRegion ?? evento.geoCountry].filter(Boolean)
  if (!partes.length) return <span className="text-muted-foreground">—</span>
  return <span className="whitespace-nowrap">{partes.join(", ")}</span>
}

function Origem({ evento }: { evento: EventRow }) {
  if (!evento.utmSource) {
    return <span className="text-muted-foreground">direto</span>
  }

  return (
    <span className="flex flex-col">
      <span>{evento.utmSource}</span>
      {evento.utmCampaign ? (
        <span className="truncate text-xs text-muted-foreground">{evento.utmCampaign}</span>
      ) : null}
    </span>
  )
}

/** Diz, numa olhada, por que aquele evento foi imediato ou ficou esperando. */
function CaminhoBadge({ pixelFired }: { pixelFired: boolean }) {
  const Icone = pixelFired ? MousePointerClick : ServerCog

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Icone
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-label={pixelFired ? "Pixel e CAPI" : "Só CAPI"}
        />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {pixelFired
          ? "O pixel do navegador também disparou este evento, então a CAPI foi imediata — não havia PII nova a esperar."
          : "Visitante anônimo: o pixel foi suprimido e só a CAPI envia, depois da janela. É isso que permite o evento sair enriquecido."}
      </TooltipContent>
    </Tooltip>
  )
}

export function EventsTable({
  rows,
  filtrado,
  agora,
}: {
  rows: EventRow[]
  filtrado: boolean
  /** Instante da consulta, vindo de `listEvents` — ver a nota lá sobre pureza. */
  agora: number
}) {
  if (!rows.length) return <Vazio filtrado={filtrado} />

  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Quando</TableHead>
            <TableHead>Evento</TableHead>
            <TableHead>Visitante</TableHead>
            <TableHead>Disparo</TableHead>
            <TableHead className="hidden lg:table-cell">Origem</TableHead>
            <TableHead className="hidden xl:table-cell">Local</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((evento) => {
            const espera =
              evento.dispatchStatus === "pending"
                ? faltaPara(evento.dispatchAfter, agora)
                : null

            return (
              <TableRow key={evento.id}>
                <TableCell
                  className="font-mono text-xs whitespace-nowrap tabular-nums"
                  title={formatarCompleto(evento.eventTime)}
                >
                  {formatarDataHora(evento.eventTime)}
                </TableCell>

                <TableCell>
                  <span className="flex items-center gap-1.5 font-medium whitespace-nowrap">
                    {evento.eventName}
                    <CaminhoBadge pixelFired={evento.pixelFired} />
                  </span>
                </TableCell>

                <TableCell className="max-w-[16rem]">
                  {evento.visitorEmail ? (
                    <span className="block truncate text-sm">{evento.visitorEmail}</span>
                  ) : (
                    <span
                      className="block truncate font-mono text-xs text-muted-foreground"
                      title={evento.trckUserId ?? undefined}
                    >
                      {evento.trckUserId ? `${evento.trckUserId.slice(0, 12)}…` : "—"}
                    </span>
                  )}
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <DispatchStatusBadge status={evento.dispatchStatus} />
                      {evento.dispatchAttempts > 1 ? (
                        <span
                          className="font-mono text-xs text-muted-foreground tabular-nums"
                          title={`${evento.dispatchAttempts} tentativas`}
                        >
                          ×{evento.dispatchAttempts}
                        </span>
                      ) : null}
                    </span>

                    {espera ? (
                      <span className="text-xs text-muted-foreground">sai {espera}</span>
                    ) : null}

                    {evento.dispatchError ? (
                      <span
                        className="line-clamp-2 max-w-[22rem] text-xs text-destructive"
                        title={evento.dispatchError}
                      >
                        {evento.dispatchError}
                      </span>
                    ) : null}
                  </div>
                </TableCell>

                <TableCell className="hidden max-w-[12rem] text-sm lg:table-cell">
                  <Origem evento={evento} />
                </TableCell>

                <TableCell className="hidden text-sm xl:table-cell">
                  <Local evento={evento} />
                </TableCell>

                <TableCell className="text-right">
                  <EventDetailDialog id={evento.id} eventName={evento.eventName} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
