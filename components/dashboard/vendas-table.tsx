"use client"

import type { KeyboardEvent } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PaymentMethodBadge } from "@/components/dashboard/payment-method-badge"
import { PurchaseStatusBadge } from "@/components/dashboard/purchase-status-badge"
import { SaleDetailSheet } from "@/components/dashboard/sale-detail-sheet"
import { formatarCompleto, formatarDataHora, formatarMoeda } from "@/lib/dashboard/format"
import type { VendaRow } from "@/lib/dashboard/vendas"

function Vazio({ filtrado }: { filtrado: boolean }) {
  if (!filtrado) return null

  return (
    <div className="glass flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl p-8 text-center">
      <p className="text-sm font-medium">Nenhuma venda com esses filtros</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Tente ampliar o período ou limpar os filtros.
      </p>
    </div>
  )
}

function Comprador({ venda }: { venda: VendaRow }) {
  if (venda.comprador) {
    return (
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm">{venda.comprador}</span>
        {venda.email ? (
          <span className="truncate text-xs text-muted-foreground">{venda.email}</span>
        ) : null}
      </span>
    )
  }

  if (venda.email) {
    return <span className="block truncate text-sm">{venda.email}</span>
  }

  return (
    <span className="font-mono text-xs text-muted-foreground" title={venda.transactionId}>
      {venda.transactionId.slice(0, 16)}…
    </span>
  )
}

/**
 * A linha inteira abre o detalhe. Como `<tr>` não é focável nem ativável por
 * teclado por padrão — e o `SheetTrigger` do Radix só instala o `onClick` —
 * a linha recebe `tabIndex`, `role="button"` e o tratamento de Enter/Espaço.
 * Sem isso a tela ficaria inalcançável para quem navega por teclado.
 */
function ativarComTeclado(evento: KeyboardEvent<HTMLTableRowElement>) {
  if (evento.key !== "Enter" && evento.key !== " ") return
  evento.preventDefault()
  evento.currentTarget.click()
}

/**
 * Abaixo de `md` a tabela vira lista: 5 colunas não cabem em 360px, e scroll
 * horizontal numa tela de consulta rápida esconde justamente valor e status.
 * Pagamento e produto ficam para o painel de detalhe, que abre igual.
 */
function VendasLista({ rows }: { rows: VendaRow[] }) {
  return (
    <ul className="glass divide-y overflow-hidden rounded-2xl md:hidden">
      {rows.map((venda) => {
        const titulo = venda.comprador ?? venda.email ?? venda.transactionId
        return (
          <li key={venda.id}>
            <SaleDetailSheet vendaId={venda.id} titulo={titulo}>
              <button
                type="button"
                aria-label={`Ver detalhes da venda de ${titulo}`}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1">
                  <span className="block min-w-0">
                    <Comprador venda={venda} />
                  </span>
                  <span
                    className="mt-0.5 block font-mono text-xs text-muted-foreground tabular-nums"
                    title={formatarCompleto(venda.createdAt)}
                  >
                    {formatarDataHora(venda.createdAt)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-sm whitespace-nowrap tabular-nums">
                    {formatarMoeda(venda.amount, venda.currency)}
                  </span>
                  <PurchaseStatusBadge status={venda.status} />
                </span>
              </button>
            </SaleDetailSheet>
          </li>
        )
      })}
    </ul>
  )
}

export function VendasTable({ rows, filtrado }: { rows: VendaRow[]; filtrado: boolean }) {
  if (!rows.length) return <Vazio filtrado={filtrado} />

  return (
    <>
      <VendasLista rows={rows} />
      <div className="glass hidden overflow-x-auto rounded-2xl md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Comprador</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="hidden sm:table-cell">Pagamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Registrada em</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((venda) => (
              <SaleDetailSheet
                key={venda.id}
                vendaId={venda.id}
                titulo={venda.comprador ?? venda.email ?? venda.transactionId}
              >
                <TableRow
                  role="button"
                  tabIndex={0}
                  onKeyDown={ativarComTeclado}
                  aria-label={`Ver detalhes da venda de ${
                    venda.comprador ?? venda.email ?? venda.transactionId
                  }`}
                  className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <TableCell className="max-w-[14rem]">
                    <Comprador venda={venda} />
                  </TableCell>

                  <TableCell className="max-w-[14rem]">
                    <span className="block truncate text-sm">
                      {venda.productName ?? (
                        <span className="text-muted-foreground">Produto sem nome</span>
                      )}
                    </span>
                  </TableCell>

                  <TableCell className="text-right font-mono text-sm whitespace-nowrap tabular-nums">
                    {formatarMoeda(venda.amount, venda.currency)}
                  </TableCell>

                  <TableCell className="hidden sm:table-cell">
                    <PaymentMethodBadge metodo={venda.paymentMethod} />
                  </TableCell>

                  <TableCell>
                    <PurchaseStatusBadge status={venda.status} />
                  </TableCell>

                  {/* "Registrada em", não "hora da compra": para boleto e Pix
                      este é o instante do primeiro webhook, o da geração. */}
                  <TableCell
                    className="font-mono text-xs whitespace-nowrap tabular-nums"
                    title={formatarCompleto(venda.createdAt)}
                  >
                    {formatarDataHora(venda.createdAt)}
                  </TableCell>
                </TableRow>
              </SaleDetailSheet>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
