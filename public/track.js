/**
 * Negou Tracking — script de captura.
 *
 * Como usar, em qualquer site do grupo:
 *   <script src="https://tracking.negou.net/track.js" defer></script>
 *
 * O que ele faz sozinho:
 * - resolve o trck_user_id (URL > cookie > localStorage > gera um novo)
 * - carrega a gtag do GA4 e o Pixel do Meta com os IDs vindos do painel
 *   (nada hardcoded aqui)
 * - manda o visitante pro /api/identify
 * - dispara PageView
 * - decora links de checkout e WhatsApp com o trck_user_id
 *
 * O que ele expõe:
 *   negou.track("InitiateCheckout", { value: 97, currency: "BRL" })
 *   negou.identify({ email: "...", phone: "...", first_name: "..." })
 *   negou.decorate("https://checkout...")   -> url com trck_user_id
 *   negou.id()                              -> trck_user_id atual
 *
 * DECISÃO IMPORTANTE (dedup): o event_id nasce AQUI, no navegador, e é usado
 * ao mesmo tempo no fbq e na chamada ao nosso servidor. É isso que deixa o
 * Meta entender que o evento do Pixel e o da Conversions API são o mesmo, em
 * vez de contar dois. O servidor nunca inventa event_id.
 *
 * DISPARO ATRASADO (fase 7.5). No momento do PageView não se sabe quem é a
 * pessoa. O email/telefone só aparecem quando ela converte, e aí o evento já
 * teria ido — o Meta não deixa atualizar evento recebido. Por isso o servidor
 * segura o evento numa fila por alguns minutos e só então envia, já com os
 * dados que a conversão trouxe.
 *
 * Só que a doc do Meta é explícita: dois eventos com o mesmo event_id dentro
 * de 48h -> "we discard the subsequent events", e "we generally prefer the
 * event that is received first". Ou seja, se o pixel daqui disparar na hora, é
 * o evento ENRIQUECIDO que o Meta joga fora. Então, quando o evento vai pra
 * fila, este script NÃO chama fbq('track'): existe uma fonte só, e não existe
 * conflito de dedup. Quando a pessoa já está identificada não há o que
 * esperar, e aí os dois disparam juntos como sempre.
 *
 * Quem manda nessa escolha é o modo configurado no painel
 * (adaptive | server_only | hybrid), que chega pelo /api/config/public.
 */
