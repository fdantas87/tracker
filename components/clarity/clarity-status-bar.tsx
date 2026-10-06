"use client"

import * as React from "react"
import { Flame, RefreshCw } from "lucide-react"

import { refreshClarityNow } from "@/app/(dashboard)/mapa-de-calor/actions"
import { clarityHeatmapUrl } from "@/lib/clarity/deeplinks"
import type { ClarityAccountRow } from "@/lib/clarity/queries"
import { diaLocal, FUSO_PAINEL } from "@/lib/dashboard/timezone"
import type { ActionState } from "@/lib/settings/action-state"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ClarityMcpDialog } from "./clarity-mcp-dialog"
import { ClarityNavButton } from "./clarity-nav-button"
import { ClaritySettingsDialog } from "./clarity-settings-dialog"

const horaMinuto = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_PAINEL,
  hour: "2-digit",
  minute: "2-digit",
})

const diaMes = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_PAINEL,
  day: "2-digit",
  month: "2-digit",
})

/** "14h32" se for de hoje; "04/10, 14h32" se não — só a hora enganaria. */
function horaDaCaptura(iso: string, agoraMs: number): string {
  const instante = new Date(iso)
  const hora = horaMinuto.format(instante).replace(":", "h")
  return diaLocal(instante) === diaLocal(new Date(agoraMs))
    ? hora
    : `${diaMes.format(instante)}, ${hora}`
}

/** Navbar da tela, presa sob a topbar: de quando é o dado e as portas para o Clarity. */
export function ClarityStatusBar({
  account,
  ultimaCaptura,
  agoraMs,
}: {
  account: ClarityAccountRow
  ultimaCaptura: string | null
  agoraMs: number
}) {
  const [pending, startTransition] = React.useTransition()
  const [resultado, setResultado] = React.useState<ActionState | null>(null)

  const restantes = Math.max(0, account.limiteDiario - account.chamadasHoje)
  const desabilitado = pending || !account.hasApiToken || restantes === 0

  // O balão explica o botão E, quando ele está apagado, por que está.
  const dicaDoAtualizar = pending
    ? "Atualizando…"
    : restantes === 0
      ? "As consultas de hoje ao Clarity acabaram. A sincronização automática da madrugada traz os dados novos."
      : "Atualizar agora: busca as últimas 24 h no Clarity (usa 2 das consultas do dia)."

  function atualizar() {
    setResultado(null)
    startTransition(async () => {
      setResultado(await refreshClarityNow())
    })
  }

  return (
    <>
      {/* Navbar colada na topbar (sticky top-14 = altura dela) e de borda a
          borda: as margens negativas desfazem o padding do layout do painel.
          O fundo e o blur são os mesmos da topbar, para ler como uma peça só. */}
      <nav
        aria-label="Ações do Clarity"
        className="sticky top-14 z-40 -mx-4 -mt-4 border-b bg-background/80 backdrop-blur-md sm:-mx-6 sm:-mt-6"
      >
        <div className="flex h-12 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                !account.isActive
                  ? "bg-cyan"
                  : ultimaCaptura
                    ? "bg-primary shadow-[0_0_0_3px_color-mix(in_hsl,var(--primary)_20%,transparent)]"
                    : "bg-muted-foreground/50"
              )}
            />
            <span className="truncate">
              {ultimaCaptura ? (
                <>
                  <span className="max-sm:hidden">Última atualização: </span>
                  <span className="tabular-nums">{horaDaCaptura(ultimaCaptura, agoraMs)}</span>
                </>
              ) : (
                "Nenhum dado sincronizado ainda"
              )}
            </span>
            <Tooltip>
              {/* O gatilho é o span, não o botão: botão desabilitado não recebe
                  hover, e é justamente aí que o balão precisa dizer por quê. */}
              <TooltipTrigger asChild>
                <span className="-ml-0.5 inline-flex shrink-0">
                  <button
                    type="button"
                    onClick={atualizar}
                    disabled={desabilitado}
                    aria-label="Atualizar agora"
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-muted/60"
                  >
                    <RefreshCw aria-hidden className={cn("size-3.5", pending && "animate-spin")} />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64 text-xs">
                {dicaDoAtualizar}
              </TooltipContent>
            </Tooltip>
            {!account.isActive ? (
              <span className="shrink-0 rounded-md border border-cyan/30 bg-cyan/10 px-1.5 py-0.5 text-xs text-cyan">
                Pausado
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <ClarityNavButton asChild externo icone={<Flame />} rotulo="Mapas de calor">
              <a href={clarityHeatmapUrl(account.projectId)} target="_blank" rel="noreferrer" />
            </ClarityNavButton>
            <ClarityMcpDialog hasMcpToken={account.hasMcpToken} />
            <ClaritySettingsDialog account={account} />
          </div>
        </div>

        {/* Resposta do "Atualizar agora" fica DENTRO da navbar: quem clica com a
            página rolada não veria uma mensagem deixada lá no topo. */}
        {resultado?.message ? (
          <p
            role="status"
            className={cn(
              "border-t px-4 py-2 text-xs sm:px-6",
              resultado.ok ? "text-primary" : "text-destructive"
            )}
          >
            {resultado.message}
          </p>
        ) : null}
      </nav>

      {!account.isActive ? (
        <p className="text-xs text-cyan">
          Clarity pausado: o script não está carregando nos sites e a sincronização
          diária está parada. Religue em Configurar.
        </p>
      ) : null}
    </>
  )
}
