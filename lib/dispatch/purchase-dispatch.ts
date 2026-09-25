import "server-only"

import {
  hashCity,
  hashCountry,
  hashEmail,
  hashExternalId,
  hashName,
  hashPhone,
  hashState,
  hashZip,
} from "@/lib/crypto/hash"
import { sendToAllGa4 } from "@/lib/ga4/mp"
import { sendToAllPixels } from "@/lib/meta/capi"
import { getDispatchConfig } from "@/lib/settings/dispatch-config"
import { createServiceClient } from "@/lib/supabase/service"
import { obterPaisDaMoeda } from "@/lib/webhooks/adapters"
import type { NormalizedPurchase } from "@/lib/webhooks/adapters/types"

/**
 * Dispara o Purchase para o Meta e para o GA4 e grava a resposta dos dois.
 *
 * Aqui — diferente do evento de navegador — o GA4 ENTRA. Esta é exatamente a
 * conversão que nasce fora do navegador, que é o caso de uso do Measurement
 * Protocol: a gtag não tem como saber da compra, porque ela acontece no
 * servidor da plataforma de venda. Não há duplicação, há complemento.
 *
 * Só é chamado quando a venda está aprovada E ainda não foi disparada antes
 * (a trava de idempotência fica no route handler). "Aprovada" aqui é sempre
 * PAGAMENTO CONFIRMADO: pedido criado, boleto gerado ou cartão só autorizado
 * nunca chegam a esta função — ver a diretriz no CLAUDE.md.
 */

export type PurchaseDispatchParams = {
  purchase: NormalizedPurchase
  /** event_id determinístico, derivado do transaction_id. */
  eventId: string
  visitor: Record<string, unknown> | null
}

/**
 * A linha do visitante vem do Supabase sem tipos gerados, então cada campo é
 * `unknown`. Este helper é o único ponto que converte, em vez de espalhar
 * `as string` pelo arquivo.
 */
function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

export async function dispatchPurchase(
  params: PurchaseDispatchParams
): Promise<void> {
  const { purchase, eventId, visitor } = params
  const supabase = createServiceClient()

  // A venda casada por email ou telefone não traz trck_user_id no payload,
  // mas o visitante casado tem — e é esse id que o navegador manda como
  // external_id desde o PageView. Usar só o do payload deixava a venda sem
  // external_id no Meta e fora da tela de Eventos justamente quando o vínculo
  // veio pelo email (o caso normal na Bask, onde o checkout não repassa o id).
  const trckUserId = purchase.trckUserId ?? asString(visitor?.trck_user_id)

  const { metaResult, ga4Result, gaClientId } = await sendServerConversion({
    purchase,
    eventId,
    visitor,
    trckUserId,
    metaEventName: "Purchase",
    ga4EventName: "purchase",
  })

  await supabase
    .from("purchases")
    .update({
      response_meta: metaResult.results,
      response_ga4: ga4Result.results,
      ga_client_id: gaClientId,
    })
    .eq("transaction_id", purchase.transactionId)

  // Registra também em events_log, pra a compra aparecer no funil e na tela
  // de Eventos junto com o resto da jornada.
  if (trckUserId) {
    await supabase.from("events_log").upsert(
      {
        trck_user_id: trckUserId,
        event_name: "Purchase",
        event_id: eventId,
        utm_source: purchase.utmSource,
        utm_medium: purchase.utmMedium,
        utm_campaign: purchase.utmCampaign,
        utm_term: purchase.utmTerm,
        utm_content: purchase.utmContent,
        payload_meta: metaResult.payload,
        response_meta: metaResult.results,
        payload_ga4: ga4Result.payload,
        response_ga4: ga4Result.results,
      },
      { onConflict: "event_id", ignoreDuplicates: true }
    )
  }
}

type ServerConversionInput = PurchaseDispatchParams & {
  trckUserId: string | null
  metaEventName: string
  ga4EventName: string
}

/**
 * Monta e manda UMA conversão de servidor (nascida de um webhook, não do
 * navegador) para todos os pixels e todas as propriedades GA4 ativas.
 *
 * Separada do `dispatchPurchase` porque nem toda conversão do webhook é
 * Purchase: o pedido enviado e ainda não cobrado (o `newOrder` da Bask) vai
 * como outro evento, com o mesmo casamento de visitante e os mesmos hashes.
 * Quem decide o nome do evento e onde gravar o resultado é quem chama.
 */