(function () {
  "use strict"

  // ---------------------------------------------------------------------
  // Configuração
  // ---------------------------------------------------------------------

  var COOKIE_NAME = "negou_tuid"
  var STORAGE_KEY = "negou_tuid"
  var URL_PARAM = "tuid"
  var COOKIE_DAYS = 365

  /**
   * Quanto o primeiro evento espera pelo /api/identify.
   *
   * Esperar tem valor real: o identify é quem grava fbp/fbc/geo do visitante,
   * e sem isso o PageView é enviado lendo uma linha incompleta. Mas captura
   * não pode ficar presa à rede, então o teto é curto e o pagehide (abaixo)
   * cobre quem sai antes disso.
   */
  var IDENTIFY_WAIT_MS = 800

  /** Teto de chamadas de identify por página, contra formulário em loop. */
  var MAX_IDENTIFY_PER_PAGE = 5

  /** Usado tanto pelo negou.identify() quanto pelo farejador de formulário. */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

  // A base da API sai do src deste próprio script, então o mesmo arquivo
  // funciona em qualquer ambiente sem precisar editar nada.
  var scriptEl = document.currentScript
  var API_BASE = (function () {
    try {
      return new URL(scriptEl.src).origin
    } catch {
      return "https://tracking.negou.net"
    }
  })()

  // Domínios cujos links recebem o trck_user_id automaticamente.
  var CHECKOUT_HOSTS = ["pay.perfectpay.com.br", "go.perfectpay.com.br"]
  var WHATSAPP_HOSTS = ["wa.me", "api.whatsapp.com", "web.whatsapp.com"]

  // ---------------------------------------------------------------------
  // Utilidades de cookie / storage
  // ---------------------------------------------------------------------

  function getCookie(name) {
    var match = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)")
    )
    return match ? decodeURIComponent(match[1]) : null
  }

  /**
   * Grava no domínio registrável (.negou.net) pra o mesmo visitante ser
   * reconhecido em lp., quiz., blog. etc. sem depender de cookie de terceiro.
   */
  function rootDomain() {
    var parts = location.hostname.split(".")
    if (parts.length < 2) return location.hostname
    return "." + parts.slice(-2).join(".")
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString()
    var base =
      name + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/; SameSite=Lax"
    if (location.protocol === "https:") base += "; Secure"

    try {
      document.cookie = base + "; domain=" + rootDomain()
    } catch {
      document.cookie = base
    }
  }

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      /* modo privado ou storage bloqueado: o cookie já cobre */
    }
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID()
    }
    // Fallback pra navegador antigo / contexto não seguro.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0
      var v = c === "x" ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  function param(name) {
    try {
      return new URLSearchParams(location.search).get(name)
    } catch {
      return null
    }
  }

  // ---------------------------------------------------------------------
  // Identidade do visitante
  // ---------------------------------------------------------------------

  /**
   * Ordem importa: a URL vem primeiro porque é assim que a identidade
   * atravessa domínios (link de checkout, link de WhatsApp). Se o visitante
   * chegou com um id na URL, ele manda no que estava guardado aqui.
   */
  function resolveId() {
    var fromUrl = param(URL_PARAM) || param("trck_user_id")
    if (fromUrl) {
      setCookie(COOKIE_NAME, fromUrl, COOKIE_DAYS)
      storageSet(STORAGE_KEY, fromUrl)
      return fromUrl
    }

    var existing = getCookie(COOKIE_NAME) || storageGet(STORAGE_KEY)
    if (existing) {
      // Reescreve pra renovar a validade e cobrir o caso de o cookie ter
      // sumido mas o localStorage ter sobrevivido (ou vice-versa).
      setCookie(COOKIE_NAME, existing, COOKIE_DAYS)
      storageSet(STORAGE_KEY, existing)
      return existing
    }

    var created = uuid()
    setCookie(COOKIE_NAME, created, COOKIE_DAYS)
    storageSet(STORAGE_KEY, created)
    return created
  }

  var trckUserId = resolveId()

  // ---------------------------------------------------------------------
  // Cookies do Meta e do GA4
  // ---------------------------------------------------------------------

  function getFbp() {
    return getCookie("_fbp")
  }

  /**
   * Garante que o _fbp exista, gerando um se preciso ANTES de carregar o
   * fbevents.js.
   *
   * Dois motivos. Primeiro: com o fbq('track') suprimido (modo adaptativo com
   * visitante anônimo, ou server_only), não dá pra contar que o script do Meta
   * grave o cookie — e o _fbp é um dos parâmetros de correspondência que mais
   * pesam. Segundo: quem bloqueia o fbevents.js por extensão nunca teria _fbp
   * nenhum, e a Conversions API é justamente o caminho que sobrevive a isso.
   *
   * Gravar ANTES de carregar o pixel é o que evita o pior caso: o fbevents
   * encontra o cookie pronto e reaproveita, em vez de criar um segundo valor.
   * Dois _fbp diferentes pro mesmo navegador derrubariam a correspondência.
   *
   * Formato exigido: fb.<subdominios>.<timestamp_ms>.<aleatorio>
   */
  function ensureFbp() {
    var existing = getCookie("_fbp")
    if (existing) return existing

    var random = String(Math.floor(Math.random() * 1e10))
    var value = "fb.1." + Date.now() + "." + random
    setCookie("_fbp", value, COOKIE_DAYS)
    return value
  }

  /**
   * Se o visitante chegou por anúncio, a URL traz fbclid. Quando o Pixel
   * ainda não gravou o _fbc, montamos no formato que o Meta espera:
   * fb.<subdominios>.<timestamp>.<fbclid>
   */
  function getFbc() {
    var cookie = getCookie("_fbc")
    if (cookie) return cookie

    var fbclid = param("fbclid")
    if (!fbclid) return null
    return "fb.1." + Date.now() + "." + fbclid
  }

  /** _ga = "GA1.1.<parte1>.<parte2>"; o client_id é "<parte1>.<parte2>". */
  function getGaClientId() {
    var raw = getCookie("_ga")
    if (!raw) return null
    var parts = raw.split(".")
    if (parts.length < 4) return null
    return parts[2] + "." + parts[3]
  }

  /**
   * A sessão fica em _ga_<ID> e tem dois formatos em circulação:
   *   GS1.1.<session_id>.<session_number>...
   *   GS2.1.s<session_id>$o<session_number>$...
   * Lemos os dois; se não der pra ler, seguimos sem — sessão é enriquecimento.
   */
  function getGaSession(measurementIds) {
    for (var i = 0; i < measurementIds.length; i++) {
      var suffix = String(measurementIds[i]).replace(/^G-/, "")
      var raw = getCookie("_ga_" + suffix)
      if (!raw) continue

      if (raw.indexOf("$") !== -1) {
        var sessionId = raw.match(/s(\d+)/)
        var sessionNumber = raw.match(/\$o(\d+)/)
        if (sessionId) {
          return {
            id: sessionId[1],
            number: sessionNumber ? Number(sessionNumber[1]) : null,
          }
        }
        continue
      }

      var pieces = raw.split(".")
      if (pieces.length >= 4) {
        return { id: pieces[2], number: Number(pieces[3]) || null }
      }
    }
    return { id: null, number: null }
  }

  function getUtms() {
    var out = {}
    var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
    for (var i = 0; i < keys.length; i++) {
      var value = param(keys[i])
      if (value) out[keys[i]] = value
    }
    return out
  }

  // ---------------------------------------------------------------------
  // Envio
  // ---------------------------------------------------------------------

  /**
   * keepalive é essencial: o InitiateCheckout dispara um instante antes de o
   * navegador sair da página. Sem isso a requisição é cancelada no meio e o
   * evento se perde justo no passo mais valioso do funil.
   */
  function post(path, payload) {
    try {
      return fetch(API_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        mode: "cors",
      }).catch(function () {})
    } catch {
      return Promise.resolve()
    }
  }

  /**
   * Igual ao post(), mas devolvendo o corpo já lido.
   *
   * Necessário desde a fase 7.5: o /api/identify responde se o visitante já
   * tem dado pessoal, e é isso que decide se o pixel do navegador dispara.
   * Falha de rede vira null, e quem chama trata como "não sei".
   */
  function postJson(path, payload) {
    return post(path, payload).then(function (response) {
      if (!response || !response.ok) return null
      return response.json().catch(function () {
        return null
      })
    })
  }

  // ---------------------------------------------------------------------
  // Carregamento dinâmico de gtag e fbq
  // ---------------------------------------------------------------------

  function loadGtag(measurementIds) {
    if (!measurementIds.length) return

    window.dataLayer = window.dataLayer || []
    window.gtag =
      window.gtag ||
      function () {
        window.dataLayer.push(arguments)
      }

    var script = document.createElement("script")
    script.async = true
    script.src =
      "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementIds[0])
    document.head.appendChild(script)

    window.gtag("js", new Date())
    for (var i = 0; i < measurementIds.length; i++) {
      // cookie_domain 'auto' faz o _ga ficar em .negou.net, então o mesmo
      // client_id vale em todos os subdomínios.
      window.gtag("config", measurementIds[i], { cookie_domain: "auto" })
    }
  }

  function loadPixel(pixelIds) {
    if (!pixelIds.length) return

    if (!window.fbq) {
      /* eslint-disable */
      !(function (f, b, e, v, n, t, s) {
        if (f.fbq) return
        n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
        }
        if (!f._fbq) f._fbq = n
        n.push = n
        n.loaded = !0
        n.version = "2.0"
        n.queue = []
        t = b.createElement(e)
        t.async = !0
        t.src = v
        s = b.getElementsByTagName(e)[0]
        s.parentNode.insertBefore(t, s)
      })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js")
      /* eslint-enable */
    }

    for (var i = 0; i < pixelIds.length; i++) {
      window.fbq("init", pixelIds[i], { external_id: trckUserId })
    }
  }

  // ---------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------

  var state = {
    pixels: [],
    ga4: [],
    ready: false,
    /** adaptive | server_only | hybrid — vem do painel. */
    mode: "adaptive",
    /** Eventos que nunca são atrasados (e por isso sempre disparam o pixel). */
    neverDelay: [],
    forms: false,
    /** O servidor já tem email ou telefone deste visitante? */
    identified: false,
  }

  var identifyPromise = null
  var identifyCount = 0
  var lastTraits = null
  var buffer = []
  var leaving = false

  /**
   * O corpo comum do /api/identify: cookies do Meta e do GA, UTMs e referrer.
   * Fica numa função só pra o boot e o identify() nunca divergirem.
   */
  function visitorPayload(traits) {
    var session = getGaSession(state.ga4)
    var utms = getUtms()
    var payload = {
      trck_user_id: trckUserId,
      fbp: getFbp(),
      fbc: getFbc(),
      ga_client_id: getGaClientId(),
      ga_session_id: session.id,
      ga_session_number: session.number,
      referrer: document.referrer || null,
      utm_source: utms.utm_source || null,
      utm_medium: utms.utm_medium || null,
      utm_campaign: utms.utm_campaign || null,
      utm_term: utms.utm_term || null,
      utm_content: utms.utm_content || null,
    }

    if (traits) {
      if (traits.email) payload.email = traits.email
      if (traits.phone) payload.phone = traits.phone
      if (traits.first_name) payload.first_name = traits.first_name
      if (traits.last_name) payload.last_name = traits.last_name
    }
    return payload
  }

  function normalizeTraits(traits) {
    if (!traits || typeof traits !== "object") return null

    var out = {}
    if (typeof traits.email === "string" && EMAIL_RE.test(traits.email.trim())) {
      out.email = traits.email.trim()
    }
    if (traits.phone != null) {
      var digits = String(traits.phone).replace(/\D/g, "")
      if (digits.length >= 8 && digits.length <= 15) out.phone = digits
    }
    if (typeof traits.first_name === "string" && traits.first_name.trim()) {
      out.first_name = traits.first_name.trim().slice(0, 60)
    }
    if (typeof traits.last_name === "string" && traits.last_name.trim()) {
      out.last_name = traits.last_name.trim().slice(0, 60)
    }

    // Sem email nem telefone não vale uma requisição: nome sozinho quase não
    // move a correspondência no Meta.
    return out.email || out.phone ? out : null
  }

  /**
   * negou.identify({ email, phone, first_name, last_name })
   *
   * Caminho PRINCIPAL de enriquecimento: a estrutura do site chama isto com os
   * dados do próprio formulário. O farejador de formulário (abaixo) é só a
   * rede de segurança pra quando ninguém chamou.
   *
   * É isto que faz o disparo atrasado valer a pena: o servidor grava a PII no
   * visitante e libera a fila, então o PageView que estava esperando sai
   * carregando email e telefone.
   */
  function identify(traits) {
    var payload = normalizeTraits(traits)
    if (!payload) return Promise.resolve(null)

    // Vários hooks podem disparar no mesmo envio de formulário. A impressão
    // digital fica só em memória: hash de telefone é curto o bastante pra ser
    // quebrado por força bruta, e não há nada a ganhar guardando em disco.
    var fingerprint = JSON.stringify(payload)
    if (fingerprint === lastTraits) return Promise.resolve(null)
    if (identifyCount >= MAX_IDENTIFY_PER_PAGE) return Promise.resolve(null)
    lastTraits = fingerprint
    identifyCount++

    // Otimista: daqui pra frente o servidor TEM a PII, então os próximos
    // eventos já podem disparar o pixel na hora — não há mais o que esperar.
    state.identified = true

    identifyPromise = postJson("/api/identify", visitorPayload(payload)).then(
      function (result) {
        if (result && typeof result.identified === "boolean") {
          state.identified = result.identified
        }
        return result
      }
    )
    return identifyPromise
  }

  /**
   * O primeiro evento espera o identify, com teto.
   *
   * Sem isso, o PageView chega ao servidor antes de fbp/fbc/geo serem
   * gravados, e o disparo lê uma linha de visitante pela metade — defeito que
   * já existia antes desta fase.
   */
  function waitForIdentify() {
    if (!identifyPromise || leaving) return Promise.resolve()
    return Promise.race([
      identifyPromise,
      new Promise(function (resolve) {
        setTimeout(resolve, IDENTIFY_WAIT_MS)
      }),
    ])
  }

  /**
   * Dispara ou não o pixel do navegador para este evento.
   *
   * A regra do Meta (ver o cabeçalho do arquivo): o segundo evento com o mesmo
   * event_id é descartado, e ele prefere o que chegou primeiro. Então disparar
   * o pixel agora significa abrir mão do evento enriquecido que viria depois.
   * Só vale quando não há enriquecimento a esperar.
   */
  function pixelDecision(eventName) {
    if (state.mode === "server_only") return false
    if (state.mode === "hybrid") return true
    if (state.identified) return true
    if (state.neverDelay.indexOf(eventName) !== -1) return true
    return false
  }

  function firePixel(eventName, data, eventId) {
    if (!window.fbq) return false
    try {
      window.fbq("track", eventName, data, { eventID: eventId })
      return true
    } catch {
      return false
    }
  }

  function bufferEvent(eventName, params) {
    buffer.push({ name: eventName, params: params })
    return Promise.resolve(null)
  }

  function drainBuffer() {
    var items = buffer.splice(0, buffer.length)
    for (var i = 0; i < items.length; i++) {
      track(items[i].name, items[i].params)
    }
  }

  function track(eventName, params) {
    // A inicialização virou assíncrona (espera a config e o identify), então
    // um track() chamado cedo demais precisa ser guardado — antes ele sumia
    // em silêncio.
    if (!state.ready) return bufferEvent(eventName, params)

    var eventId = uuid()
    var data = params || {}
    var utms = getUtms()
    var pixelFired = pixelDecision(eventName) && firePixel(eventName, data, eventId)

    var body = {
      event_id: eventId,
      event_name: eventName,
      trck_user_id: trckUserId,
      event_source_url: location.href,
      // O instante REAL do evento. Com a fila, o envio pode acontecer 15
      // minutos depois, e sem isto o Meta receberia a hora do envio — jogando
      // a atribuição pra frente.
      event_time: Date.now(),
      // Diz ao servidor se já existe um evento igual a caminho do Meta pelo
      // navegador. Se existe, atrasar a Conversions API garantiria a perda.
      pixel_fired: pixelFired,
      custom_data: data,
      utm_source: utms.utm_source || null,
      utm_medium: utms.utm_medium || null,
      utm_campaign: utms.utm_campaign || null,
      utm_term: utms.utm_term || null,
      utm_content: utms.utm_content || null,
    }

    // Quem está saindo da página não espera nada: o keepalive garante que a
    // requisição sobreviva, mas ela precisa SER FEITA agora.
    if (leaving) return post("/api/event", body)

    return waitForIdentify().then(function () {
      return post("/api/event", body)
    })
  }

  /** Acrescenta o trck_user_id numa URL, preservando o que já existe nela. */
  function decorate(rawUrl) {
    try {
      var url = new URL(rawUrl, location.href)
      url.searchParams.set(URL_PARAM, trckUserId)
      return url.toString()
    } catch {
      return rawUrl
    }
  }

  /**
   * O cross-domain deste sistema é por URL, não por cookie de terceiro. Então
   * todo link que leva pra fora (checkout, WhatsApp) precisa carregar o id —
   * é isso que deixa a compra ser casada com a visita lá na frente.
   */
  function decorateLinks() {
    var links = document.querySelectorAll("a[href]")
    for (var i = 0; i < links.length; i++) {
      var link = links[i]
      var href = link.getAttribute("href")
      if (!href) continue

      try {
        var url = new URL(href, location.href)
        var isCheckout = CHECKOUT_HOSTS.indexOf(url.hostname) !== -1
        var isWhats = WHATSAPP_HOSTS.indexOf(url.hostname) !== -1
        if (!isCheckout && !isWhats) continue

        if (isWhats) {
          // No WhatsApp o id vai dentro do texto da mensagem: é o único
          // campo que chega do outro lado pra gente.
          var text = url.searchParams.get("text") || ""
          if (text.indexOf(trckUserId) === -1) {
            url.searchParams.set("text", text + " [" + trckUserId + "]")
          }
        } else {
          // O PerfectPay NÃO repassa parâmetro arbitrário pro webhook: só
          // `src` e as utm_*. Então o id tem que viajar em `src`, senão a
          // compra chega sem vínculo com a visita.
          //
          // Se o link já traz `src` (uso próprio pra origem/afiliado), a gente
          // não sobrescreve — estragaria o relatório de quem montou o link. Aí
          // a vinculação cai pro email, que é o plano B do webhook.
          if (!url.searchParams.get("src")) {
            url.searchParams.set("src", trckUserId)
          }
          // Mantido também como `tuid` pra plataformas que repassam
          // parâmetros livres (usado por adaptadores futuros).
          url.searchParams.set(URL_PARAM, trckUserId)
        }

        link.setAttribute("href", url.toString())
      } catch {}
    }
  }

  // ---------------------------------------------------------------------
  // Captura de formulário (rede de segurança do identify)
  // ---------------------------------------------------------------------

  /**
   * O caminho certo é o site chamar negou.identify() com os dados que ele já
   * tem. Isto aqui é pra quando ninguém chamou: lê email/telefone/nome do
   * formulário que a pessoa acabou de enviar.
   *
   * A lista de PROIBIÇÕES vem primeiro e é definitiva. Na dúvida, não captura:
   * um email a menos custa correspondência; um número de cartão a mais custa
   * um incidente.
   */
  var DENY_TYPES = {
    password: 1, hidden: 1, file: 1, checkbox: 1, radio: 1, range: 1,
    color: 1, submit: 1, button: 1, image: 1, reset: 1, date: 1,
    "datetime-local": 1, month: 1, week: 1, time: 1,
  }

  var DENY_ATTR =
    /(pass|senha|pwd|secret|token|otp|cvv|cvc|csc|card|cart[aã]o|credit|debito|d[eé]bito|security|pin|ssn|iban|ag[eê]ncia|routing|boleto|c[oó]digo|captcha|cpf|cnpj)/i

  var EMAIL_HINT = /e-?mail|correio/i
  var PHONE_HINT = /(phone|telefone|celular|whats|fone|mobile|(^|[\W_])tel([\W_]|$))/i
  var FIRST_HINT = /(^|[\W_])(nome|name|first[-_]?name|given[-_]?name|primeiro)/i
  var LAST_HINT = /(sobrenome|last[-_]?name|family[-_]?name|surname)/i

  function attrBlob(el) {
    return [
      el.name, el.id, el.className, el.placeholder,
      el.getAttribute("aria-label"), el.getAttribute("autocomplete"),
    ].join(" ")
  }

  /** 13 a 19 dígitos que passam no Luhn: é cartão, não telefone. */
  function looksLikeCard(value) {
    var digits = String(value || "").replace(/\D/g, "")
    if (digits.length < 13 || digits.length > 19) return false

    var sum = 0
    var alt = false
    for (var i = digits.length - 1; i >= 0; i--) {
      var n = digits.charCodeAt(i) - 48
      if (alt) {
        n *= 2
        if (n > 9) n -= 9
      }
      sum += n
      alt = !alt
    }
    return sum % 10 === 0
  }

  function isForbidden(el) {
    var type = String(el.getAttribute("type") || el.type || "text").toLowerCase()
    if (DENY_TYPES[type]) return true
    if (el.disabled) return true

    var ac = String(el.getAttribute("autocomplete") || "").toLowerCase()
    if (ac.indexOf("cc-") === 0) return true
    if (ac.indexOf("password") !== -1) return true
    if (DENY_ATTR.test(attrBlob(el))) return true
    if (el.closest && el.closest("[data-negou-ignore]")) return true
    if (looksLikeCard(el.value)) return true
    return false
  }

  /**
   * Formulário com campo de senha é tela de login: nada a ganhar e é o mais
   * arriscado da página. Ignora inteiro, não campo a campo.
   */
  function isSensitiveForm(scope) {
    if (!scope || !scope.querySelector) return false
    if (scope.getAttribute && scope.getAttribute("data-negou-ignore") !== null) return true
    if (scope.querySelector("input[type=password]")) return true

    try {
      var action = scope.getAttribute && scope.getAttribute("action")
      if (action) {
        var host = new URL(action, location.href).hostname
        if (CHECKOUT_HOSTS.indexOf(host) !== -1) return true
      }
    } catch {}
    return false
  }

  function harvest(scope) {
    var root = scope && scope.querySelectorAll ? scope : document
    if (isSensitiveForm(root)) return null

    var inputs = root.querySelectorAll("input")
    var out = {}
    var fullName = null

    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i]
      var value = String(el.value || "").trim()
      if (!value || value.length > 254) continue
      if (isForbidden(el)) continue

      var type = String(el.getAttribute("type") || "").toLowerCase()
      var ac = String(el.getAttribute("autocomplete") || "").toLowerCase()
      var blob = attrBlob(el)

      // Email antes de telefone: um campo chamado "email" contendo dígitos
      // nunca pode ser lido como telefone.
      if (!out.email && (type === "email" || ac.indexOf("email") !== -1 || EMAIL_HINT.test(blob))) {
        if (EMAIL_RE.test(value)) out.email = value
        continue
      }
      if (!out.phone && (type === "tel" || ac.indexOf("tel") === 0 || PHONE_HINT.test(blob))) {
        var digits = value.replace(/\D/g, "")
        if (digits.length >= 10 && digits.length <= 13) out.phone = digits
        continue
      }
      if (!out.last_name && (ac === "family-name" || LAST_HINT.test(blob))) {
        out.last_name = value.slice(0, 60)
        continue
      }
      if (!fullName && (ac === "given-name" || ac === "name" || FIRST_HINT.test(blob))) {
        if (/^[\p{L}][\p{L}'\-\s.]{1,59}$/u.test(value)) fullName = value
        continue
      }
      // Último recurso, só pro email: campo sem pista nenhuma cujo VALOR é um
      // email válido. Não vale pra telefone — dígito solto é ambíguo demais.
      if (!out.email && EMAIL_RE.test(value)) out.email = value
    }

    if (fullName) {
      var parts = fullName.split(/\s+/)
      out.first_name = parts[0]
      if (!out.last_name && parts.length > 1) out.last_name = parts.slice(1).join(" ")
    }

    return out.email || out.phone ? out : null
  }

  /**
   * Fase de CAPTURA (o `true` no fim): roda mesmo que o framework do site
   * chame stopPropagation no borbulhamento. NUNCA chamamos preventDefault — o
   * formulário do site tem que funcionar exatamente igual.
   */
  function watchForms() {
    document.addEventListener(
      "submit",
      function (event) {
        if (!state.forms) return
        var traits = harvest(event.target)
        // Síncrono de propósito: o DOM pode ser desmontado no instante
        // seguinte, e o keepalive do post() leva a requisição até o fim.
        if (traits) identify(traits)
      },
      true
    )

    // Muito formulário de SPA e de quiz nunca emite `submit`: o envio é um
    // clique num botão comum.
    document.addEventListener(
      "click",
      function (event) {
        if (!state.forms) return
        var el = event.target
        if (!el || !el.closest) return

        var button = el.closest("button, [type=submit], [role=button]")
        if (!button || button.closest("[data-negou-ignore]")) return

        var scope = button.closest("form") || button.closest("[data-negou-form]")
        if (!scope) return

        var traits = harvest(scope)
        if (traits) identify(traits)
      },
      true
    )
  }

  window.negou = {
    track: track,
    identify: identify,
    decorate: decorate,
    decorateLinks: decorateLinks,
    id: function () {
      return trckUserId
    },
    state: state,
  }

  // ---------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------

  function init(config) {
    state.pixels = config.pixels || []
    state.ga4 = config.ga4 || []

    var dispatch = config.dispatch || {}
    if (dispatch.mode) state.mode = dispatch.mode
    state.neverDelay = dispatch.never_delay || []

    // O site pode desligar o farejador sem mexer no painel:
    // <script src=".../track.js" data-negou-forms="off" defer></script>
    var formsOff =
      scriptEl && scriptEl.getAttribute("data-negou-forms") === "off"
    state.forms = Boolean(config.forms && config.forms.capture) && !formsOff

    // ANTES do loadPixel: se o cookie já existe quando o fbevents carrega, ele
    // reaproveita em vez de criar um segundo valor.
    ensureFbp()

    loadGtag(state.ga4)
    loadPixel(state.pixels)

    // Guardado numa variável porque o primeiro track() espera por ele: sem
    // isso o PageView chega ao servidor antes de fbp/fbc/geo, e o disparo lê
    // uma linha de visitante incompleta.
    identifyPromise = postJson("/api/identify", visitorPayload(null)).then(
      function (result) {
        if (result && typeof result.identified === "boolean") {
          state.identified = result.identified
        }
        return result
      }
    )

    if (state.forms) watchForms()

    state.ready = true
    drainBuffer()
    track("PageView", {})
    decorateLinks()

    // Links criados depois (conteúdo dinâmico) também precisam do id.
    if (window.MutationObserver) {
      var observer = new MutationObserver(function () {
        decorateLinks()
      })
      observer.observe(document.documentElement, { childList: true, subtree: true })
    }
  }

  // Quem fecha a aba antes do teto do identify não pode perder o evento: aqui
  // o que estiver na fila local sai na hora, sem esperar ninguém.
  window.addEventListener(
    "pagehide",
    function () {
      leaving = true
      drainBuffer()
    },
    { once: true }
  )

  fetch(API_BASE + "/api/config/public", { mode: "cors" })
    .then(function (response) {
      return response.ok ? response.json() : null
    })
    .catch(function () {
      return null
    })
    .then(function (config) {
      // Mesmo sem nenhum destino configurado, a captura própria continua —
      // os eventos ficam registrados e serão enviados quando houver destino.
      init(config || { pixels: [], ga4: [] })
    })
})()
