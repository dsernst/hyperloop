const bodyParser = require('body-parser')
const callerPath = require('caller-path');
const chalk = require('chalk')
const cliui = require('cliui')()
const compression = require('compression')
const cookieParser = require('cookie-parser')
const express = require('express')
const hyperhtml = require('viperhtml')
const humanizeDuration = require('humanize-duration')
const http = require('http')
const MemoryFS = require('memory-fs')
const path = require('path')
const prettyBytes = require('pretty-bytes')
const Promise = require('bluebird')
const resolveFrom = require('resolve-from');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin')
const url = require('url')
const webpack = require('webpack')

const noop = () => {}

const statsOptions = {
  assets: false,
  builtAt: false,
  chunks: false,
  chunkModules: false,
  chunksSort: '!size',
  colors: true,
  exclude: /node_modules|webpack|webpack.entry.js|browser.js|index.js/,
  modulesSort: '!size',
  version: false,
}

// transform dynamic import()'s in node environment
require('babel-register')({
  ignore: [/node_modules/],
  presets: [[require.resolve('babel-preset-env'), { targets: { node: "8.9" } }]],
  plugins: [
    require.resolve('babel-plugin-dynamic-import-node'),
    require.resolve('babel-plugin-transform-object-rest-spread'),
  ]
})

module.exports = function hyperloopServer(entry, config = {}) {
  const server = express()
  const webpackConfig = makeWebpackConfig(entry, { env: config.env, containerSelector: '#hyperloop_application' })
  const hyperloopPath = webpackConfig.output.publicPath
  const compiler = webpack(webpackConfig)
  const fs = new MemoryFS
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'development'
  let RootComponent = require(entry)

  console.log(`${chalk.grey('hyperloop ∞')} started in ${env} mode`)

  compiler.outputFileSystem = fs

  if (env === 'production' || config.liveReload === false) {
    compileHyperloopBundle(entry, compiler)
  } else {
    compileHyperloopLiveReloadBundle(entry, config, compiler, () => {
      RootComponent = require(entry)
    })
  }

  server.set('X-Powered-By', 'HyperLoop')

  if (env !== 'production' && config.liveReload !== false) {
    server.use(require('webpack-hot-middleware')(compiler, { log: false }))
  }

  server
    .use(compression())
    .use(cookieParser())
    .use(bodyParser.urlencoded({ extended: true }))
    .get(`${hyperloopPath}:filename`, (req, res, next) => serveHyperloopBundle(fs, req, res, next))
    .use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'POST') return next()

      if (compiler.compiled) {
        serveHyperloopPage(config, webpackConfig, compiler, RootComponent, req, res, next)
      } else {
        waitForBundle(compiler, () => {
          serveHyperloopPage(config, webpackConfig, compiler, RootComponent, req, res, next)
        })
      }
    })

  return server
}

function waitForBundle(compiler, callback) {
  const interval = setInterval(() => {
    if (compiler.compiled) {
      clearInterval(interval)
      callback()
    }
  }, 500)
}

