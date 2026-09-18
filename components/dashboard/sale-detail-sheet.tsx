"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowRight, Loader2 } from "lucide-react"

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
import { PaymentMethodBadge } from "@/components/dashboard/payment-method-badge"
import { PurchaseStatusBadge } from "@/components/dashboard/purchase-status-badge"
import { carregarVenda } from "@/app/(dashboard)/vendas/actions"
import {
  formatarCompleto,
  formatarHoraNoFuso,
  formatarMoeda,
} from "@/lib/dashboard/format"
import type { VendaDetail } from "@/lib/dashboard/vendas"

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

const TRACO = <span className="text-muted-foreground">—</span>

function Transacao({ venda }: { venda: VendaDetail }) {
  return (
    <Secao titulo="A venda">
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {venda.productName ?? "Produto sem nome"}
          </p>
          <p className="text-xs text-muted-foreground">{venda.platform}</p>
        </div>
        <span className="shrink-0 font-mono text-lg font-semibold tabular-nums">
          {formatarMoeda(venda.amount, venda.currency)}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <PurchaseStatusBadge status={venda.status} />
        <PaymentMethodBadge metodo={venda.paymentMethod} />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <Campo titulo="Transação">
          <span className="font-mono break-all">{venda.transactionId}</span>
        </Campo>
        <Campo titulo="Status na plataforma">
          {venda.platformStatus ? (
            <span className="font-mono">{venda.platformStatus}</span>
          ) : (
            TRACO
          )}
        </Campo>

        {/* `created_at` é o instante do PRIMEIRO webhook desta transação, não
            o do pagamento: para boleto e Pix, o primeiro webhook é o da
            geração. Por isso "Registrada em" e não "Hora da compra" — e por
            isso `updated_at` aparece ao lado, que é quando o último status
            chegou (a aprovação, no caso feliz). */}
        <Campo titulo="Registrada em">{formatarCompleto(venda.createdAt)}</Campo>
        <Campo titulo="Última atualização">{formatarCompleto(venda.updatedAt)}</Campo>

        {venda.platformPaymentMethod ? (
          <Campo titulo="Pagamento (bruto)">
            <span className="font-mono">{venda.platformPaymentMethod}</span>
          </Campo>
        ) : null}
        {venda.productId ? (
          <Campo titulo="ID do produto">
            <span className="font-mono">{venda.productId}</span>
          </Campo>
        ) : null}
        {venda.metaEventId ? (
          <Campo titulo="Event ID (Meta)">
            <span className="font-mono break-all">{venda.metaEventId}</span>
          </Campo>
        ) : null}
      </dl>
    </Secao>
  )
}

function Comprador({ venda }: { venda: VendaDetail }) {
  const { comprador } = venda
  const vazio = !comprador.nome && !comprador.email && !comprador.telefone

  return (
    <Secao titulo="O comprador">
      {vazio ? (
        <p className="text-xs text-muted-foreground">
          A plataforma não repassou nome, e-mail nem telefone nesta transação.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <Campo titulo="Nome">{comprador.nome ?? TRACO}</Campo>
          <Campo titulo="E-mail">{comprador.email ?? TRACO}</Campo>
          <Campo titulo="Telefone">{comprador.telefone ?? TRACO}</Campo>
        </dl>
      )}
    </Secao>
  )
}

/**
 * A origem da venda: o que veio no próprio webhook, e o que veio da visita.
 *
 * As duas podem divergir — a UTM da compra é a do link de checkout, a do
 * visitante é a da primeira visita. Mostrar as duas é o que permite ver quando
 * a atribuição se perdeu no meio do caminho.
 */
function Origem({ venda }: { venda: VendaDetail }) {
  const { utm } = venda
  const vazio = !utm.source && !utm.medium && !utm.campaign && !utm.term && !utm.content

  return (
    <Secao titulo="Origem da venda">
      {vazio ? (
        <p className="text-xs text-muted-foreground">
          Nenhum parâmetro UTM chegou no webhook desta compra.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <Campo titulo="Source">{utm.source ?? TRACO}</Campo>
          <Campo titulo="Medium">{utm.medium ?? TRACO}</Campo>
          <Campo titulo="Campaign">{utm.campaign ?? TRACO}</Campo>
          <Campo titulo="Term">{utm.term ?? TRACO}</Campo>
          <Campo titulo="Content">{utm.content ?? TRACO}</Campo>
        </dl>
      )}
    </Secao>
  )
}

const METODO_LABEL: Record<string, string> = {
  trck_user_id: "pelo ID do checkout (vínculo direto)",
  email: "pelo e-mail",
  phone: "pelo telefone",
  none: "nenhum",
}

