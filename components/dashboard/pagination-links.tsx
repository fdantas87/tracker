import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

/**
 * Paginação por link, não por estado de React: a página continua sendo
 * renderizada no servidor e o botão voltar do navegador funciona.
 */
export function PaginationLinks({
  pagina,
  total,
  pageSize,
  params,
  basePath = "/eventos",
}: {
  pagina: number
  total: number
  pageSize: number
  params: URLSearchParams
  basePath?: string
}) {
  const paginas = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null

  function href(p: number) {
    const q = new URLSearchParams(params)
    if (p <= 1) q.delete("pagina")
    else q.set("pagina", String(p))
    const qs = q.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  const primeiro = (pagina - 1) * pageSize + 1
  const ultimo = Math.min(pagina * pageSize, total)

  const classe = (ativo: boolean) =>
    cn(
      buttonVariants({ variant: "outline", size: "sm" }),
      !ativo && "pointer-events-none opacity-40"
    )

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{primeiro.toLocaleString("pt-BR")}</span>–
        <span className="font-mono tabular-nums">{ultimo.toLocaleString("pt-BR")}</span> de{" "}
        <span className="font-mono tabular-nums">{total.toLocaleString("pt-BR")}</span>
      </p>

      <div className="flex items-center gap-2">
        <Link
          href={href(pagina - 1)}
          scroll={false}
          className={classe(pagina > 1)}
          aria-disabled={pagina <= 1}
          tabIndex={pagina <= 1 ? -1 : undefined}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Anterior
        </Link>

        <span className="px-1 font-mono text-xs text-muted-foreground tabular-nums">
          {pagina} / {paginas}
        </span>

        <Link
          href={href(pagina + 1)}
          scroll={false}
          className={classe(pagina < paginas)}
          aria-disabled={pagina >= paginas}
          tabIndex={pagina >= paginas ? -1 : undefined}
        >
          Próxima
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