async function sendServerConversion(input: ServerConversionInput) {
  const { purchase, eventId, visitor, trckUserId } = input

  const config = await getDispatchConfig()

  // Produto de plataforma de saúde é o medicamento: fica no painel, não vai
  // para anúncio. Ver `omitProductFromAds` em lib/webhooks/adapters/types.ts.
  const productId = purchase.omitProductFromAds ? null : purchase.productId
  const productName = purchase.omitProductFromAds ? null : purchase.productName

  // Dados do comprador vindos da plataforma valem mais que os do visitante:
  // são o que ele digitou no checkout, confirmados pelo pagamento.
  const emailHash =
    hashEmail(purchase.buyerEmail) ?? asString(visitor?.email_hash)
  const phoneHash =
    hashPhone(purchase.buyerPhone, obterPaisDaMoeda(purchase.currency)) ??
    asString(visitor?.phone_hash)

  // GA4: reusa o client_id e o session_id capturados na visita, pra a compra
  // cair na sessão certa em vez de virar tráfego direto órfão.
  const gaClientId = asString(visitor?.ga_client_id)

  // Meta e GA4 são independentes: em paralelo, o tempo total é o do mais lento
  // em vez da soma dos dois. Importa porque isto roda dentro do orçamento de
  // tempo da função serverless.
  const [metaResult, ga4Result] = await Promise.all([
    sendToAllPixels({
      eventName: input.metaEventName,
      eventId,
      eventTime: Math.floor(Date.now() / 1000),
      actionSource: "website",
      testEventCode: config.testEventCode,
      customData: {
        value: purchase.amount,
        currency: purchase.currency,
        contentIds: productId ? [productId] : null,
        contentName: productName,
        contentType: productId ? "product" : null,
        orderId: purchase.transactionId,
      },
      userData: {
        emailHash,
        phoneHash,
        firstNameHash:
          hashName(purchase.buyerFirstName) ??
          asString(visitor?.first_name_hash),
        lastNameHash:
          hashName(purchase.buyerLastName) ?? asString(visitor?.last_name_hash),
        cityHash: hashCity(asString(visitor?.geo_city)),
        stateHash: hashState(asString(visitor?.geo_region)),
        // CEP do checkout na frente do derivado de IP, pela mesma razão do
        // email e do telefone: um é o que a pessoa digitou, o outro é a área do
        // provedor de internet dela.
        // O país só decide a regra dos 5 dígitos dos EUA; nenhuma plataforma
        // usada aqui manda país, então o do visitante é a única pista, e a
        // ausência dele já cai no comportamento certo para o Brasil (CEP
        // inteiro).
        zipHash: hashZip(
          purchase.buyerPostalCode ?? asString(visitor?.geo_postal_code),
          asString(visitor?.geo_country)
        ),
        countryHash: hashCountry(asString(visitor?.geo_country)),
        externalIdHash: trckUserId ? hashExternalId(trckUserId) : null,
        // Texto puro. Sem visitante casado, estes vêm vazios e a
        // correspondência cai — é o preço de não ter conseguido vincular a
        // venda à visita.
        fbp: asString(visitor?.fbp),
        fbc: asString(visitor?.fbc),
        clientIpAddress: asString(visitor?.ip),
        clientUserAgent: asString(visitor?.user_agent),
      },
    }),
    sendToAllGa4({
      clientId: gaClientId ?? "",
      eventName: input.ga4EventName,
      sessionId: asString(visitor?.ga_session_id),
      // Sem isto o GA4 geolocaliza a venda no datacenter da Vercel, porque é
      // deste servidor que a chamada parte. Ver a nota no topo de lib/ga4/mp.ts.
      ipOverride: asString(visitor?.ip),
      value: purchase.amount,
      currency: purchase.currency,
      transactionId: purchase.transactionId,
      items: productId
        ? [
            {
              itemId: productId,
              itemName: productName,
              price: purchase.amount,
              quantity: 1,
            },
          ]
        : null,
    }),
  ])

  return { metaResult, ga4Result, gaClientId }
}
