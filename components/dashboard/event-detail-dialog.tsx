"use client"

import { useState, type ReactNode } from "react"
import { Archive, FileJson, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { carregarDetalhe } from "@/app/(dashboard)/eventos/actions"
import { formatarCompleto, formatarHoraNoFuso } from "@/lib/dashboard/format"
import type { EventDetail, Localizacao } from "@/lib/dashboard/events"

function Json({ valor }: { valor: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
      {JSON.stringify(valor, null, 2)}
    </pre>
  )
}

function Bloco({
  titulo,
  valor,
  purgado,
}: {
  titulo: string
  valor: unknown
  purgado: boolean
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{titulo}</h3>
      {valor ? (
        <Json valor={valor} />
      ) : purgado ? (
        // Sem esta mensagem o vazio é ambíguo: parece que o disparo não
        // aconteceu, quando na verdade o payload foi zerado pela retenção.
        <p className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <Archive className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Removido pela retenção de 14 dias. O evento continua registrado — só o
          corpo da requisição é apagado, para o banco não crescer sem limite.
        </p>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Nada registrado — este destino não foi acionado para este evento.
        </p>
      )}
    </section>
  )
}

/** "São Paulo, SP · BR", pulando o que o geo por IP não resolveu. */
function Local({ local }: { local: Localizacao }) {
  const lugar = [local.city, local.region].filter(Boolean).join(", ")
  const texto = [lugar, local.country].filter(Boolean).join(" · ")
  if (!texto) return null

  return <Campo titulo="Local">{texto}</Campo>
}

function Campo({
  titulo,
  children,
  largo = false,
}: {
  titulo: string
  children: ReactNode
  largo?: boolean
}) {
  return (
    <div className={largo ? "col-span-2 min-w-0 sm:col-span-3" : undefined}>
      <dt className="text-muted-foreground">{titulo}</dt>
      <dd className="font-mono tabular-nums">{children}</dd>
    </div>
  )
}

/**
 * O horário no relógio de quem gerou o evento.
 *
 * Aparece SÓ quando o visitante não estava no fuso do painel. Sem isso, um
 * evento das 23h em Manaus é lido como meia-noite e vira "compra de madrugada"
 * numa análise de horário de campanha — conclusão errada tirada de dado certo.
 * E mostrar "mesmo horário" para todo mundo que está em Brasília só ocuparia
 * espaço.
 */
function HoraLocal({ iso, fuso }: { iso: string; fuso: string | null }) {
  const hora = formatarHoraNoFuso(iso, fuso)
  if (!hora) return null

  return (
    <Campo titulo="Hora local do visitante">
      {hora.horario}{" "}
      <span className="font-sans text-muted-foreground">{hora.fuso}</span>
    </Campo>
  )
}

export function EventDetailDialog({ id, eventName }: { id: string; eventName: string }) {
  const [detalhe, setDetalhe] = useState<EventDetail | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function abrir(aberto: boolean) {
    // Carrega na abertura, e uma vez só. Nada de useEffect: o lint do React 19
    // recusa setState dentro de efeito (react-hooks/set-state-in-effect).
    if (!aberto || detalhe || carregando) return

    setCarregando(true)
    setErro(null)
    try {
      setDetalhe(await carregarDetalhe(id))
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o evento.")
    } finally {
      setCarregando(false)
    }
  }

  return (
    <Dialog onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Ver payload de ${eventName}`}>
          <FileJson className="size-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Payload</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{eventName}</DialogTitle>
          <DialogDescription>
            {detalhe ? (
              <span className="font-mono text-xs break-all">{detalhe.eventId}</span>
            ) : (
              "O que foi enviado para cada destino e o que cada um respondeu."
            )}
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Carregando…
          </div>
        ) : erro ? (
          <p className="py-8 text-sm text-destructive">{erro}</p>
        ) : detalhe ? (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <Campo titulo="Momento do evento">
                {formatarCompleto(detalhe.eventTime)}
              </Campo>
              <Campo titulo="Registrado em">
                {formatarCompleto(detalhe.createdAt)}
              </Campo>
              <Campo titulo="Origem">{detalhe.actionSource}</Campo>

              <HoraLocal iso={detalhe.eventTime} fuso={detalhe.local.timezone} />

              <Local local={detalhe.local} />
              {detalhe.local.postalCode ? (
                <Campo titulo="CEP (aproximado)">
                  {detalhe.local.postalCode}
                </Campo>
              ) : null}
              {detalhe.local.latitude !== null &&
              detalhe.local.longitude !== null ? (
                <Campo titulo="Coordenadas">
                  {detalhe.local.latitude}, {detalhe.local.longitude}
                </Campo>
              ) : null}

              {detalhe.sourceUrl ? (
                <Campo titulo="URL" largo>
                  <span className="block truncate">{detalhe.sourceUrl}</span>
                </Campo>
              ) : null}
            </dl>

            {detalhe.customData ? (
              <Bloco titulo="custom_data" valor={detalhe.customData} purgado={false} />
            ) : null}

            <Bloco
              titulo="Enviado ao Meta (payload_meta)"
              valor={detalhe.payloadMeta}
              purgado={detalhe.purgado}
            />
            <Bloco
              titulo="Resposta do Meta (response_meta)"
              valor={detalhe.responseMeta}
              purgado={detalhe.purgado}
            />

            {detalhe.payloadGa4 || detalhe.responseGa4 ? (
              <>
                <Bloco
                  titulo="Enviado ao GA4 (payload_ga4)"
                  valor={detalhe.payloadGa4}
                  purgado={detalhe.purgado}
                />
                <Bloco
                  titulo="Resposta do GA4 (response_ga4)"
                  valor={detalhe.responseGa4}
                  purgado={detalhe.purgado}
                />
              </>
            ) : (
              // Não é lacuna: o GA4 do navegador já recebe estes eventos pela
              // gtag. Repetir pelo Measurement Protocol contaria em dobro.
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                GA4 não é acionado para eventos do navegador — a gtag já os
                envia. O Measurement Protocol é usado só na compra do webhook,
                que nasce fora do navegador.
              </p>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
