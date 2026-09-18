"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowRight, Loader2, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { PurchaseStatusBadge } from "@/components/dashboard/purchase-status-badge"
import { carregarFicha } from "@/app/(dashboard)/leads/actions"
import { formatarCompleto, formatarHoraNoFuso, formatarMoeda } from "@/lib/dashboard/format"
import type { LeadDetail } from "@/lib/dashboard/leads"

function Campo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{titulo}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{titulo}</h3>
      {children}
    </section>
  )
}

/** Mesmo padrão do modal de Eventos: só aparece quando difere do fuso do painel. */
function HoraLocal({ iso, fuso }: { iso: string; fuso: string | null }) {
  const hora = formatarHoraNoFuso(iso, fuso)
  if (!hora) return null

  return (
    <Campo titulo="Hora local do visitante">
      {hora.horario} <span className="text-muted-foreground">{hora.fuso}</span>
    </Campo>
  )
}

function DadosPessoais({ detalhe }: { detalhe: LeadDetail }) {
  return (
    <Secao titulo="Dados pessoais">
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <Campo titulo="E-mail">
          {detalhe.email ?? <span className="text-muted-foreground">—</span>}
        </Campo>
        <Campo titulo="Identificado em">
          {detalhe.identifiedAt ? (
            formatarCompleto(detalhe.identifiedAt)
          ) : (
            <span className="text-muted-foreground">Ainda anônimo</span>
          )}
        </Campo>

        {detalhe.name ? (
          <>
            <Campo titulo="Nome">
              {[detalhe.name.first, detalhe.name.last].filter(Boolean).join(" ") || "—"}
            </Campo>
            <Campo titulo="Telefone">
              {detalhe.phone ?? <span className="text-muted-foreground">—</span>}
            </Campo>
          </>
        ) : (
          <div className="col-span-2">
            <dt className="text-muted-foreground">Nome / telefone</dt>
            <dd className="text-muted-foreground">
              Não recuperável — só existe o hash (irreversível), usado para a Conversions
              API. Vira texto legível aqui se este lead comprar: o webhook grava o dado da
              compra em texto puro.
            </dd>
          </div>
        )}
      </dl>
    </Secao>
  )
}

function Geolocalizacao({ detalhe }: { detalhe: LeadDetail }) {
  const lugar = [detalhe.geo.city, detalhe.geo.region].filter(Boolean).join(", ")
  const texto = [lugar, detalhe.geo.country].filter(Boolean).join(" · ")

  return (
    <Secao titulo="Geolocalização">
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <Campo titulo="Local">
          {texto || <span className="text-muted-foreground">—</span>}
        </Campo>
        <Campo titulo="CEP (aproximado)">
          {detalhe.geo.postalCode ?? <span className="text-muted-foreground">—</span>}
        </Campo>
        {detalhe.geo.latitude !== null && detalhe.geo.longitude !== null ? (
          <Campo titulo="Coordenadas">
            {detalhe.geo.latitude}, {detalhe.geo.longitude}
          </Campo>
        ) : null}
        <Campo titulo="IP">
          {detalhe.geo.ip ?? <span className="text-muted-foreground">—</span>}
        </Campo>
        <HoraLocal iso={detalhe.createdAt} fuso={detalhe.geo.timezone} />
      </dl>
    </Secao>
  )
}

function OrigemUtm({ detalhe }: { detalhe: LeadDetail }) {
  const { utm } = detalhe
  const vazio = !utm.source && !utm.medium && !utm.campaign && !utm.term && !utm.content

  return (
    <Secao titulo="Origem / UTM">
      {vazio ? (
        <p className="text-xs text-muted-foreground">
          Tráfego direto — nenhum parâmetro UTM na primeira visita.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <Campo titulo="Source">{utm.source ?? "—"}</Campo>
          <Campo titulo="Medium">{utm.medium ?? "—"}</Campo>
          <Campo titulo="Campaign">{utm.campaign ?? "—"}</Campo>
          <Campo titulo="Term">{utm.term ?? "—"}</Campo>
          <Campo titulo="Content">{utm.content ?? "—"}</Campo>
          {utm.referrer ? <Campo titulo="Referrer">{utm.referrer}</Campo> : null}
        </dl>
      )}
    </Secao>
  )
}

function Dispositivo({ detalhe }: { detalhe: LeadDetail }) {
  if (!detalhe.device) {
    return (
      <Secao titulo="Dispositivo">
        <p className="text-xs text-muted-foreground">Nenhum user agent registrado.</p>
      </Secao>
    )
  }

  return (
    <Secao titulo="Dispositivo">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">{detalhe.device.os}</Badge>
        <Badge variant="outline">{detalhe.device.deviceType}</Badge>
        <Badge variant="outline">{detalhe.device.browser}</Badge>
      </div>
    </Secao>
  )
}

function Compras({ detalhe }: { detalhe: LeadDetail }) {
  return (
    <Secao titulo="Compras">
      {detalhe.purchases.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma compra vinculada a este lead.</p>
      ) : (
        <div className="space-y-2">
          {detalhe.purchases.map((compra) => (
            <div
              key={compra.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-xs"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{compra.productName ?? "Produto sem nome"}</p>
                <p className="text-muted-foreground">
                  {formatarCompleto(compra.createdAt)} · {compra.platform}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono tabular-nums">
                  {formatarMoeda(compra.amount, compra.currency)}
                </span>
                <PurchaseStatusBadge status={compra.status} />
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="text-muted-foreground">
              Valor aprovado · {formatarMoeda(detalhe.totals.approvedValue, detalhe.totals.currency)}
            </span>
            <span className="font-medium">
              LTV {formatarMoeda(detalhe.totals.lifetimeValue, detalhe.totals.currency)}
            </span>
          </div>
        </div>
      )}
    </Secao>
  )
}

export function LeadDetailSheet({ trckUserId, label }: { trckUserId: string; label: string }) {
  const [detalhe, setDetalhe] = useState<LeadDetail | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function abrir(aberto: boolean) {
    // Carrega na abertura, e uma vez só — mesmo motivo de `event-detail-dialog.tsx`:
    // o lint do React 19 recusa setState dentro de efeito.
    if (!aberto || detalhe || carregando) return

    setCarregando(true)
    setErro(null)
    try {
      setDetalhe(await carregarFicha(trckUserId))
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a ficha.")
    } finally {
      setCarregando(false)
    }
  }

  return (
    <Sheet onOpenChange={abrir}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Ver ficha de ${label}`}>
          <UserRound className="size-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Ficha</span>
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-mono text-base break-all">{label}</SheetTitle>
          <SheetDescription>
            {detalhe ? `Visitante desde ${formatarCompleto(detalhe.createdAt)}` : "Ficha completa do lead."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          {carregando ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Carregando…
            </div>
          ) : erro ? (
            <p className="py-8 text-sm text-destructive">{erro}</p>
          ) : detalhe ? (
            <>
              <DadosPessoais detalhe={detalhe} />
              <Separator />
              <Geolocalizacao detalhe={detalhe} />
              <Separator />
              <OrigemUtm detalhe={detalhe} />
              <Separator />
              <Dispositivo detalhe={detalhe} />
              <Separator />
              <Compras detalhe={detalhe} />

              <Link
                href={`/eventos?q=${encodeURIComponent(detalhe.trckUserId)}`}
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                Ver eventos deste visitante
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
