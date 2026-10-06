import { Suspense } from "react"
import { AlertCircle, Info, Skull, type LucideIcon } from "lucide-react"

import { ClarityBreakdown } from "@/components/clarity/clarity-breakdown"
import { ClarityKpis } from "@/components/clarity/clarity-kpis"
import { ClaritySetup } from "@/components/clarity/clarity-setup"
import { ClarityStatusBar } from "@/components/clarity/clarity-status-bar"
import { TopPaginasSinal } from "@/components/clarity/top-paginas-sinal"
import { StatCard } from "@/components/dashboard/stat-card"
import { DesktopOnly } from "@/components/desktop-only"
import { diaLocal } from "@/lib/dashboard/timezone"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { pageTitle } from "@/lib/branding"
import { SINAIS_ATRITO, type SinalAtrito } from "@/lib/clarity/constants"
import { fmtDecimal, fmtDuracao, fmtInteiro, fmtPct } from "@/lib/clarity/format"
import {
  getClarityAccount,
  getClarityPanorama,
  type ClarityAccountRow,
} from "@/lib/clarity/queries"
import { PERIODOS, PERIODO_PADRAO, type PeriodoKey } from "@/lib/dashboard/filters"

export const metadata = {
  title: pageTitle("Mapa de Calor"),
}

/**
 * Salvar o token (Server Action desta rota) já faz a primeira sincronização:
 * até 5 chamadas ao Clarity em sequência, 15 s de teto cada.
 */
export const maxDuration = 90

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function lerPeriodo(sp: Record<string, string | string[] | undefined>): PeriodoKey {
  const v = Array.isArray(sp.periodo) ? sp.periodo[0] : sp.periodo
  return v && v in PERIODOS ? (v as PeriodoKey) : PERIODO_PADRAO
}

/**
 * Limiar de atenção por sinal, em % das sessões. Rage, dead e erro quase
 * sempre apontam defeito; quick back e scroll excessivo acontecem em página
 * saudável também, então o limiar deles é mais alto.
 */
const LIMIARES: Record<SinalAtrito, [atencao: number, negativo: number]> = {
  rage: [2, 5],
  dead: [5, 12],
  quickback: [10, 20],
  excessiveScroll: [10, 20],
  scriptError: [3, 8],
  errorClick: [1, 3],
}

/**
 * Abaixo do limiar é neutro, não verde: o tom vai no próprio número, e seis
 * números verdes gritariam "olhe aqui" justamente quando não há nada a ver.
 */
function tomDoSinal(sinal: SinalAtrito, valor: number | null) {
  if (valor === null) return "neutro" as const
  const [atencao, negativo] = LIMIARES[sinal]
  if (valor >= negativo) return "negativo" as const
  if (valor >= atencao) return "atencao" as const
  return "neutro" as const
}

