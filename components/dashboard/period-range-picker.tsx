"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatarDia, rotuloDoPeriodo, type PeriodoKey } from "@/lib/dashboard/periodo"
import { diaLocal } from "@/lib/dashboard/timezone"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * Intervalo personalizado da topbar: início e fim, dia/mês/ano.
 *
 * Calendário próprio, sem `react-day-picker` + `date-fns`: um grid de mês com
 * seleção de intervalo é pouco código, e assim ele herda os tokens do painel
 * sem sobrescrever o tema de uma lib. As datas são strings "AAAA-MM-DD" do
 * calendário do painel (America/Sao_Paulo) — nunca `Date` local do navegador,
 * que num visitante em outro fuso deslocaria o dia.
 */

type Dia = string // "2026-10-15"

const MESES = Array.from({ length: 12 }, (_, m) => {
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, m, 1))
  )
  return nome.charAt(0).toUpperCase() + nome.slice(1)
})

const SEMANA = [
  ["D", "Domingo"],
  ["S", "Segunda"],
  ["T", "Terça"],
  ["Q", "Quarta"],
  ["Q", "Quinta"],
  ["S", "Sexta"],
  ["S", "Sábado"],
] as const

const DIA_LONGO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
})

function partes(dia: Dia) {
  const [a, m, d] = dia.split("-").map(Number)
  return { a, m: m - 1, d }
}

function montar(a: number, m: number, d: number): Dia {
  return new Date(Date.UTC(a, m, d)).toISOString().slice(0, 10)
}

function somar(dia: Dia, n: number): Dia {
  const { a, m, d } = partes(dia)
  return montar(a, m, d + n)
}

/** As 6 semanas do mês, começando no domingo — altura fixa, o popover não pula. */
function gradeDoMes(a: number, m: number): Dia[] {
  const primeiro = montar(a, m, 1)
  const inicio = somar(primeiro, -new Date(`${primeiro}T00:00:00Z`).getUTCDay())
  return Array.from({ length: 42 }, (_, i) => somar(inicio, i))
}

type Rascunho = { de: Dia | null; ate: Dia | null }

