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
 * - `{ event: "begin_checkout", sessionId, ecommerce }` ao abrir a tela de
 *   pagamento → `InitiateCheckout`, uma vez por sessão do questionário.
 *   Revisto em 2026-10-21: a ponte escutava `add_to_cart`, que a Bask só
 *   empurra na tela de troca de variante do plano — o checkout normal nunca
 *   o dispara, e nenhum InitiateCheckout chegava.
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

  // Primeiro valor preenchido (texto ou numero) entre as fontes e os nomes.
  function first(sources, keys) {
    for (var s = 0; s < sources.length; s++) {
      for (var k = 0; k < keys.length; k++) {
        var v = sources[s] && sources[s][keys[k]]
        if ((typeof v === "string" && v) || (typeof v === "number" && isFinite(v))) return String(v)
      }
    }
    return ""
  }

  // Identificacao: email, telefone e nome lidos POR NOME DE CAMPO em qualquer
  // push (inclusive respostas serializadas em texto), acumulados entre pushes
  // e mandados ao identify ANTES do Lead. Sem isto o visitante do questionario
  // so ganhava PII na tela de obrigado, e os eventos da fila saiam anonimos.
  // So estes 4 valores saem; o resto do payload (dado de saude) nunca.
  var TRAIT_KEYS = {
    email: ["email", "emailaddress", "useremail", "patientemail"],
    phone: ["phone", "phonenumber", "mobile", "mobilephone", "cellphone", "telephone"],
    first_name: ["firstname", "fname", "givenname"],
    last_name: ["lastname", "lname", "surname", "familyname"]
  }
  var LABEL_FIELDS = ["name", "key", "id", "slug", "label", "question", "field"]
  var VALUE_FIELDS = ["value", "answer", "response"]
  var EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/
  var traits = {}
  var lastIdentified = ""

  function norm(key) { return String(key).toLowerCase().replace(/[^a-z]/g, "") }

  function traitOf(key) {
    var k = norm(key)
    for (var t in TRAIT_KEYS) if (TRAIT_KEYS[t].indexOf(k) !== -1) return t
    return ""
  }

  function keep(trait, value) {
    if (typeof value === "number" && trait === "phone") value = String(value)
    if (typeof value !== "string") return
    value = value.trim()
    if (!value || value.length > 100) return
    if (trait === "email" && !EMAIL_RE.test(value)) return
    if (trait === "phone" && !/^[+\\d\\s().-]{8,20}$/.test(value)) return
    traits[trait] = value
  }

  function scan(node, depth) {
    if (depth > 5 || node == null) return
    if (typeof node === "string") {
      var s = node.trim()
      if (s.length < 20000 && (s.charAt(0) === "{" || s.charAt(0) === "[")) {
        try { scan(JSON.parse(s), depth + 1) } catch (e) {}
      }
      return
    }
    if (typeof node !== "object") return

    // Resposta no formato { name: "email", value: "..." }
    for (var l = 0; l < LABEL_FIELDS.length; l++) {
      var label = node[LABEL_FIELDS[l]]
      var labelTrait = typeof label === "string" ? traitOf(label) : ""
      if (!labelTrait) continue
      for (var v = 0; v < VALUE_FIELDS.length; v++) keep(labelTrait, node[VALUE_FIELDS[v]])
    }

    for (var key in node) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue
      var trait = traitOf(key)
      if (trait) keep(trait, node[key])
      else if (node[key] && (typeof node[key] === "object" || typeof node[key] === "string")) {
        scan(node[key], depth + 1)
      }
    }
  }

  function identifyIfReady() {
    if (!traits.email && !traits.phone) return
    var fingerprint = JSON.stringify(traits)
    if (fingerprint === lastIdentified) return
    lastIdentified = fingerprint
    var copy = {}
    for (var t in traits) copy[t] = traits[t]
    withTracker(function (tracker) { tracker.identify(copy) })
  }

  var sent = {}

  function handle(item) {
    if (!item || typeof item !== "object") return

    scan(item, 0)
    identifyIfReady()

    // gtag() empurra um objeto arguments: ["event", nome, params]
    if (item[0] === "event" && item[1] === "signup") {
      if (sent.lead) return
      sent.lead = true
      withTracker(function (tracker) { tracker.track("Lead") })
      return
    }

    if (item.event === "begin_checkout" && item.ecommerce) {
      var checkoutKey = "checkout:" + (item.sessionId || item.sessionUUID || "")
      if (sent[checkoutKey]) return
      sent[checkoutKey] = true
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
      // Id do paciente na Bask: e o unico elo com o webhook de pagamento, que
      // nao traz email. Nome do campo nao confirmado, por isso a lista.
      var patientId = first([ecommerce, item, ecommerce.user || {}, item.user || {}],
        ["patientId", "patient_id", "userId", "user_id", "customerId", "customer_id"])
      if (patientId) data.patient_id = patientId
      // O identify com os dados do purchase ja saiu no scan() do topo.
      withTracker(function (tracker) { tracker.track("SubmitApplication", data) })
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
