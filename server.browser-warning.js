module.exports = () => {
  console.warn('hyperloop.server() was called in a browser so a noop was returned. It is meant to be used in a node.js environment.')
  return () => {}
}
