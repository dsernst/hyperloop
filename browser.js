const cookies = require('browser-cookies')
const hyperhtml = require('hyperhtml')
const parseForm = require('parse-form')
const qs = require('qs')
const noop = () => {}

module.exports = class HyperloopContext {
  constructor(state = {}) {
    this.initializing = false
    this.redirect = this.redirect.bind(this)
    this.rendering = false
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

    return RootComponent.for({}, { context: this }).then(() => {
      this.initializing = false

      if (adopt) {
        window.adoptable = {}
        var tw = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT, null, null),
            comment;
        while (comment = tw.nextNode()) {
          let node = comment
          if (/^\u0001.+$/.test(comment.textContent)) {
            let textContent = comment.textContent
            window.adoptable[comment.textContent] = window.adoptable[comment.textContent] || []
            while ((node = node.nextSibling)) {
              if (node.nodeType === 8 && node.textContent === textContent) {
                break;
              } else {
                window.adoptable[comment.textContent].push(node)
              }
            }
          }
        }

        // create root component node fragment to adopt
        this.root.node = { ownerDocument: document, childNodes: Array.prototype.slice.call(container.childNodes) }

        this.render()
      } else {
        hyperhtml.bind(container)`${this.render()}`
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
        detail: { url, code },
      }))
    } else {
      window.location.href = url
    }
  }

  render() {
    let result
    if (!this.rendering) {
      this.rendering = true
      result = this.root.render()
      this.rendering = false
    }
    return result
  }

  setStatus(code) {}
}
