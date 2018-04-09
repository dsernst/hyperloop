# Hyperl∞p 🚄

![npm](https://img.shields.io/npm/v/@alexmingoia/hyperloop.svg)
![status](https://img.shields.io/badge/api-unstable-orange.svg)
![license](https://img.shields.io/github/license/alexmingoia/hyperloop.svg)

Zero configuration library for building isomorphic progressively-enhanced web
applications, using a React-like component API.

- **No configuration**: `hyperloop('./src/App.js').listen(3000)`  
- **No waiting for JS**: Pages render server-side and JS lazy-loads on demand, minimizing Time-to-Interactive.
- **No virtual DOM**: Faster rendering using incremental DOM updates.
- **Truly isomorphic**: Apps work with or without JS. Choose to only render server-side or serve the whole app as JS, or get the best of both and lazy-load JS on demand!
- **Built on web standards**: Uses ES6/2015, template literals, Fetch API, and good ol' web forms.
- **Redux ready**: Easy integration with state management tools like Redux
- **Tiny**: Only 16KB gzipped!

## Get started

```javascript
const hyperloop = require('@alexmingoia/hyperloop')
const path = require('path')

// specify absolute path to your root component
hyperloop.server(path.resolve('./src/App.js')).listen(3000)
```

It's that easy! `hyperloop.server()` returns an Express server that can be
embedded into a larger Express server if desired.

### Components

Components are any class that extends `Hyperloop.Component`.

Like React, components must define a `render()` function:

```javascript
const { Component } = require('@alexmingoia/hyperloop')

class App extends Component {
  render() {
    return this.html`
      <h1>Hello, World!</h1>
    `
  }
}
```

`this.html` renders the following template literal as HTML and `this.svg`
renders as SVG.  Template interpolation is handled by
[hyperHTML](https://viperhtml.js.org/hyperhtml/documentation/#essentials-8),
which Hyperloop uses under the hood. 

Use `Component.for(parent[, props, key])` to embed child components. This
ensures that components receive the proper context and are reused for each
render.

```javascript
const { Component } = require('@alexmingoia/hyperloop')
const UserAvatar = require('./UserAvatar')
const UserInfo = require('./UserInfo')

class UserProfile extends Component {
  render() {
    return this.html`
      <div class="user">
        ${UserAvatar.for(this)}
        ${UserInfo.for(this)}
      </div>
    `
  }
}
```

Multiple children of the same class need a unique key:

```javascript
class BlogPosts extends Component {
  render() {
    return this.html`
      <div class="blog-posts">
        ${this.state.posts.map(({ id }) => BlogPost.for(this, `post-${id}`))}
      </div>
    `
  }
}
```

### Managing state

Unlike React, Hyperloop components don't keep their own state. `this.state`
refers to the application's state and `this.setState()` updates the entire app.
This enables easy communication between components, and if needed allows for
central control of state changes using Redux.

### Handling events

Event handlers can be embedded into a template:

```javascript
<div onclick=${(event) => console.log(event)}></div>
```

However, defining a handler function for each render is unnecessary. Instead,
define an event handler function with the name of the event on the component
class and reference that component in the template.

For example, create an `onsubmit()` handler on the component class and
reference `onsubmit=${this}` in the component's render function:

```javascript
class Counter extends Component {
  defaultState() {
    return { count: 0 }
  }
  onsubmit(event, formData) {
    event.preventDefault()
    return { count: this.state.count + 1 }
  }
  render() {
    return this.html`
      <form method="POST" onsubmit=${this} action=${this}>
        <h1>Count: ${this.state.count}</h1>
        <button type="submit">Increment</button>
      </form>
    `
  }
}
```

Event handlers defined on the component class can return a new state instead of
using `this.setState()` as seen in the example above.

### Fetching initial data

To ensure the same result when rendering for both node.js and the browser, an
`oninit()` function can be defined that returns an initial state (or promise of one).

The server resolves all `oninit()` functions before rendering.

### Forms

Hyperloop encourages using web forms wherever possible. A component's
onsubmit() handler will automatically receive the parsed form data as its
second argument. Using forms improves accessibility and ensures that your
application is usable with or without JS.

When using multiple forms on the same page, be sure to set `action=${this}`
which will ensure the correct onsubmit() handlers will be called during a POST
request to the server.

### Routing

Use the higher-order `hyperloop.Router` component to achieve lazy-loaded isomorphic routing.

```javascript
const { Component, Router } = require('@alexmingoia/hyperloop')

class App extends Component {
  render() {
    return this.html`
      <h1>Title</h1>
      <div>
        ${Router.for(this, {
          routes: {
            '/':      () => import('./Home'),
            '/about': () => import('./About'),
          }
        })
      </div>
    `
  }
}
```

The `import()` calls allow hyperloop to split the app into chunks and serve them on-demand.

## Reference

### Hyperloop.Component class

#### for()

```javascript
for(parent[, props, key])
```

Render component as a child of the given parent.

### Hyperloop.Component instance

#### defaultState()

```javascript
defaultState(props)
```

Returns an object used to set state when a component is instantiated. Equivelant to calling setState() in the constructor.

#### location.ip

#### location.path

#### location.query

#### location.redirect()

```javascript
redirect([code, ]url)
```

#### location.setStatus()

```javascript
setStatus(code)
```

#### location.userAgent

#### oninit()

Called when a component is instantied for the first time. All oninit() handlers are resolved prior to the first render.

#### on\[event]()

```javascript
on[event](event[, formData])
```

#### props

The props passed to the component when it was rendered.

#### render()

#### setState()

```javascript
setState(newState[, render = true])
```

Sets the new state and renders the app.

#### state

The application state. Do not modify directly, use setState() instead.

### Hyperloop.Router

#### props

- **afterPageChange**: called after page changes
- **beforePageChange**: called before page changes
- **notFound**: function that returns promisable component
- **pageTitle**: function which receives current state and returns page title
- **routes**: map of URL patterns to functions that return promisable components

When using import() the module path must be static not dynamic, so that webpack can properly transpile import() calls.

```javascript
const { Component, Router } = require('@alexmingoia/hyperloop')

class App extends Component {
  render() {
    return this.html`
      <h1>Title</h1>
      <div>
        ${Router.for(this, {
          routes: {
            '/':      () => import('./Home'),
            '/about': () => import('./About'),
          }
        })
      </div>
    `
  }
}
```
