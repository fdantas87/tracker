/**
 * Ponte entre o questionário da Bask e o track.js.
 *
 * Gera o código que o cliente cola no GTM (tag HTML personalizada) ou no
 * Global JavaScript do questionário. Ele carrega o track.js do tracker deste
 * deploy e traduz os eventos que a Bask empurra no `dataLayer` em eventos do
 * tracker.
 *
 * O que a Bask empurra, lido no bundle do questionário em 2026-09-24:
 * - `gtag("event", "signup")` quando o paciente cria a conta ou entra nela
 *   → `Lead`
 * - `{ event: "add_to_cart", ecommerce }` ao escolher o plano no checkout
 *   → `InitiateCheckout`, uma vez por página
 * - `{ event: "purchase", ecommerce }` na tela de obrigado → `SubmitApplication`,
 *   NUNCA `Purchase`: é o checkout enviado, não o pagamento confirmado — o
 *   cartão pode estar só autorizado, esperando o médico. Purchase só vem do
 *   webhook `paymentSucceeded` (diretriz em CLAUDE.md, "Convenções → Código").
 *
 * O `dataLayer` da Bask carrega dado de saúde: respostas do questionário
 * (`the_basics`, `input_group` levam a resposta inteira serializada), o nome do
 * medicamento nos `items` e os dados do paciente mesclados no `purchase`. Por
 * isso a ponte lê campos por nome — valor, moeda, id da transação e
 * email/telefone/nome para o identify — e NUNCA repassa o payload. Evento que
 * não está na lista é ignorado.
 *
 * Sem `server-only`: o texto é exibido num Client Component.
 */
export function baskBridgeSnippet(trackerOrigin: string): string {
  const trackSrc = `${trackerOrigin.replace(/\/+$/, "")}/track.js`

  // ES5 de propósito: validador de tag de GTM antigo recusa const/arrow.
  return `(function () {
  if (window.__thetrackBask) return
  window.__thetrackBask = true

  var TRACK_SRC = ${JSON.stringify(trackSrc)}
  if (!document.querySelector('script[src="' + TRACK_SRC + '"]')) {
    var tag = document.createElement("script")
    tag.src = TRACK_SRC
    tag.defer = true
    document.head.appendChild(tag)
  }

  // O track.js cria window.thetrack ao executar; ate la, espera (teto de 15 s).
  function withTracker(fn) {
    if (window.thetrack) return fn(window.thetrack)
    var tries = 0
    var timer = setInterval(function () {
      if (window.thetrack) {
        clearInterval(timer)
        fn(window.thetrack)
      } else if (++tries > 150) {
        clearInterval(timer)
      }
    }, 100)
  }

  // So valor, moeda e id da transacao. Os items (o medicamento) nunca saem.
  function money(ecommerce) {
    var out = {}
    var value = Number(ecommerce && ecommerce.value)
    if (isFinite(value) && value > 0) {
      out.value = value
      out.currency = typeof ecommerce.currency === "string" ? ecommerce.currency : "USD"
    }
    return out
  }

  var sent = {}

  function handle(item) {
    if (!item || typeof item !== "object") return

    // gtag() empurra um objeto arguments: ["event", nome, params]
    if (item[0] === "event" && item[1] === "signup") {
      if (sent.lead) return
      sent.lead = true
      withTracker(function (tracker) { tracker.track("Lead") })
      return
    }

    if (item.event === "add_to_cart" && item.ecommerce) {
      if (sent.checkout) return
      sent.checkout = true
      var checkout = money(item.ecommerce)
      withTracker(function (tracker) { tracker.track("InitiateCheckout", checkout) })
      return
    }

    if (item.event === "purchase" && item.ecommerce) {
      var ecommerce = item.ecommerce
      var orderId = ecommerce.transaction_id ? String(ecommerce.transaction_id) : ""
      if (sent["order:" + orderId]) return
      sent["order:" + orderId] = true

      var data = money(ecommerce)
      if (orderId) data.order_id = orderId
      var traits = {
        email: ecommerce.email,
        phone: ecommerce.phone,
        first_name: ecommerce.firstName || ecommerce.first_name,
        last_name: ecommerce.lastName || ecommerce.last_name
      }
      withTracker(function (tracker) {
        tracker.identify(traits)
        tracker.track("SubmitApplication", data)
      })
    }
  }

  function safe(item) {
    try { handle(item) } catch (e) {}
  }

  var dataLayer = (window.dataLayer = window.dataLayer || [])
  for (var i = 0; i < dataLayer.length; i++) safe(dataLayer[i])

  var push = dataLayer.push
  dataLayer.push = function () {
    for (var j = 0; j < arguments.length; j++) safe(arguments[j])
    return push.apply(dataLayer, arguments)
  }
})()`
}