export function PeriodRangePicker({
  periodo,
  datas,
  onAplicar,
}: {
  periodo: PeriodoKey
  datas: { de: string; ate: string } | null
  onAplicar: (de: Dia, ate: Dia) => void
}) {
  const ativo = datas !== null
  const [aberto, setAberto] = useState(false)
  const [rascunho, setRascunho] = useState<Rascunho>({ de: null, ate: null })
  const [hover, setHover] = useState<Dia | null>(null)
  const [mes, setMes] = useState({ a: 2026, m: 0 })
  const [foco, setFoco] = useState<Dia>("")
  const [hoje, setHoje] = useState<Dia>("")
  const gradeRef = useRef<HTMLDivElement>(null)
  const focarDepois = useRef(false)

  // O foco do teclado só se move DEPOIS de o mês novo renderizar.
  useEffect(() => {
    if (!focarDepois.current) return
    focarDepois.current = false
    gradeRef.current?.querySelector<HTMLButtonElement>(`[data-dia="${foco}"]`)?.focus()
  }, [foco, mes])

  function abrir(proximo: boolean) {
    setAberto(proximo)
    if (!proximo) return
    // Estado inicial a cada abertura: o período aplicado, ou nada escolhido.
    const agora = diaLocal(new Date())
    const ancora = datas?.ate ?? agora
    const { a, m } = partes(ancora)
    setHoje(agora)
    setRascunho(datas ? { de: datas.de, ate: datas.ate } : { de: null, ate: null })
    setHover(null)
    setMes({ a, m })
    setFoco(ancora)
  }

  function escolher(dia: Dia) {
    setFoco(dia)
    const { de, ate } = rascunho
    if (!de || ate) {
      setRascunho({ de: dia, ate: null })
    } else {
      setRascunho(dia < de ? { de: dia, ate: de } : { de, ate: dia })
    }
  }

  function irParaMes(a: number, m: number) {
    const d = new Date(Date.UTC(a, m, 1))
    setMes({ a: d.getUTCFullYear(), m: d.getUTCMonth() })
  }

  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    const passo: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }
    let alvo: Dia | null = null
    if (e.key in passo) alvo = somar(foco, passo[e.key])
    else if (e.key === "PageUp" || e.key === "PageDown") {
      const { a, m, d } = partes(foco)
      alvo = montar(a, m + (e.key === "PageUp" ? -1 : 1), d)
    } else return

    e.preventDefault()
    if (alvo > hoje) alvo = hoje
    const { a, m } = partes(alvo)
    if (a !== mes.a || m !== mes.m) setMes({ a, m })
    focarDepois.current = true
    setFoco(alvo)
  }

  const { de, ate } = rascunho
  const fimVisual = ate ?? (de && hover ? hover : null)
  const [ini, fim] = de && fimVisual && fimVisual < de ? [fimVisual, de] : [de, fimVisual]
  const dias = gradeDoMes(mes.a, mes.m)
  const anoHoje = hoje ? partes(hoje).a : mes.a
  const anos = Array.from({ length: 6 }, (_, i) => anoHoje - 5 + i)
  const podeAvancar = montar(mes.a, mes.m + 1, 1) <= hoje
  const escolhendoFim = de !== null && ate === null

  return (
    <Popover open={aberto} onOpenChange={abrir}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ativo ? `Período personalizado: ${rotuloDoPeriodo(periodo)}` : "Escolher datas"}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            ativo || aberto
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <CalendarRange className="size-3.5" aria-hidden />
          {/* No celular o select ao lado já mostra as datas. */}
          {ativo ? <span className="hidden sm:inline">{rotuloDoPeriodo(periodo)}</span> : null}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[19.5rem] gap-3 p-3">
        {/* Início e fim lado a lado: deixa claro qual ponta o próximo clique define. */}
        <div className="grid grid-cols-2 gap-2" aria-live="polite">
          {(
            [
              ["Início", de, !escolhendoFim],
              ["Fim", ate, escolhendoFim],
            ] as const
          ).map(([rotulo, valor, vez]) => (
            <div
              key={rotulo}
              className={cn(
                "rounded-md border px-2.5 py-1.5 transition-colors",
                vez ? "border-primary/60 bg-primary/5" : "border-border"
              )}
            >
              <div className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
                {rotulo}
              </div>
              <div
                className={cn(
                  "font-mono text-sm tabular-nums",
                  valor ? "text-foreground" : "text-muted-foreground/70"
                )}
              >
                {valor ? formatarDia(valor) : "dd/mm/aa"}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Mês anterior"
            onClick={() => irParaMes(mes.a, mes.m - 1)}
          >
            <ChevronLeft />
          </Button>
          <Select value={String(mes.m)} onValueChange={(v) => irParaMes(mes.a, Number(v))}>
            <SelectTrigger size="sm" aria-label="Mês" className="flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((nome, i) => (
                <SelectItem
                  key={nome}
                  value={String(i)}
                  className="text-xs"
                  disabled={montar(mes.a, i, 1) > hoje}
                >
                  {nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(mes.a)}
            onValueChange={(v) => {
              const a = Number(v)
              // Ano atual com um mês ainda no futuro: recua para o mês corrente.
              const limite = partes(hoje)
              irParaMes(a, a === limite.a ? Math.min(mes.m, limite.m) : mes.m)
            }}
          >
            <SelectTrigger size="sm" aria-label="Ano" className="text-xs tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anos.map((a) => (
                <SelectItem key={a} value={String(a)} className="text-xs tabular-nums">
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Próximo mês"
            disabled={!podeAvancar}
            onClick={() => irParaMes(mes.a, mes.m + 1)}
          >
            <ChevronRight />
          </Button>
        </div>

        <div>
          <div className="grid grid-cols-7 pb-1" aria-hidden>
            {SEMANA.map(([letra, nome]) => (
              <abbr
                key={nome}
                title={nome}
                className="text-center text-[0.65rem] font-medium text-muted-foreground no-underline"
              >
                {letra}
              </abbr>
            ))}
          </div>

          <div
            ref={gradeRef}
            role="grid"
            aria-label={`${MESES[mes.m]} de ${mes.a}`}
            className="grid grid-cols-7 gap-y-0.5"
            onKeyDown={teclado}
            onMouseLeave={() => setHover(null)}
          >
            {dias.map((dia) => {
              const doMes = partes(dia).m === mes.m
              const futuro = dia > hoje
              const ponta = dia === ini || dia === fim
              const dentro = ini && fim && dia > ini && dia < fim
              const naFaixa = ini && fim && dia >= ini && dia <= fim
              return (
                <div
                  key={dia}
                  role="gridcell"
                  className={cn(
                    "flex justify-center",
                    naFaixa && ini !== fim && "bg-primary/12",
                    dia === ini && fim && ini !== fim && "rounded-l-md",
                    dia === fim && ini && ini !== fim && "rounded-r-md"
                  )}
                >
                  <button
                    type="button"
                    data-dia={dia}
                    tabIndex={dia === foco ? 0 : -1}
                    disabled={futuro}
                    aria-pressed={Boolean(ponta)}
                    aria-label={DIA_LONGO.format(new Date(`${dia}T00:00:00Z`))}
                    onClick={() => escolher(dia)}
                    onMouseEnter={() => escolhendoFim && setHover(dia)}
                    className={cn(
                      "relative size-9 rounded-md text-xs tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-30",
                      ponta
                        ? "bg-primary font-semibold text-primary-foreground"
                        : dentro
                          ? "text-foreground hover:bg-primary/20"
                          : "hover:bg-muted",
                      !doMes && !ponta && "text-muted-foreground/50"
                    )}
                  >
                    {partes(dia).d}
                    {dia === hoje && !ponta ? (
                      <span
                        aria-hidden
                        className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary"
                      />
                    ) : null}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {escolhendoFim ? "Agora o dia final" : de ? "Intervalo pronto" : "Clique no dia inicial"}
          </p>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!de}
              onClick={() => {
                if (!de) return
                onAplicar(de, ate ?? de)
                setAberto(false)
              }}
            >
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
