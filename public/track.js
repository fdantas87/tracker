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
 *   negou.decorate("https://checkout...")   -> url com trck_user_id
 *   negou.id()                              -> trck_user_id atual
 *
 * DECISÃO IMPORTANTE (dedup): o event_id nasce AQUI, no navegador, e é usado
 * ao mesmo tempo no fbq e na chamada ao nosso servidor. É isso que deixa o
 * Meta entender que o evento do Pixel e o da Conversions API são o mesmo, em
 * vez de contar dois. O servidor nunca inventa event_id.
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

  var state = { pixels: [], ga4: [], ready: false }

  function track(eventName, params) {
    var eventId = uuid()
    var data = params || {}

    // Mesmo event_id nos dois canais: é o que permite a deduplicação.
    if (window.fbq) {
      try {
        window.fbq("track", eventName, data, { eventID: eventId })
      } catch {}
    }

    return post("/api/event", {
      event_id: eventId,
      event_name: eventName,
      trck_user_id: trckUserId,
      event_source_url: location.href,
      custom_data: data,
      utm_source: getUtms().utm_source || null,
      utm_medium: getUtms().utm_medium || null,
      utm_campaign: getUtms().utm_campaign || null,
      utm_term: getUtms().utm_term || null,
      utm_content: getUtms().utm_content || null,
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
          url.searchParams.set(URL_PARAM, trckUserId)
        }

        link.setAttribute("href", url.toString())
      } catch {}
    }
  }

  window.negou = {
    track: track,
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

    loadGtag(state.ga4)
    loadPixel(state.pixels)

    var session = getGaSession(state.ga4)
    var utms = getUtms()

    post("/api/identify", {
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
    })

    state.ready = true
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

  fetch(API_BASE + "/api/config/public", { mode: "cors" })
    .then(function (response) {
      return response.ok ? response.json() : { pixels: [], ga4: [] }
    })
    .catch(function () {
      return { pixels: [], ga4: [] }
    })
    .then(function (config) {
      // Mesmo sem nenhum destino configurado, a captura própria continua —
      // os eventos ficam registrados e serão enviados quando houver destino.
      init(config)
    })
})()
