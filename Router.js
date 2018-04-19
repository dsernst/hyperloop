const Component = require('./Component')
const pathToRegexp = require('path-to-regexp')
const urlencoded = require('form-urlencoded')

/*
  {
    overrideAnchors: <boolean: true>,
    loading: <hyperhtml.Component: null>,
    routes: { <String> : <() => import(<String>) }
  }
*/
module.exports = class Router extends Component {
  oninit() {
    if (this.context._routerPath$) {
      this._parentPath$ = this.context._routerPath$
    }
    this.onredirect = this.onredirect.bind(this)
    this.onpopstate = this.onpopstate.bind(this)
    this.onclick = this.onclick.bind(this)
    this.onsubmit = this.onsubmit.bind(this)
    return this.load()
  }
  onredirect(event) {
    if (event.detail.code === 303) {
      this.navigateTo(event.detail.url, true)
    } else {
      this.navigateTo(event.detail.url, false, true)
    }
  }
  onpopstate(event) {
    this.navigateTo(document.location.pathname + document.location.search, false)
  }
  onclick(event) {
    const node = event.target
    const parent = node.parentNode
    const anchor = node.tagName === 'A' ? node : (parent && parent.tagName === 'A' && parent)
    const href = anchor && anchor.getAttribute('href')

    if (!event.metaKey && href && href[0] === '/' && href !== this.location.url) {
      event.preventDefault()
      this.navigateTo(href)
    }
  }
  onsubmit(event) {
    const form = event.target.tagName === 'FORM' && event.target
    const isGET = form.getAttribute('method') === 'GET'
    const action = form.getAttribute('action') || this.location.path

    if (form && isGET) {
      event.preventDefault()
      const formData = this.context.form(form)
      const formUrl = urlencoded(formData)
      if (formUrl) {
        this.navigateTo(`${action}?${formUrl}`)
      }
    }
  }
  onconnected() {
    const page_title = this.props.pageTitle ? this.props.pageTitle(this.state) : window.document.title
    window.history.replaceState({ page_title }, page_title, `${window.location.pathname}${window.location.search}`)
    window.addEventListener('popstate', this.onpopstate)
    window.addEventListener('redirect', this.onredirect)
    if (this.overrideAnchors !== false) {
      window.addEventListener('click', this.onclick)
      window.addEventListener('submit', this.onsubmit)
    }
  }
  ondisconnected() {
    window.removeEventListener('popstate', this.onpopstate)
    window.removeEventListener('redirect', this.onredirect)
    if (this.overrideAnchors !== false) {
      window.removeEventListener('click', this.onclick)
      window.removeEventListener('submit', this.onsubmit)
    }
  }
  navigateTo(url, pushState, replaceState) {
    const prev_path = this.location.path
    let page_title = this.props.pageTitle ? this.props.pageTitle(this.state) : window.document.title
    this.props.beforePageChange && this.props.beforePageChange.call(this)
    this.setProps({ loaded: false }).render()
    if (pushState !== false) window.history.pushState({ page_title }, page_title, url)
    if (replaceState === true) window.history.replaceState({ page_title }, page_title, url)
    document.title = page_title
    const oldProps = Object.assign({}, this.props)
    Promise.resolve(this.load()).then(() => {
      if (prev_path !== this.location.path) window.scrollTo(0, 0)
      this.props.afterPageChange && this.props.afterPageChange.call(this)
      page_title = this.props.pageTitle ? this.props.pageTitle(this.state) : window.document.title
      document.title = page_title
      window.history.replaceState({ page_title }, page_title, url)
      const component = this.props.loaded.for(this, this.props, `${this.location.path}-loadable-loaded`, false)
      if (component.props.url && component.onpagechange) component.onpagechange(oldProps)
      this.context.render()
    })
  }
  load() {
    const matched = this.match()

    if (matched) {
      let loader = typeof matched === 'function' ? matched.call(this) : matched
      if (loader.then) {
        return loader.then((loaded) => {
          this.setProps({ loaded: loaded.default || loaded })
        })
      }
      this.setProps({ loaded: loader.default || loader })
    }
  }
  match() {
    const { routes } = this.props
    const { url, path } = this.location

    if (!this.props.stack) {
      this.setProps({
        stack: Object.keys(routes).map((path) => {
          const keys = []
          const pattern = this._parentPath$ ? `${this._parentPath$}${path}` : path
          const regexp = pathToRegexp(pattern, keys)
          return { keys, loader: routes[path], path: pattern, regexp }
        })
      })
    }

    for (let i = 0, l = this.props.stack.length; i < l; i++) {
      let route = this.props.stack[i]
      if (route.regexp.test(path)) {
        let matches = route.regexp.exec(path)
        this.context._routerPath$ = route.path
        this.setProps({
          url,
          path,
          params: matches.slice(1).reduce((b, a, i) => {
            b[route.keys[i].name] = a
            return b
          }, {})
        })
        return route.loader
      }
    }

    return () => {
      this.location.setStatus(404)
      const notFound = this.props.notFound
      return typeof notFound === 'function' ? notFound.call(this) : notFound
    }
  }
  render() {
    const { loaded, loading } = this.props
    const path = this.location.path

    return this.html`
      <div class="hyperloop_router" onconnected=${this}>${loaded
        ? loaded.for(this, this.props, `${path}-loadable-loaded`)
        : (loading ? loading.for(this, this.props, `${path}-loadable-loading`) : '')
      }</div>
    `
  }
}
