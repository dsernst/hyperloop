const HyperloopContext = require('hyperloop/browser')
const RootComponent = require(__HYPERLOOP_ENTRY_PATH__)
const config = __HYPERLOOP_CONFIG__ || {}
const container = document.querySelector(config.containerSelector)
const initialState = window.__hyperloop_state
const adopt = !window.__hyperloop_adopted$ && config.javascript !== false

const context = new HyperloopContext(initialState)

context.initialize(RootComponent, container, false)

if (module.hot) {
  window.__hyperloop_adopted$ = true
  module.hot.accept()
}
