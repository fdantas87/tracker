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
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex shrink-0 rounded-lg border p-0.5">
        {(Object.keys(PERIODOS) as PeriodoKey[]).map((chave) => (
          <button
            key={chave}
            type="button"
            onClick={() => navegar({ periodo: chave })}
            aria-pressed={periodo === chave}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              periodo === chave
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {PERIODOS[chave].label}
          </button>
        ))}
      </div>

      {pendente ? (
        <Loader2
          className="size-4 animate-spin text-muted-foreground"
          aria-label="Carregando"
        />
      ) : null}

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="ml-auto">
            <Filter className="size-4" aria-hidden />
            Filtros
            {ativos ? (
              <span className="ml-1 rounded-full bg-primary/15 px-1.5 font-mono text-[0.65rem] text-primary tabular-nums">
                {ativos}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-80 gap-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="filtro-status">Status</Label>
            <Select
              value={status ?? TODOS}
              onValueChange={(v) => navegar({ status: v === TODOS ? null : v })}
            >
              <SelectTrigger id="filtro-status" className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os status</SelectItem>
                {(Object.keys(STATUS_LABELS) as PurchaseStatus[]).map((valor) => (
                  <SelectItem key={valor} value={valor}>
                    {STATUS_LABELS[valor]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filtro-pagamento">Forma de pagamento</Label>
            <Select
              value={pagamento ?? TODOS}
              onValueChange={(v) => navegar({ pagamento: v === TODOS ? null : v })}
            >
              <SelectTrigger id="filtro-pagamento" className="w-full">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas as formas</SelectItem>
                {PAGAMENTO_VALORES.map((valor) => (
                  <SelectItem key={valor} value={valor}>
                    {rotuloPagamento(valor)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              const valor = new FormData(e.currentTarget).get("q")
              navegar({ q: typeof valor === "string" ? valor.trim() : null })
            }}
          >
            <Label htmlFor="filtro-q">Buscar</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="filtro-q"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Comprador, e-mail, produto ou transação"
                className="pl-9 text-xs"
              />
            </div>
          </form>

          {ativos || periodo !== PERIODO_PADRAO ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() =>
                navegar({
                  periodo: PERIODO_PADRAO,
                  status: null,
                  pagamento: null,
                  q: null,
                })
              }
            >
              <X className="size-4" aria-hidden />
              Limpar filtros
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