function serveHyperloopPage(config, webpackConfig, compiler, RootComponent, req, res, next) {
  const context = new HyperloopContext(config.initialState, req, res)

  context.initialize(RootComponent).then((html) => {
    if (context.location.method === 'POST') {
      return res.redirect(303, context.location.path)
    }

    if (!context.redirected) {
      res.set('Content-Type', 'text/html; charset=utf-8').write(`
        <!DOCTYPE html>
        <html>
          <head>
            ${config.htmlHead ? config.htmlHead(context.state) : ''}
            ${config.javascript !== false
              ? `<script>window.__hyperloop_state = ${JSON.stringify(context.state).replace(/<\//g, '<\\/')};</script>
                 <script defer src="${webpackConfig.output.publicPath}${compiler.hash}.js"></script>`
              : ''}
          </head>
          <body>
            <div id="hyperloop_application">${html}</div>
          </body>
        </html>
      `)
      res.end()
    }
  })
  .catch(next)
}

class HyperloopContext {
  constructor(initialState = {}, req, res) {
    this.initializing = false
    this.location = {
      method: req.method,
      path: req.path,
      redirect: this.redirect.bind(this),
      query: req.query,
      setStatus: this.setStatus.bind(this),
      ip: req.ip,
      url: this.originalUrl,
      userAgent: req.get('User-Agent') || 'Unknown',
    }
    this.body = req.body
    this.res = res
    this.redirected = false
    this.rendering = false
    this.state = Object.assign({}, initialState)

    const store = {}

    this.storage = {
      get: (key) => {
        const info = store[key]
        if (req.cookies[key]) {
          return req.cookies[key]
        }
        if (info && (!info.expires || info.expires > (new Date()))) {
          return info.val
        }
      },
      set: (key, val, opts) => {
        store[key] = { val, opts }
        return res.cookie(key, val, opts)
      },
      unset: (key) => {
        store[key] = undefined
        return res.clearCookie(key)
      },
    }
  }

  form() {
    return this.body
  }

  initialize(RootComponent) {
    // resolve all oninit() and onsubmit() handlers before rendering
    this.initializing = true

    return RootComponent.for({}, { context: this }).then(() => {
      this.initializing = false
      return hyperhtml.wire()`${this.render()}`
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
    if (!this.redirected) {
      this.redirected = true
      if (arguments.length === 1) {
        this.res.redirect(code)
      } else {
        this.res.redirect(code, url)
      }
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

  setStatus(code) {
    this.res.status(code)
  }
}

function serveHyperloopBundle(fs, req, res, next) {
  res.setHeader('Content-Type', 'text/javascript')
  fs.readFile(`/${req.params.filename}`, 'utf8', (error, js) => {
    if (error) return res.status(404).end()
    res.write(js)
    res.end()
  })
}

function compileHyperloopLiveReloadBundle(entry, config, compiler, listener) {
  let init = false

  console.log(`${chalk.grey('hyperloop ∞')} building your app ...`)

  // https://github.com/webpack/watchpack/issues/25#issuecomment-319292564
  const timefix = 21000;
  compiler.hooks.watchRun.tap({ name: 'HyperloopWatcher' }, (watching) => {
    watching.startTime += timefix;
  });
  compiler.hooks.done.tap({ name: 'HyperloopStatsPatch' }, (stats) => {
    stats.startTime -= timefix
  })
  compiler.watch({ ignored: /node_modules/ }, (err, stats) => {
    if (err || stats.compilation.errors.length) {
      return console.error(err || stats.compilation.errors)
    }

    compiler.compiled = true
    compiler.hash = stats.compilation.hash

    if (!init) {
      init = true
      console.log('')
      console.log(stats.toString({ ...statsOptions, context: path.dirname(entry) }))
      console.log('')
      console.log(`${chalk.grey('hyperloop ∞')} ready and watching for changes 🚀`)
    } else {
      for (const moduleId of Object.keys(require.cache)) {
        if (!~moduleId.indexOf('node_modules')) {
          delete require.cache[resolveFrom(path.dirname(callerPath()), moduleId)];
        }
      }
      listener()
    }
  })
}

function compileHyperloopBundle(entry, compiler) {
  console.log(`${chalk.grey('hyperloop ∞')} building your app ...`)

  return new Promise((resolve, reject) => {
    // create manifest of lazy loaded component chunks
    // to achieve isomorphic rendering, any of these chunks used to render the page will be included in the bundle for that page
    compiler.hooks.emit.tap({ name: 'Hyperloop' }, (compilation) => {
      compiler.hash = compilation.hash
    })

    compiler.run((error, stats) => {
      if (error) return reject(error)
      console.log('')
      console.log(stats.toString({ ...statsOptions, context: path.dirname(entry) }))
      console.log('')
      console.log(`${chalk.grey('hyperloop ∞')} is ready 🚀`)
      compiler.compiled = true
      resolve()
    });
  })
}

function makeWebpackConfig(entry, config = {}) {
  if (entry[0] !== '/') {
    throw new Error('path to root component must be absolute, not relative')
  }

  const plugins = [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
      '__HYPERLOOP_CONFIG__': JSON.stringify({ javascript: config.javascript !== false, containerSelector: config.containerSelector }),
      '__HYPERLOOP_ENTRY_PATH__': JSON.stringify(entry),
    }),
  ]

  const entries = []

  if (process.env.NODE_ENV !== 'production') {
    if (config.liveReload !== false) {
      entries.push('webpack-hot-middleware/client?noInfo=true&reload=true')
      plugins.push(new webpack.HotModuleReplacementPlugin())
    }
  }

  entries.push(path.join(__dirname, 'webpack.entry.js'))

  return {
    context: __dirname,
    devtool: 'source-map',
    entry: entries,
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules\/(?!(hyperloop|hyperhtml))/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [[require.resolve('babel-preset-env'), {
                targets: {
                  browsers: ["last 3 versions", "IE >= 11", "safari >= 7"]
                },
                useBuiltIns: 'entry',
              }]],
              plugins: [
                './babel-plugin-dynamic-import-browser',
                'babel-plugin-transform-object-rest-spread',
              ].map(require.resolve)
            }
          }
        }
      ]
    },
    optimization: {
      minimizer: [
        // we specify a custom UglifyJsPlugin here to get source maps in production
        new UglifyJsPlugin({
          cache: true,
          parallel: true,
          uglifyOptions: {
            compress: {
              pure_funcs: ['console.debug', 'console.group', 'console.groupEnd'],
            },
            ecma: 6,
            mangle: true,
            keep_classnames: true,
            keep_fnames: true,
          },
          sourceMap: true,
        })
      ],
    },
    output: {
      path: '/',
      filename: '[hash].js',
      publicPath: '/hyperloop/'
    },
    plugins,
    resolve: {
      alias: {
        './server.js': './server.browser-warning.js',
        'hyperhtml': 'hyperhtml/cjs',
        'viperhtml': 'hyperhtml/cjs/index'
      }
    },
    target: 'web',
  }
}
