import Link from "next/link"

import { cn } from "@/lib/utils"
import { STATUS_META } from "@/components/dashboard/dispatch-status-badge"
import { DISPATCH_STATUSES, type DispatchStatus } from "@/lib/dashboard/filters"

/**
 * "Esse evento saiu?" respondido antes de qualquer scroll.
 *
 * Cada chip é um link que aplica o filtro — por isso a contagem ignora o
 * filtro de status: se só contasse o selecionado, os outros chips zerariam e
 * deixariam de servir como navegação.
 */
export function StatusChips({
  contagens,
  ativo,
  params,
}: {
  contagens: Record<DispatchStatus, number> & { total: number }
  ativo?: DispatchStatus
  params: URLSearchParams
}) {
  function href(status?: DispatchStatus) {
    const p = new URLSearchParams(params)
    p.delete("pagina")
    if (status) p.set("status", status)
    else p.delete("status")
    const qs = p.toString()
    return qs ? `/eventos?${qs}` : "/eventos"
  }

  const chips = [
    { chave: undefined, label: "Todos", valor: contagens.total, classe: "" },
    ...DISPATCH_STATUSES.map((s) => ({
      chave: s,
      label: STATUS_META[s].label,
      valor: contagens[s],
      classe: STATUS_META[s].classe,
    })),
  ]

  return (
    // No celular, 3 por linha: 6 chips numa linha só obrigavam rótulo de 7px.
    <div className="grid w-full grid-cols-3 gap-1.5 sm:flex sm:gap-2">
      {chips.map(({ chave, label, valor, classe }) => {
        const selecionado = ativo === chave

        return (
          <Link
            key={label}
            href={href(chave)}
            scroll={false}
            aria-current={selecionado ? "true" : undefined}
            className={cn(
              "glass flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border p-1.5 transition-colors sm:rounded-xl sm:p-2",
              selecionado
                ? "border-primary/50 ring-1 ring-primary/30"
                : "hover:border-foreground/20",
              // Um chip zerado continua clicável, mas não deve competir por
              // atenção com os que têm conteúdo.
              valor === 0 && !selecionado && "opacity-50"
            )}
          >
            <span
              className={cn(
                "font-mono text-base font-semibold leading-none tabular-nums sm:text-lg md:text-xl lg:text-2xl",
                chave ? classe.split(" ").find((c) => c.startsWith("text-")) : undefined
              )}
            >
              {valor.toLocaleString("pt-BR")}
            </span>
            <span className="max-w-full truncate text-center text-[10px] font-bold uppercase tracking-tighter text-muted-foreground lg:text-xs">
              {label}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
