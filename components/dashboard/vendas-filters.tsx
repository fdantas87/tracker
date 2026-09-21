"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Filter, Loader2, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  PAGAMENTO_LABELS,
  PAGAMENTO_NAO_INFORMADO,
  PAGAMENTO_VALORES,
  PERIODOS,
  PERIODO_PADRAO,
  type PagamentoFiltro,
  type PeriodoKey,
} from "@/lib/dashboard/vendas-filters"
import type { PaymentMethod, PurchaseStatus } from "@/lib/webhooks/adapters/types"

/**
 * Filtros da tela de Vendas.
 *
 * Duas diferenças conscientes em relação a Eventos e Leads, que usam uma barra
 * sempre visível:
 *
 * 1. O recorte de período fica FORA do popover. É o controle que muda o
 *    significado de todos os números da tela, e escondê-lo atrás de um clique
 *    deixaria o usuário lendo "R$ 12.400" sem ver de que janela ele fala.
 * 2. O resto (status, forma de pagamento, busca) vive atrás do botão
 *    "Filtros", como no desenho pedido.
 *
 * O que NÃO muda: os filtros continuam na URL, não em estado de React — link
 * compartilhável, botão voltar funcionando, página ainda renderizada no
 * servidor, zero useEffect de busca.
 */

const TODOS = "__todos__"

const STATUS_LABELS: Record<PurchaseStatus, string> = {
  approved: "Aprovada",
  pending: "Pendente",
  refunded: "Reembolsada",
  chargeback: "Chargeback",
  canceled: "Cancelada",
  expired: "Expirada",
}

function rotuloPagamento(valor: PagamentoFiltro): string {
  return valor === "nao_informado"
    ? PAGAMENTO_NAO_INFORMADO
    : PAGAMENTO_LABELS[valor as PaymentMethod]
}

export function VendasFilters({
  periodo,
  status,
  pagamento,
  q,
}: {
  periodo: PeriodoKey
  status?: PurchaseStatus
  pagamento?: PagamentoFiltro
  q?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendente, startTransition] = useTransition()

  function navegar(mudancas: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())

    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor === null || valor === "") params.delete(chave)
      else params.set(chave, valor)
    }

    // Qualquer mudança de filtro reinicia a paginação.
    params.delete("pagina")

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  // O período não conta como "filtro aplicado" para o contador do botão: ele
  // está sempre visível ali do lado, então marcá-lo como escondido seria mentir.
  const ativos = [status, pagamento, q].filter(Boolean).length

  return (
    <div className="glass -mt-2 mb-2 flex flex-col items-center rounded-xl p-1.5 sm:-mt-4 sm:flex-row">
      <Select
        value={status ?? TODOS}
        onValueChange={(v) => navegar({ status: v === TODOS ? null : v })}
      >
        <SelectTrigger className="h-8 w-full sm:w-[160px] border-none bg-transparent shadow-none text-xs focus:ring-0">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS} className="text-xs">Todos os status</SelectItem>
          {(Object.keys(STATUS_LABELS) as PurchaseStatus[]).map((valor) => (
            <SelectItem key={valor} value={valor} className="text-xs">
              {STATUS_LABELS[valor]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="hidden sm:block h-4 w-px shrink-0 bg-border/50 mx-1" />

      <Select
        value={pagamento ?? TODOS}
        onValueChange={(v) => navegar({ pagamento: v === TODOS ? null : v })}
      >
        <SelectTrigger className="h-8 w-full sm:w-[160px] border-none bg-transparent shadow-none text-xs focus:ring-0">
          <SelectValue placeholder="Forma de pgto" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS} className="text-xs">Todas as formas</SelectItem>
          {PAGAMENTO_VALORES.map((valor) => (
            <SelectItem key={valor} value={valor} className="text-xs">
              {rotuloPagamento(valor)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="hidden sm:block h-4 w-px shrink-0 bg-border/50 mx-1" />

      <form
        className="relative flex-1 w-full"
        onSubmit={(e) => {
          e.preventDefault()
          const valor = new FormData(e.currentTarget).get("q")
          navegar({ q: typeof valor === "string" ? valor.trim() : null })
        }}
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="filtro-q"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar comprador, e-mail, produto ou transação..."
          className="h-8 pl-8 border-none bg-transparent shadow-none text-xs focus-visible:ring-0"
        />
      </form>

      <div className="flex shrink-0 items-center gap-2 px-2">
        {pendente ? (
          <Loader2
            className="size-3.5 animate-spin text-muted-foreground"
            aria-label="Carregando"
          />
        ) : null}
        {ativos || periodo !== PERIODO_PADRAO ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() =>
              navegar({
                periodo: PERIODO_PADRAO,
                status: null,
                pagamento: null,
                q: null,
              })
            }
          >
            Limpar
          </Button>
        ) : null}
      </div>
    </div>
  )
}
