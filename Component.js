const hyperhtml = require('viperhtml')

const noop = () => {}

module.exports = class Component {
  // components require a context which provides functionality specific to the environment (browser or server)
  constructor(props, context) {
    if (typeof context !== 'object') {
      throw new Error(`HyperloopContext instance is required to instantiate components`)
    }

    Object.defineProperties(this, {
      context: { value: context },
      initializing: { value: false, writable: true },
      node: { value: null, writable: true },
      props: { value: Object.assign({}, props) },
      wire: { value: null, writable: true },
    })

    if (this.defaultState) {
      this.setState(this.defaultState(this.props), false)
    }

    if (!context.initializing && this.oninit) {
      this.initializing = true
      if (this.isBrowser) {
        console.group(`${this.constructor.name}.oninit`)
      }
      Promise.resolve(this.oninit()).then((newState) => {
        this.initializing = false
        this.setState(newState)
        if (this.isBrowser) {
          console.debug('newState:', newState)
          console.groupEnd()
        }
      })
    }
  }

  static for(parent, props = {}, id, render) {
    // optional id argument to differentiate multiple children of the same class
    if (typeof props === 'string') {
      id = props
      props = {}
    }

    // fetch the previous child component for this parent
    const context = parent.context || props.context
    const info = components.get(parent) || cacheComponent(parent)
    const component = getComponent(this, context, props, info, id == null ? `${this.name}-default` : id)

    // set root to first component to instantiate
    if (!context.root) context.root = component

    // when initializing, return a promise of all oninit() and onsubmit() functions
    if (context.initializing) {
      return component.handleEvent({ type: 'init', preventDefault: noop, stopPropagation: noop }).then(() => {
        if (context.location.method === 'POST') {
          if (!context.location.query.action || context.location.query.action === component.constructor.name) {
            return component.handleEvent({ type: 'submit', preventDefault: noop, stopPropagation: noop }).then(() => {
              return Promise.all(component.render())
            })
          }
        }
        return Promise.all(component.render())
      })
    }

    component.setProps(props)

    if (render === false) return component
    const key = `\u0001${parent.constructor.name}${this.name}${id || ''}`
    if (typeof window !== 'object') {
      return [`<!--${key}-->${component.render()}<!--${key}-->`]
    }
    return component.render()
  }

  // dispatches events to any instance function of the same event name, such as "onsubmit" or "onclick"
  // provides easy event binding in templates by using "this": <button onclick=${this}>Click me</button>
  handleEvent(event) {
    const handler = this[`on${event.type}`]

    if (handler) {
      if (this.isBrowser) {
        console.group(`${this.constructor.name}.on${event.type}`)
        console.debug('event:', event)
      }

      let formData = null

      if (event.type === 'submit') {
        formData = this.context.form(event.currentTarget)
        if (this.isBrowser) console.debug('formData:', formData)
      }

      if (this.isBrowser) console.groupEnd()

      // set new state if returned from event handler
      event.stopPropagation()
      return Promise.resolve(handler.call(this, event, formData)).then((newState) => {
        if (newState) this.setState(newState)
      })
    }
    return Promise.resolve()
  }

  get html() {
    if (this.context.initializing) return promisedInterpolations
    if (!this.wire) this.wire = hyperhtml.wire(null, 'html', this.node)
    return this.wire
  }

  get isBrowser() {
    return typeof window === 'object'
  }

  get isServer() {
    return typeof window !== 'object'
  }

  get location() {
    return this.context.location
  }

  setProps(props) {
    const target = this.props
    for (let key in props) {
      target[key] = props[key]
    }
    return this
  }

  setState(newState, render) {
    if (this.isBrowser) {
      console.group(`${this.constructor.name}.setState`)
      console.debug('newState:', newState)
      console.debug('state:', this.context.state)
      console.groupEnd()
    }
    const state = this.context.state
    if (typeof newState === 'function') {
      newState = newState(state)
    }
    if (newState) {
      for (let key in newState) {
        state[key] = newState[key]
      }
    }
    if (!this.initializing && !this.context.initializing && render !== false) this.context.render()
    return this
  }

  get state() {
    return this.context.state
  }

  get storage() {
    return this.context.storage
  }

  get svg() {
    if (this.context.initializing) return promisedInterpolations
    if (!this.wire) this.wire = hyperhtml.wire(null, 'svg', this.node)
    return this.wire
  }

  toString() {
    return `?action=${this.constructor.name}`
  }
}

const components = new WeakMap

function getComponent(Component, context, props, info, id) {
  switch (typeof id) {
    case 'object':
    case 'function':
      const wm = info.w || (info.w = new WeakMap)
      let component = wm.get(id)
      if (!component) {
        component = new Component(props, context)
        wm.set(id, component)
      }
      return component
    default:
      const sm = info.p || (info.p = Object.create(null))
      return sm[id] || (sm[id] = new Component(props, context))
  }
}

function cacheComponent(component) {
  const info = { w: null, p: null }
  components.set(component, info)
  return info
}

function promisedInterpolations() {
  // returns all promised interpolations
  return Array.prototype.slice.call(arguments, 1).filter((value) => {
    return value !== null && typeof value === 'object' && typeof value.then === 'function'
  })
}
