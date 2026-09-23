"use client"

import { useCallback, useState } from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatarMoeda } from "@/lib/dashboard/format"
import type { ReceitaPorLocal, VisitantesPorLocal } from "@/lib/dashboard/geo"
import {
  calcularEnquadramento,
  casaDestaque,
  type Destaque,
  type Enquadramento,
} from "@/lib/dashboard/geo-fit"
import { RankingChips } from "./ranking-chips"
import { WorldMap } from "./world-map"

/**
 * A tela de Geo inteira, do lado do cliente.
 *
 * É aqui que mora a vista do mapa (centro e zoom), e não dentro do mapa, por um
 * motivo concreto: quem dispara o reenquadramento são os chips, que são irmãos
 * do mapa e não filhos. Com o estado no pai, clicar num chip é só um
 * `setState` dentro de um handler de evento — sem contexto, sem `useEffect` de
 * sincronização, e sem remontar o mapa (o que faria o topojson ser reprocessado
 * e a tela piscar a cada clique).
 */

type Tamanho = { largura: number; altura: number }

export function GeoView({
  visitantes,
  receita,
}: {
  visitantes: VisitantesPorLocal
  receita: ReceitaPorLocal
}) {
  const { pontos } = visitantes

  const [tamanho, setTamanho] = useState<Tamanho | null>(null)
  const [vista, setVista] = useState<Enquadramento | null>(null)
  const [destaque, setDestaque] = useState<Destaque | null>(null)

  /**
   * Chamado pelo ResizeObserver do mapa. O enquadramento inicial é calculado
   * aqui, na primeira medida — antes disso não dá para saber quanto zoom cabe,
   * porque isso depende do formato do card.
   */
  const aoMedir = useCallback(
    (largura: number, altura: number) => {
      setTamanho((atual) =>
        atual && atual.largura === largura && atual.altura === altura
          ? atual
          : { largura, altura }
      )
      setVista((atual) => atual ?? calcularEnquadramento(pontos, largura, altura))
    },
    [pontos]
  )

  function enquadrar(alvo: Destaque | null, medida: Tamanho | null) {
    if (!medida) return

    const selecionados = pontos.filter((p) => casaDestaque(p, alvo))
    // Um recorte sem nenhum ponto no mapa (o local existe nos chips mas o
    // visitante veio sem coordenada) não pode zerar a moldura: mantém a visão
    // de todos os pontos em vez de apontar para lugar nenhum.
    setVista(
      calcularEnquadramento(
        selecionados.length ? selecionados : pontos,
        medida.largura,
        medida.altura
      )
    )
  }

  function selecionar(alvo: Destaque) {
    const mesmo = destaque?.tipo === alvo.tipo && destaque?.valor === alvo.valor
    const proximo = mesmo ? null : alvo

    setDestaque(proximo)
    enquadrar(proximo, tamanho)
  }

  function limparDestaque() {
    setDestaque(null)
    enquadrar(null, tamanho)
  }

  const rotuloDoDestaque = destaque
    ? (destaque.tipo === "pais"
        ? visitantes.paises
        : destaque.tipo === "estado"
          ? visitantes.estados
          : visitantes.cidades
      ).itens.find((item) => item.chave === destaque.valor)?.label ?? destaque.valor
    : null

  const contarVisitantes = (valor: number) => valor.toLocaleString("pt-BR")
  const contarReceita = (valor: number) => formatarMoeda(valor, receita.moeda)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Bloco
        titulo="Visitantes por localização"
        legenda={`${visitantes.comCoordenada.toLocaleString("pt-BR")} de ${visitantes.total.toLocaleString(
          "pt-BR"
        )} ${visitantes.total === 1 ? "visitante aparece" : "visitantes aparecem"} no mapa`}
        acao={
          rotuloDoDestaque ? (
            <button
              type="button"
              onClick={limparDestaque}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs text-muted-foreground transition-colors",
                "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              )}
            >
              <X className="size-3" aria-hidden />
              <span className="max-w-40 truncate">{rotuloDoDestaque}</span>
            </button>
          ) : null
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <RankingChips
            titulo="Países"
            ranking={visitantes.paises}
            formatar={contarVisitantes}
            tipo="pais"
            destaque={destaque}
            onSelecionar={selecionar}
          />
          <RankingChips
            titulo="Estados"
            ranking={visitantes.estados}
            formatar={contarVisitantes}
            tipo="estado"
            destaque={destaque}
            onSelecionar={selecionar}
          />
          <RankingChips
            titulo="Cidades"
            ranking={visitantes.cidades}
            formatar={contarVisitantes}
            tipo="cidade"
            destaque={destaque}
            onSelecionar={selecionar}
          />
        </div>

        <p className="text-[11px] text-muted-foreground">
          Clique num local para o mapa enquadrar nele.
          {visitantes.truncado
            ? " As contagens consideram os 20.000 visitantes mais recentes do período."
            : null}
        </p>
      </Bloco>

      <Bloco
        titulo="Leads por localização"
        legenda={`${visitantes.leads.total.toLocaleString(
          "pt-BR"
        )} ${visitantes.leads.total === 1 ? "lead encontrado" : "leads encontrados"}`}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <RankingChips
            titulo="Países"
            ranking={visitantes.leads.paises}
            formatar={contarVisitantes}
            tipo="pais"
            destaque={destaque}
            onSelecionar={selecionar}
          />
          <RankingChips
            titulo="Estados"
            ranking={visitantes.leads.estados}
            formatar={contarVisitantes}
            tipo="estado"
            destaque={destaque}
            onSelecionar={selecionar}
          />
          <RankingChips
            titulo="Cidades"
            ranking={visitantes.leads.cidades}
            formatar={contarVisitantes}
            tipo="cidade"
            destaque={destaque}
            onSelecionar={selecionar}
          />
        </div>
      </Bloco>

      <Bloco
        titulo="Clientes por localização"
        legenda={`${visitantes.clientes.total.toLocaleString(
          "pt-BR"
        )} ${visitantes.clientes.total === 1 ? "cliente encontrado" : "clientes encontrados"}`}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <RankingChips
            titulo="Países"
            ranking={visitantes.clientes.paises}
            formatar={contarVisitantes}
            tipo="pais"
            destaque={destaque}
            onSelecionar={selecionar}
          />
          <RankingChips
            titulo="Estados"
            ranking={visitantes.clientes.estados}
            formatar={contarVisitantes}
            tipo="estado"
            destaque={destaque}
            onSelecionar={selecionar}
          />
          <RankingChips
            titulo="Cidades"
            ranking={visitantes.clientes.cidades}
            formatar={contarVisitantes}
            tipo="cidade"
            destaque={destaque}
            onSelecionar={selecionar}
          />
        </div>
      </Bloco>

      <Bloco
        titulo="Faturamento por localização"
        legenda={`${formatarMoeda(receita.faturamento, receita.moeda)} em ${receita.aprovadas.toLocaleString(
          "pt-BR"
        )} ${receita.aprovadas === 1 ? "venda aprovada" : "vendas aprovadas"}`}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <RankingChips titulo="Países" ranking={receita.paises} formatar={contarReceita} />
          <RankingChips titulo="Estados" ranking={receita.estados} formatar={contarReceita} />
          <RankingChips titulo="Cidades" ranking={receita.cidades} formatar={contarReceita} />
        </div>

        <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {receita.semLocal.quantidade > 0 ? (
            <p>
              {formatarMoeda(receita.semLocal.valor, receita.moeda)} em{" "}
              {receita.semLocal.quantidade.toLocaleString("pt-BR")}{" "}
              {receita.semLocal.quantidade === 1 ? "venda" : "vendas"} não aparece acima:
              a compra não casou com nenhum visitante, então não tem localização.
            </p>
          ) : null}

          {receita.moedasMultiplas ? (
            <p>
              Este período tem vendas em mais de uma moeda. Os valores acima somam apenas
              as vendas em {receita.moeda} — nada é convertido.
            </p>
          ) : null}

          {receita.truncado ? (
            <p>Os totais consideram as 20.000 vendas mais recentes do período.</p>
          ) : null}
        </div>
      </Bloco>
      </div>

      <div className="relative flex flex-col justify-center overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-3 sm:p-4 shadow-sm">
        <div className="pointer-events-none absolute -top-48 left-1/2 h-96 w-full max-w-2xl -translate-x-1/2 rounded-full bg-primary/10 opacity-50 blur-3xl" />
        <div className="relative z-10 aspect-4/3 w-full sm:aspect-video lg:aspect-2/1">
          <WorldMap
            pontos={pontos}
            destaque={destaque}
            tamanho={tamanho}
            vista={vista}
            onMedida={aoMedir}
            onVista={setVista}
            onReenquadrar={() => enquadrar(destaque, tamanho)}
          />
        </div>
      </div>


    </div>
  )
}

function Bloco({
  titulo,
  legenda,
  acao,
  children,
}: {
  titulo: string
  legenda: string
  acao?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="relative flex flex-col overflow-hidden rounded-3xl border bg-gradient-to-b from-primary/5 to-transparent p-5 sm:p-6 shadow-sm">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-full max-w-xs -translate-x-1/2 rounded-full bg-primary/15 opacity-50 blur-3xl" />
      
      <div className="relative z-10 flex flex-col gap-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{titulo}</h2>
            <p className="text-[13px] text-muted-foreground mt-1">{legenda}</p>
          </div>
          {acao}
        </header>

        {children}
      </div>
    </section>
  )
}
