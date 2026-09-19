import { CheckCircle2, XCircle } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { PageHeader, PhasePlaceholder } from "@/components/page-header"
import { pageTitle } from "@/lib/branding"

export const metadata = {
  title: pageTitle("Visão geral"),
}

/** Contagem por tabela, lida COM a sessão do usuário (ou seja, sob RLS). */
async function readCounts() {
  const supabase = await createClient()

  const [visitors, events, purchases] = await Promise.all([
    supabase.from("visitors").select("*", { count: "exact", head: true }),
    supabase.from("events_log").select("*", { count: "exact", head: true }),
    supabase.from("purchases").select("*", { count: "exact", head: true }),
  ])

  return [
    { label: "Visitantes", result: visitors },
    { label: "Eventos", result: events },
    { label: "Compras", result: purchases },
  ]
}

export default async function OverviewPage() {
  const counts = await readCounts()
  const failed = counts.filter((c) => c.result.error)

  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Funil, conversão e volume de eventos aparecem aqui quando a captura estiver ligada."
      />

      <section className="grid gap-4 sm:grid-cols-3">
        {counts.map(({ label, result }) => (
          <div key={label} className="glass rounded-2xl p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">
              {result.error ? "—" : (result.count ?? 0).toLocaleString("pt-BR")}
            </p>
          </div>
        ))}
      </section>

      {/* Prova de que o caminho de leitura autenticada funciona ponta a ponta:
          sessão do usuário -> RLS -> tabela. Sai quando o dashboard real for
          construído na fase 8. */}
      <section className="glass rounded-2xl p-5">
        <div className="flex items-start gap-3">
          {failed.length === 0 ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
          ) : (
            <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {failed.length === 0
                ? "Leitura autenticada funcionando"
                : "Falha na leitura autenticada"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {failed.length === 0
                ? "As três tabelas do painel responderam com a sessão do usuário, passando por RLS. Estão vazias porque a captura de eventos ainda não foi construída."
                : failed
                    .map((f) => `${f.label}: ${f.result.error?.message}`)
                    .join(" · ")}
            </p>
          </div>
        </div>
      </section>

      <PhasePlaceholder phase="fase 8">
        Funil (Visitou → Checkout → Compra), eventos por tipo e taxa de
        conversão entram aqui depois que a captura e o webhook estiverem
        rodando.
      </PhasePlaceholder>
    </>
  )
}