function Secao({
  titulo,
  descricao,
  icone: Icone,
  corIcone = "text-primary",
  info,
  children,
}: {
  titulo: string
  descricao?: string
  /** Com ícone, o título ganha o tamanho dos cabeçalhos de Integrações → Site. */
  icone?: LucideIcon
  /** Classe de cor do ícone; verde por padrão, vermelho para seções de problema. */
  corIcone?: string
  /** Explicação da seção num balão ao lado do título, no lugar da descrição. */
  info?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl border p-4 sm:p-6">
      <div>
        {Icone ? (
          <div className="flex items-center gap-2.5">
            <Icone className={`size-6 shrink-0 ${corIcone}`} aria-hidden />
            <h2 className="text-xl font-semibold tracking-tight">{titulo}</h2>
            {info ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Sobre ${titulo}`}
                    className="rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Info className="size-4" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-left leading-relaxed">{info}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        ) : (
          <h2 className="text-base font-medium">{titulo}</h2>
        )}
        {descricao ? <p className="mt-1 max-w-prose text-sm text-muted-foreground">{descricao}</p> : null}
      </div>
      {children}
    </section>
  )
}

async function Conteudo({ account, periodo }: { account: ClarityAccountRow; periodo: PeriodoKey }) {
  const dados = await getClarityPanorama(periodo)
  const g = dados.geral
  const pctAtivo =
    g?.tempoTotal && g.tempoAtivo !== null ? (g.tempoAtivo / g.tempoTotal) * 100 : null

  return (
    <>
      <ClarityStatusBar
        account={account}
        ultimaCaptura={dados.ultimaCaptura}
        agoraMs={dados.agoraMs}
      />

      {/* O erro não substitui a tela: os blocos ficam, vazios, com o aviso
          acima — "0" sem explicação não diferencia "sem visita" de "falhou". */}
      {dados.error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertTitle>Não foi possível ler os dados do Clarity</AlertTitle>
          <AlertDescription>{dados.error}</AlertDescription>
        </Alert>
      ) : null}

      {account.lastSyncStatus && account.lastSyncStatus !== "ok" && account.lastSyncError ? (
        <Alert>
          <Info className="size-4" aria-hidden />
          <AlertTitle>A última sincronização não foi completa</AlertTitle>
          <AlertDescription>{account.lastSyncError}</AlertDescription>
        </Alert>
      ) : null}

      {periodo === "tudo" ? (
        <p className="-mt-2 text-xs text-muted-foreground">
          “Tudo” mostra os últimos 30 dias: o Clarity só deixa consultar 72 h para
          trás, e o histórico é construído aqui a partir do dia da conexão.
        </p>
      ) : null}

      <ClarityKpis
        dias={dados.dias}
        hoje={diaLocal(new Date())}
        serie={dados.tendencia}
        kpis={[
          {
            metrica: "sessoes",
            label: "Sessões",
            valor: fmtInteiro(g?.sessoes ?? null),
            // Contagem crua de bots, sem percentual: a doc não diz se o total da
            // API já os exclui (no painel do Clarity, exclui). Um % seria palpite.
            info:
              "Visitas gravadas pelo Clarity no período." +
              ` ${fmtInteiro(g?.bots ?? null)} sessões foram identificadas como bot.`,
          },
          {
            metrica: "usuarios",
            label: "Usuários",
            valor: fmtInteiro(g?.usuarios ?? null),
            info:
              dados.dias > 1
                ? "Visitantes distintos de cada dia, somados: quem volta em outro dia conta de novo."
                : "Visitantes distintos nas últimas 24 h.",
          },
          {
            metrica: "paginasPorSessao",
            label: "Páginas por sessão",
            valor: fmtDecimal(g?.paginasPorSessao ?? null),
            info: "Média de páginas vistas em cada sessão.",
          },
          {
            metrica: "scroll",
            label: "Profundidade de rolagem",
            valor: fmtPct(g?.scroll ?? null),
            info: "Até onde, em média, as pessoas rolam a página, em % da altura dela.",
          },
          {
            metrica: "tempoAtivo",
            label: "Tempo ativo",
            valor: fmtDuracao(g?.tempoAtivo ?? null),
            info:
              "Tempo médio por sessão em que a pessoa interagiu com a página (rolou, clicou, digitou)." +
              (pctAtivo === null
                ? ""
                : ` É ${fmtPct(pctAtivo)} dos ${fmtDuracao(g?.tempoTotal ?? null)} que ela ficou na página.`),
          },
        ]}
      />

      <Secao
        titulo="Sinais de atrito"
        icone={Skull}
        corIcone="text-destructive"
        info="Percentual das sessões em que o Clarity detectou cada sinal. É aqui que um defeito de página aparece antes de virar queda de conversão."
      >
        {/* Uma linha só a partir de xl; abaixo disso 6 cards não cabem com o
            número legível, então quebram em 3 e depois em 2. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {SINAIS_ATRITO.map((sinal) => {
            const valor = g?.atrito[sinal.key] ?? null
            return (
              <StatCard
                key={sinal.key}
                label={sinal.label}
                valor={fmtPct(valor)}
                info={sinal.descricao}
                tom={tomDoSinal(sinal.key, valor)}
                compacto
                acento="destructive"
              >
                <TopPaginasSinal
                  paginas={dados.topPorSinal[sinal.key]}
                  projectId={account.projectId}
                  dias={dados.dias}
                />
              </StatCard>
            )
          })}
        </div>
        {/* Aqui, e não em Quebras: é o ranking dos cards que pode perder as
            páginas de pouco tráfego quando o Clarity corta em 1.000 linhas. */}
        {dados.truncado ? (
          <p className="text-xs text-cyan">
            O Clarity devolveu o limite de 1.000 linhas numa das consultas: páginas
            com pouco tráfego podem ter ficado de fora.
          </p>
        ) : null}
      </Secao>

      <Secao titulo="Quebras">
        <ClarityBreakdown
          quebras={dados.quebras}
          projectId={account.projectId}
          dias={dados.dias}
        />
      </Secao>
    </>
  )
}

function Carregando() {
  return (
    <div className="flex flex-col gap-6">
      {/* Mesmo lugar e altura da navbar, para a troca de período não pular a tela. */}
      <div className="-mx-4 -mt-4 flex h-12 items-center border-b px-4 sm:-mx-6 sm:-mt-6 sm:px-6">
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-3xl" />
    </div>
  )
}

export default async function MapaDeCalorPage({ searchParams }: { searchParams: SearchParams }) {
  const periodo = lerPeriodo(await searchParams)

  let account: ClarityAccountRow | null = null
  let erro: string | null = null
  try {
    account = await getClarityAccount()
  } catch (e) {
    erro = e instanceof Error ? e.message : "erro desconhecido"
  }

  // Sem conexão (ou só com o Project ID): o assistente, AQUI. Esta tela é a
  // dona do Clarity — nunca mandar a pessoa para outra tela configurar.
  if (!account || !account.hasApiToken) {
    return (
      <div className="flex flex-col gap-6">
        {erro ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden />
            <AlertTitle>Não foi possível ler a conexão do Clarity</AlertTitle>
            <AlertDescription>
              {erro}. Se o banco é novo, confira se a migration do Clarity foi
              aplicada — sem ela, conectar não funciona.
            </AlertDescription>
          </Alert>
        ) : null}
        <DesktopOnly acao="conectar o Clarity">
          <ClaritySetup account={account} />
        </DesktopOnly>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Suspense key={periodo} fallback={<Carregando />}>
        <Conteudo account={account} periodo={periodo} />
      </Suspense>
    </div>
  )
}