function Visitante({ venda }: { venda: VendaDetail }) {
  const { visitante } = venda

  if (!visitante) {
    return (
      <Secao titulo="O cliente no tracking">
        <p className="text-xs text-muted-foreground">
          Esta venda não foi vinculada a nenhum visitante. É um estado esperado, não
          uma falha: a compra é sempre registrada, mesmo quando não dá para saber de
          qual visita ela veio — perder a venda por falta de atribuição seria bem
          pior do que registrá-la sem ela.
        </p>
      </Secao>
    )
  }

  const lugar = [visitante.geo.city, visitante.geo.region, visitante.geo.country]
    .filter(Boolean)
    .join(", ")

  const horaLocal = formatarHoraNoFuso(venda.createdAt, visitante.geo.timezone)

  return (
    <Secao titulo="O cliente no tracking">
      <p className="text-xs text-muted-foreground">
        Casado {METODO_LABEL[venda.matchMethod ?? "none"] ?? venda.matchMethod}.
      </p>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <Campo titulo="E-mail do visitante">{visitante.email ?? TRACO}</Campo>
        <Campo titulo="Primeira visita">{formatarCompleto(visitante.createdAt)}</Campo>
        <Campo titulo="Identificado em">
          {visitante.identifiedAt ? formatarCompleto(visitante.identifiedAt) : (
            <span className="text-muted-foreground">Ainda anônimo</span>
          )}
        </Campo>
        <Campo titulo="Local">{lugar || TRACO}</Campo>
        <Campo titulo="CEP (aproximado)">{visitante.geo.postalCode ?? TRACO}</Campo>
        <Campo titulo="IP">{visitante.geo.ip ?? TRACO}</Campo>
        {horaLocal ? (
          <Campo titulo="Hora local do cliente">
            {horaLocal.horario}{" "}
            <span className="text-muted-foreground">{horaLocal.fuso}</span>
          </Campo>
        ) : null}
        <Campo titulo="Origem da visita">{visitante.utm.source ?? "direto"}</Campo>
        {visitante.utm.campaign ? (
          <Campo titulo="Campanha da visita">{visitante.utm.campaign}</Campo>
        ) : null}
      </dl>

      {visitante.device ? (
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{visitante.device.os}</Badge>
          <Badge variant="outline">{visitante.device.deviceType}</Badge>
          <Badge variant="outline">{visitante.device.browser}</Badge>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 pt-1">
        <Link
          href={`/leads?q=${encodeURIComponent(visitante.trckUserId)}`}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          Ver a ficha completa deste lead
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
        <Link
          href={`/eventos?q=${encodeURIComponent(visitante.trckUserId)}`}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          Ver os eventos desta visita
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Secao>
  )
}

function OutrasCompras({ venda }: { venda: VendaDetail }) {
  if (!venda.visitante) return null

  return (
    <Secao titulo="Outras compras deste cliente">
      {venda.outrasCompras.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Esta é a única compra vinculada a este cliente.
        </p>
      ) : (
        <div className="space-y-2">
          {venda.outrasCompras.map((compra) => (
            <div
              key={compra.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-xs"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {compra.productName ?? "Produto sem nome"}
                </p>
                <p className="text-muted-foreground">
                  {formatarCompleto(compra.createdAt)}
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
        </div>
      )}

      <p className="pt-1 text-xs text-muted-foreground">
        Total aprovado do cliente ·{" "}
        <span className="font-mono tabular-nums">
          {formatarMoeda(venda.totalCliente.aprovado, venda.currency)}
        </span>{" "}
        em {venda.totalCliente.compras}{" "}
        {venda.totalCliente.compras === 1 ? "compra" : "compras"}
      </p>
    </Secao>
  )
}

/**
 * O gatilho é a própria linha da tabela, passada como `children` — o desenho
 * pedido não tem botão "ver" em cada linha, a linha inteira é clicável.
 *
 * Carrega na abertura, e uma vez só: mesmo motivo de `lead-detail-sheet.tsx` e
 * `event-detail-dialog.tsx` — o lint do React 19 recusa setState dentro de
 * efeito, então quem dispara a carga é o `onOpenChange`, não um `useEffect`.
 */
export function SaleDetailSheet({
  vendaId,
  titulo,
  children,
}: {
  vendaId: string
  titulo: string
  children: ReactNode
}) {
  const [detalhe, setDetalhe] = useState<VendaDetail | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function abrir(aberto: boolean) {
    if (!aberto || detalhe || carregando) return

    setCarregando(true)
    setErro(null)
    try {
      const dados = await carregarVenda(vendaId)
      setDetalhe(dados)
      if (!dados) setErro("Venda não encontrada.")
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a venda.")
    } finally {
      setCarregando(false)
    }
  }

  return (
    <Sheet onOpenChange={abrir}>
      <SheetTrigger asChild>{children}</SheetTrigger>

      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-base break-all">{titulo}</SheetTitle>
          <SheetDescription>
            {detalhe
              ? `Registrada em ${formatarCompleto(detalhe.createdAt)}`
              : "Detalhes da venda e do cliente."}
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
              <Transacao venda={detalhe} />
              <Separator />
              <Comprador venda={detalhe} />
              <Separator />
              <Origem venda={detalhe} />
              <Separator />
              <Visitante venda={detalhe} />
              <Separator />
              <OutrasCompras venda={detalhe} />
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
