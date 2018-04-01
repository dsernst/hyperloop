const syntax = require('babel-plugin-syntax-dynamic-import')

module.exports = function({ template }) {
  const buildImport = template(`
    (new Promise((resolve) => {
      require.ensure([], (require) => {
        resolve(require(SOURCE))
      })
    }))
  `);

  return {
    inherits: syntax,

    visitor: {
      Import(path) {
        const newImport = buildImport({
          SOURCE: path.parentPath.node.arguments,
        })
        path.parentPath.replaceWith(newImport)
      },
    },
  }
}
