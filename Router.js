const Component = require('./Component')
const pathToRegexp = require('path-to-regexp')

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
    return this.load()
  }
  onredirect(event) {
    this.navigateTo(event.detail.url)
  }
  onpopstate(event) {
    this.render()
    if (event.state.page_title) document.title = event.state.page_title
    Promise.resolve(this.load()).then(() => this.render())
  }
  onclick(event) {
    const a = event.target.tagName === 'A' && event.target
    const href = a && a.getAttribute('href')

    if (href && href[0] === '/') {
      event.preventDefault()
      this.navigateTo(href)
    }
  }
  onconnected() {
    const page_title = this.props.pageTitle ? this.props.pageTitle(this.state) : window.document.title
    window.history.replaceState({ page_title }, page_title, document.location.pathname)
    window.addEventListener('popstate', this.onpopstate)
    window.addEventListener('redirect', this.onredirect)
    if (this.overrideAnchors !== false) window.addEventListener('click', this.onclick)
  }
  ondisconnected() {
    window.removeEventListener('popstate', this.onpopstate)
    if (this.overrideAnchors !== false) window.removeEventListener('click', this.onclick)
  }
  navigateTo(url) {
    let page_title = this.props.pageTitle ? this.props.pageTitle(this.state) : window.document.title
    window.history.pushState({ page_title }, page_title, url)
    document.title = page_title
    this.setProps({ loaded: false }).render()
    Promise.resolve(this.load()).then(() => {
      window.scrollTo(0, 0)
      this.props.onPageChange && this.props.onPageChange.call(this)
      this.context.root.render()
      page_title = this.props.pageTitle ? this.props.pageTitle(this.state) : window.document.title
      document.title = page_title
      window.history.replaceState({ page_title }, page_title, url)
    })
  }
  load() {
    const matched = this.match()

    if (matched) {
      let loader = typeof matched === 'function' ? matched.call(this) : matched
      if (loader.then) {
        return loader.then((loaded) => {
          this.setProps({ loaded })
        })
      }
      this.setProps({ loaded: loader })
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
            b[route.keys[i]] = a
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
        ? (loaded.default || loaded).for(this, this.props, `${path}-loadable-loaded`)
        : (loading ? (loading.default || loading).for(this, this.props, `${path}-loadable-loading`) : '')
      }</div>
    `
  }
}
