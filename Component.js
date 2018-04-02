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
      node: { value: null, writable: true },
      props: { value: Object.assign({}, props) },
      wire: { value: null, writable: true },
    })

    if (this.defaultState) {
      this.setState(this.defaultState(this.props), false)
    }

    if (!context.initializing && this.oninit) {
      if (this.isBrowser) {
        console.group(`${this.constructor.name}.oninit`)
      }
      Promise.resolve(this.oninit()).then((newState) => {
        if (newState) this.setState(newState)
        if (this.isBrowser) {
          console.debug('newState:', newState)
          console.groupEnd()
        }
      })
    }
  }

  static for(parent, props, id) {
    // optional id argument to differentiate multiple children of the same class
    if (typeof props === 'string') {
      id = props
      props = {}
    }

    // fetch the previous child component for this parent
    const context = parent.context
    const info = components.get(parent) || cacheComponent(parent)
    const component = getComponent(this, context, props, info, id == null ? `${this.name}-default` : id)

    // when initializing, return a promise of all oninit() and onsubmit() functions
    if (context.initializing) {
      if (this.isBrowser && component.oninit) {
        console.group(`${component.constructor.name}.oninit`)
      }
      return Promise.resolve(component.oninit && component.oninit()).then((newState) => {
        if (newState) component.setState(newState, false)
        if (this.isBrowser) {
          console.debug('newState:', newState)
          console.groupEnd()
        }
        if (context.location.method === 'POST') {
          const event = { type: 'submit', preventDefault: noop }
          if (!context.location.query.action || context.location.query.action === component.constructor.name) {
            if (this.isBrowser && component.onsubmit) {
              console.group(`${component.constructor.name}.onsubmit`)
            }
            return Promise.resolve(component.onsubmit && component.onsubmit(event, context.form())).then((newState) => {
              if (newState) component.setState(newState, false)
              if (this.isBrowser) {
                console.debug('newState:', newState)
                console.groupEnd()
              }
              return Promise.all(component.render())
            })
          } else {
            return Promise.all(component.render())
          }
        }
        return Promise.all(component.render())
      })
    }

    // when adopting, return a thunk that receives the DOM node to adopt
    if (context.adopting) {
      const adoptableThunk = (node) => {
        component.node = node
        return component.render()
      }
      adoptableThunk.adoptableThunk = true
      return adoptableThunk
    }

    if (component.onrender) {
      if (component.isBrowser) {
        console.group(`${component.constructor.name}.onrender`)
        console.debug('oldProps:', component.props)
        console.debug('newProps:', props)
        console.groupEnd()
      }
      component.onrender(props)
    }
    component.setProps(props)

    return component.render()
  }

  // dispatches events to any instance function of the same event name, such as "onsubmit" or "onclick"
  // provides easy event binding in templates by using "this": <button onclick=${this}>Click me</button>
  handleEvent(event) {
    if (this.isBrowser) {
      console.group(`${this.constructor.name}.on${event.type}`)
      console.debug('event:', event)
      console.groupEnd()
    }

    const handler = this[`on${event.type}`]
    let formData = null

    if (event.type === 'submit') {
      formData = this.context.form(event.currentTarget)
    }

    // set new state if returned from event handler
    if (handler) {
      event.stopPropagation()
      return Promise.resolve(handler.call(this, event, formData)).then((newState) => {
        if (newState) this.setState(newState)
      })
    }
  }

  get html() {
    if (this.context.initializing) return promisedInterpolations
    if (!this.wire) this.wire = hyperhtml.wire(null, 'html', this.node)
    if (this.context.adopting) return this.context.adopt
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
    for (let key in newState) {
      state[key] = newState[key]
    }
    if (render !== false) this.context.root.render()
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
    if (this.context.adopting) return this.context.adopt
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
