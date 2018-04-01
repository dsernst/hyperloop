const Component = require('./Component')

module.exports = class Loadable extends Component {
  oninit() {
    const { loader } = this.props

    if (typeof loader !== 'function') {
      return console.warn('Loadable requires a loading function in "loader" prop')
    }

    return loader.call(this).then((loaded) => {
      this.setProps({ loaded }).hyperloop.root.render()
    })
  }
  render() {
    const { loaded, loading } = this.props
    let name = ''
    if (loading) name = (loading.default || loading).constructor.name
    if (loaded) name = (loaded.default || loaded).constructor.name

    return this.html`
      <div class="hyperloop_loadable">
      ${loaded
        ? (loaded.default || loaded).for(this, `${name}-loadable-loaded`, this.props)
        : (loading ? (loading.default || loading).for(this, `${name}-loadable-loading`, this.props) : '')
      }
      </div>
    `
  }
}
