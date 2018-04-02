const cookies = require('browser-cookies')
const hyperhtml = require('hyperhtml')
const parseForm = require('parse-form')
const qs = require('qs')
const noop = () => {}

module.exports = class HyperloopContext {
  constructor(state = {}) {
    this.adopting = false
    this.initializing = false
    this.redirect = this.redirect.bind(this)
    this.state = state
    this.storage = {
      get: (key) => {
        return cookies.get(key)
      },
      set: (key, val, opts) => {
        return cookies.set(key, val, opts)
      },
      unset: (key) => {
        return cookies.erase(key)
      },
    }
  }

  adopt(...args) {
    const template = args[0]
    const interpolationNodes = find(this.node)
    const interps = []

    for (let i = 1, l = args.length; i < l; i++) {
      let slice = template[i - 1].slice(-2)
      if (slice !== '="' && slice[1] !== '=') {
        interps.push({ index: i, interp: args[i] })
      }
    }

    for (let i = 0, l = interps.length; i < l; i++) {
      const interpolation = interps[i].interp
      const isThunk = typeof interpolation === 'function' && interpolation.adoptableThunk
      if (isThunk) {
        args[interps[i].index] = interpolation({ ownerDocument: document, childNodes: interpolationNodes[i] || [] })
      }
    }

    this.onconnected && this.onconnected({ type: 'connected', preventDefault: noop, stopPropagation: noop })

    return this.wire.apply(this, args)
  }

  get location() {
    return {
      method: 'GET',
      path: window.location.pathname,
      redirect: this.redirect,
      query: qs.parse(window.location.search.slice(1)),
      setStatus: this.setStatus,
      url: window.location.pathname + window.location.search,
      userAgent: window.navigator.userAgent || 'Unknown',
    }
  }

  form(form) {
    return parseForm.parse(form).body
  }

  initialize(RootComponent, container, adopt = false) {
    this.initializing = true

    const root = this.root = new RootComponent({}, this)

    // resolve all oninit() handlers before rendering
    if (root.oninit) {
      console.group(`${root.constructor.name}.oninit`)
    }
    return Promise.resolve(root.oninit && root.oninit()).then((newState) => {
      if (newState) root.setState(newState, false)
      console.debug('newState:', newState)
      console.groupEnd()
      return Promise.all(root.render())
    })
    .then(() => {
      this.initializing = false

      if (adopt) {
        // create root component node fragment to adopt
        root.node = { ownerDocument: document, childNodes: Array.prototype.slice.call(container.childNodes, 1, -1) }

        this.adopting = true
        root.render()
        this.adopting = false
      } else {
        hyperhtml.bind(container)`${root.render()}`
      }
    })
    .catch(error => {
      if (~error.message.indexOf('updates[(i - 1)] is not a function')) {
        const message = `Malformed template (usually a result of malformed HTML or interpolations inside attribute values, such as class="foo \${bar}" which should be class=\${\`foo \${bar}\`})`
        error.stack = [message].concat(error.stack.split('\n').slice(1)).join('\n')
        error.message = message
      }
      return Promise.reject(error)
    })
  }

  redirect(code, url) {
    if (!url) url = code
    if (url[0] === '/') {
      dispatchEvent(new CustomEvent('redirect', {
        detail: { url },
      }))
    } else {
      window.location.href = url
    }
  }

  setStatus(code) {}
}

const COMMENT_NODE = 8
const ELEMENT_NODE = 1

// finds dom nodes for each interpolation, using comment markers inserted by the server
function find(node, interpolations, indexState = {}) {
  const childNodes = node.childNodes

  interpolations = interpolations || []
  indexState.index = indexState.index || 0

  for (let i = 0, l = childNodes.length; i < l; i++) {
    interpolations[indexState.index] = interpolations[indexState.index] || []

    if (node = childNodes[i]) {
      if (
        node.nodeType === COMMENT_NODE &&
        /^\u0001:[0-9a-zA-Z]+$/.test(node.textContent)
      ) {
        let textContent = node.textContent
        while ((node = node.nextSibling)) {
          i++;
          if (node.nodeType === COMMENT_NODE && node.textContent === textContent) {
            indexState.index++;
            break;
          } else {
            interpolations[indexState.index].push(node)
          }
        }
      } else if (node.nodeType === ELEMENT_NODE) {
        find(node, interpolations, indexState)
      }
    }
  }

  return interpolations
}
