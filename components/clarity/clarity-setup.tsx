import { Check, ExternalLink, Flame, PlayCircle } from "lucide-react"

import { CLARITY_APP_URL } from "@/lib/clarity/constants"
import { clarityHeatmapUrl, clarityRecordingsUrl } from "@/lib/clarity/deeplinks"
import type { ClarityAccountRow } from "@/lib/clarity/queries"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ClarityCuidados, ProjectIdForm, TokenForm } from "./clarity-forms"

/**
 * Assistente de conexão do Clarity, DENTRO da tela Mapa de Calor.
 *
 * Existe porque a primeira versão desta tela mostrava só um botão "Conectar o
 * Clarity" que levava a Integrações — e lá a pessoa não achava nada. Aqui cada
 * passo está na própria tela, com o campo para colar e o link para o lugar
 * exato do Clarity de onde vem o valor.
 *
 * Dois momentos com o mesmo componente:
 * - sem conta: passos 1 → 2 → 3;
 * - só com o Project ID: o Clarity já grava; falta o token para os KPIs
 *   virem para cá (passo 3) e conferir a primeira gravação.
 */

type Estado = "feito" | "atual" | "pendente"

function Passo({
  numero,
  titulo,
  estado,
  children,
}: {
  numero: number
  titulo: string
  estado: Estado
  children?: React.ReactNode
}) {
  return (
    <li className="relative flex gap-4">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-sm tabular-nums",
          estado === "feito" && "border-primary bg-primary text-primary-foreground",
          estado === "atual" && "border-primary text-primary",
          estado === "pendente" && "text-muted-foreground"
        )}
        aria-hidden
      >
        {estado === "feito" ? <Check className="size-4" /> : numero}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 pb-8">
        <p
          className={cn(
            "pt-1 font-medium",
            estado === "pendente" && "text-muted-foreground"
          )}
        >
          {titulo}
          {estado === "feito" ? <span className="sr-only"> (concluído)</span> : null}
        </p>
        {children}
      </div>
    </li>
  )
}

export function ClaritySetup({ account }: { account: ClarityAccountRow | null }) {
  const conectado = account !== null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl border bg-background/60">
          <Flame className="size-7 text-primary" />
        </span>
        {conectado ? (
          <>
            <h2 className="text-xl font-semibold tracking-tight">
              O Clarity já está gravando seus sites
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              Gravações e mapas de calor já estão no Clarity. Falta um passo para
              os números — sessões, rolagem, rage clicks e as páginas com mais
              atrito — aparecerem aqui.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={clarityHeatmapUrl(account.projectId)} target="_blank" rel="noreferrer">
                  <Flame />
                  Abrir mapas de calor
                  <ExternalLink className="size-3" />
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={clarityRecordingsUrl(account.projectId)} target="_blank" rel="noreferrer">
                  <PlayCircle />
                  Abrir gravações
                  <ExternalLink className="size-3" />
                </a>
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold tracking-tight">
              Conecte o Microsoft Clarity — é gratuito
            </h2>
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              <li>Gravações das sessões: veja o visitante navegando.</li>
              <li>Mapas de calor: onde clicam, até onde rolam, onde travam.</li>
              <li>Os números de comportamento aqui, ao lado das suas vendas.</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Leva uns 3 minutos. Você não precisa mexer no site: o tracker carrega
              o Clarity sozinho.
            </p>
          </>
        )}
      </header>

      <ol className="rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-5 sm:p-8">
        <Passo
          numero={1}
          titulo="Crie um projeto no Clarity"
          estado={conectado ? "feito" : "atual"}
        >
          {conectado ? null : (
            <>
              <p className="text-sm text-muted-foreground">
                Entre com a sua conta Microsoft, Google ou Facebook e crie um
                projeto com o nome e o endereço do site. Se o Clarity oferecer
                instalar o código de rastreamento,{" "}
                <strong className="text-foreground">pule essa parte</strong> — o
                tracker faz isso.
              </p>
              <Button asChild variant="outline" className="w-fit">
                <a href={CLARITY_APP_URL} target="_blank" rel="noreferrer">
                  Abrir o Clarity
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </>
          )}
        </Passo>

        <Passo
          numero={2}
          titulo={
            conectado ? `Projeto conectado: ${account.projectId}` : "Cole o endereço do projeto"
          }
          estado={conectado ? "feito" : "atual"}
        >
          {conectado ? null : (
            <>
              <p className="text-sm text-muted-foreground">
                Com o projeto aberto no Clarity, copie o endereço da barra do
                navegador e cole aqui.
              </p>
              <ProjectIdForm />
            </>
          )}
        </Passo>

        <Passo
          numero={3}
          titulo="Traga os números para cá (recomendado)"
          estado={conectado ? "atual" : "pendente"}
        >
          <p className="text-sm text-muted-foreground">
            No projeto do Clarity: <strong className="text-foreground">Settings → Data
            Export → Generate new API token</strong>. Dê um nome como{" "}
            <code className="font-mono">thetrack</code> e copie o token — ele aparece
            uma vez só, e só administradores do projeto conseguem gerar.
          </p>
          {conectado ? (
            <TokenForm />
          ) : (
            <p className="text-xs text-muted-foreground">
              Disponível depois do passo 2.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            O Clarity permite 10 consultas por dia por projeto. O tracker busca os
            dados uma vez por dia e guarda o histórico — por isso vale gerar um
            token só para ele.
          </p>
        </Passo>

        <Passo
          numero={4}
          titulo="Confira a primeira gravação"
          estado={conectado ? "atual" : "pendente"}
        >
          <p className="text-sm text-muted-foreground">
            Abra o seu site numa <strong className="text-foreground">janela
            anônima</strong> e navegue um pouco. Em 1 ou 2 minutos a sessão aparece
            nas gravações do Clarity.
          </p>
          {conectado ? (
            <Button asChild variant="outline" size="sm" className="w-fit">
              <a href={clarityRecordingsUrl(account.projectId)} target="_blank" rel="noreferrer">
                <PlayCircle />
                Ver gravações
                <ExternalLink className="size-3" />
              </a>
            </Button>
          ) : null}
        </Passo>
      </ol>

      <ClarityCuidados defaultOpen={!conectado} />
    </div>
  )
}
