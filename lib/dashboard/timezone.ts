/**
 * O fuso do painel, e as duas operações de calendário que dependem dele.
 *
 * POR QUE ESTE MÓDULO EXISTE: o painel renderizava em America/Sao_Paulo mas
 * recortava e agregava em UTC. `periodoInicio()` usava `setHours(0,0,0,0)`, que
 * opera no fuso do processo — UTC na Vercel —, e a série do gráfico usava
 * `toISOString().slice(0,10)`. Resultado: "Hoje" começava às 21h de ontem no
 * horário de Brasília, e um evento das 22h caía no balde do dia seguinte
 * enquanto a linha da tabela, essa sim formatada em America/Sao_Paulo, exibia a
 * data de ontem. A tela se contradizia sozinha.
 *
 * O fuso é FIXO, e isso é uma escolha, não uma limitação: o painel é de uma
 * empresa brasileira, e um fuso fixo é o que garante que o servidor e o
 * navegador concordem sobre onde um dia começa. O fuso do VISITANTE é outra
 * coisa — é dado, fica em `events_log.geo_timezone` e aparece por evento
 * (ver `formatarHoraNoFuso` em ./format).
 *
 * SEM `server-only`, de propósito: a barra de filtros é Client Component e
 * importa `./filters`, que importa daqui. Mesma razão de `./filters` não poder
 * importar de `./events`. Ver CLAUDE.md, fase 8a.
 */

export const FUSO_PAINEL = "America/Sao_Paulo"

/**
 * Um formatter só, memorizado no módulo: construir um `Intl.DateTimeFormat` é
 * caro e a série do gráfico chama isto uma vez por linha.
 *
 * `hourCycle: "h23"` em vez de `hour12: false` — o segundo devolve "24" para a
 * meia-noite em algumas implementações, o que quebraria a aritmética abaixo em
 * silêncio, uma vez por dia.
 */
const PARTES = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO_PAINEL,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

type Partes = {
  ano: number
  mes: number
  dia: number
  hora: number
  minuto: number
  segundo: number
}

function partesEm(instante: Date): Partes {
  const bruto: Record<string, string> = {}
  for (const parte of PARTES.formatToParts(instante)) {
    if (parte.type !== "literal") bruto[parte.type] = parte.value
  }

  return {
    ano: Number(bruto.year),
    mes: Number(bruto.month),
    dia: Number(bruto.day),
    hora: Number(bruto.hour),
    minuto: Number(bruto.minute),
    segundo: Number(bruto.second),
  }
}

function pad(valor: number): string {
  return String(valor).padStart(2, "0")
}

/**
 * A data do calendário ("2026-09-18") a que o instante pertence NO FUSO DO
 * PAINEL. É a chave dos baldes do gráfico.
 *
 * Montada peça por peça em vez de confiar num locale que "costuma" dar
 * ISO: o formato do balde é contrato com o componente do gráfico, e não pode
 * depender de qual ICU o Node embarcou.
 */
export function diaLocal(valor: Date | string): string {
  const instante = valor instanceof Date ? valor : new Date(valor)
  const { ano, mes, dia } = partesEm(instante)
  return `${ano}-${pad(mes)}-${pad(dia)}`
}

/** Deslocamento do fuso em relação ao UTC, em ms, no instante dado. */
function offsetMs(instante: Date): number {
  const { ano, mes, dia, hora, minuto, segundo } = partesEm(instante)
  const comoSeFosseUtc = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo)
  // O formatter descarta milissegundos; truncá-los do outro lado também mantém
  // a subtração exata em vez de errar por até 999 ms.
  return comoSeFosseUtc - Math.floor(instante.getTime() / 1000) * 1000
}

/**
 * A meia-noite, no fuso do painel, de `deslocamentoDias` dias atrás —
 * devolvida como o instante absoluto correspondente.
 *
 * `inicioDoDiaLocal(0)` é "hoje às 00:00 em Brasília". `inicioDoDiaLocal(6)`
 * abre uma janela de 7 dias de calendário contando o de hoje.
 *
 * As DUAS passadas não são paranoia gratuita: o offset correto é o do instante
 * ALVO, não o de agora. O Brasil não tem horário de verão desde 2019, então
 * hoje as duas passadas dão o mesmo resultado — mas se voltar a ter, a primeira
 * passada erraria em uma hora nos dois dias de transição, e o erro seria
 * invisível. A segunda passada custa uma formatação e remove o problema.
 */
export function inicioDoDiaLocal(deslocamentoDias = 0, agora = new Date()): Date {
  const { ano, mes, dia } = partesEm(agora)
  // `Date.UTC` normaliza dia negativo ou zero sozinho, então virar o mês ou o
  // ano para trás não exige nenhum cuidado extra.
  const alvo = Date.UTC(ano, mes - 1, dia - deslocamentoDias, 0, 0, 0)

  const primeiraPassada = new Date(alvo - offsetMs(agora))
  return new Date(alvo - offsetMs(primeiraPassada))
}
