/**
 * Constantes e rótulos do disparo atrasado (fase 7.5).
 *
 * Mora num módulo comum — não no arquivo de actions — porque `"use server"` só
 * pode exportar função assíncrona, e porque o componente de cliente da tela de
 * configurações precisa dos rótulos. Mesma razão de `action-state.ts`.
 */

export const DISPATCH_MODES = ["adaptive", "server_only", "hybrid"] as const
export type DispatchMode = (typeof DISPATCH_MODES)[number]

export type DispatchConfig = {
  mode: DispatchMode
  delaySeconds: number
  immediateEvents: string[]
  formCaptureEnabled: boolean
  defaultPhoneCountry: string
  testEventCode: string | null
}

/** Teto de 6h. O limite duro do Meta é 7 dias; passando de 1h o ganho some. */
export const MAX_DELAY_SECONDS = 21_600
export const MAX_IMMEDIATE_EVENTS = 20

export const DEFAULT_DISPATCH_CONFIG: DispatchConfig = {
  mode: "adaptive",
  delaySeconds: 900,
  immediateEvents: [],
  formCaptureEnabled: true,
  defaultPhoneCountry: "55",
  testEventCode: null,
}

export function isDispatchMode(value: unknown): value is DispatchMode {
  return (
    typeof value === "string" &&
    (DISPATCH_MODES as readonly string[]).includes(value)
  )
}

export const DISPATCH_MODE_LABELS: Record<
  DispatchMode,
  { title: string; description: string }
> = {
  adaptive: {
    title: "Híbrido adaptativo (recomendado)",
    description:
      "Visitante ainda anônimo: o pixel do navegador não dispara e o evento espera na fila, saindo enriquecido com os dados da conversão. Visitante já identificado: não há o que esperar, então o pixel dispara e a Conversions API vai junto, na hora.",
  },
  server_only: {
    title: "Só servidor",
    description:
      "O pixel só inicializa (o que mantém o cookie _fbp), e nunca dispara evento. Todo evento passa pela fila e sai enriquecido. É a opção de maior correspondência, e a que mais depende deste servidor estar de pé.",
  },
  hybrid: {
    title: "Híbrido puro (experimental)",
    description:
      "O pixel dispara na hora e a Conversions API vai atrasada com o mesmo event_id. A doc do Meta diz que o evento que chega depois é descartado, então o enriquecido tende a ser perdido — use só para medir, comparando a qualidade da correspondência no Events Manager.",
  },
}

/**
 * Valida a lista de eventos que nunca são atrasados.
 *
 * Mesmo padrão de `cleanEventName`: é o que /api/event aceita e o que o Meta
 * reconhece. Devolve a lista limpa, ou uma mensagem de erro.
 */
export function parseImmediateEvents(raw: string): string[] | { error: string } {
  const names = raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)

  if (names.length > MAX_IMMEDIATE_EVENTS) {
    return { error: `No máximo ${MAX_IMMEDIATE_EVENTS} eventos nesta lista.` }
  }

  for (const name of names) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) {
      return {
        error: `"${name}" não é um nome de evento válido (letras, números e _, começando por letra).`,
      }
    }
  }

  return Array.from(new Set(names))
}
