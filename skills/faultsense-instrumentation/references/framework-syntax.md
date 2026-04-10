# Faultsense — Framework Syntax

The `fs-*` attributes are standard HTML attributes. They work in any framework that renders to the DOM.

---

## Plain HTML

```html
<button fs-assert="cart/add-item" fs-trigger="click"
  fs-assert-updated="#cart-count">
  Add to Cart
</button>
```

No special handling needed.

---

## React JSX

```jsx
<button fs-assert="cart/add-item" fs-trigger="click"
  fs-assert-updated="#cart-count"
  onClick={handleAddToCart}>
  Add to Cart
</button>
```

React passes unknown attributes through to the DOM on native elements (`<button>`, `<form>`, `<div>`, etc.). For custom components, ensure props are forwarded to the root DOM element.

### TypeScript Augmentation

To avoid TypeScript errors on `fs-*` attributes, extend React's `HTMLAttributes`:

```typescript
// src/types/faultsense.d.ts
declare namespace React {
  interface HTMLAttributes<T> {
    'fs-assert'?: string
    'fs-trigger'?: string
    'fs-assert-added'?: string
    'fs-assert-removed'?: string
    'fs-assert-updated'?: string
    'fs-assert-visible'?: string
    'fs-assert-hidden'?: string
    'fs-assert-loaded'?: string
    'fs-assert-stable'?: string
    'fs-assert-emitted'?: string
    'fs-assert-after'?: string
    'fs-assert-timeout'?: string
    'fs-assert-mpa'?: string
    'fs-assert-mutex'?: string
    'fs-assert-oob'?: string
    'fs-assert-oob-fail'?: string
    // Conditional: 'fs-assert-added-success'?: string, etc.
  }
}
```

Place this file anywhere TypeScript can find it (e.g., `src/types/`). No import needed — it augments the global namespace.

**Important:** React drops custom attributes with boolean `true` values. Always use explicit string values for `fs-*` attributes in JSX:
- `fs-assert-mutex="each"` (correct)
- `fs-assert-mutex` (incorrect — React emits `"true"`)

---

## Vue SFC

```vue
<template>
  <button fs-assert="cart/add-item" fs-trigger="click"
    fs-assert-updated="#cart-count"
    @click="handleAddToCart">
    Add to Cart
  </button>
</template>
```

Vue passes unknown attributes through via `inheritAttrs` (default: true).

---

## Svelte

```svelte
<button fs-assert="cart/add-item" fs-trigger="click"
  fs-assert-updated="#cart-count"
  on:click={handleAddToCart}>
  Add to Cart
</button>
```

Svelte passes unknown attributes through on native elements.

---

## HTMX + server templates (EJS, Handlebars, Nunjucks, ERB, Jinja, etc.)

HTMX ships server-rendered HTML fragments and swaps them into the DOM. `fs-*` attributes are authored in the template and arrive in the DOM as plain HTML — no framework glue required.

```ejs
<button
  hx-post="/todos"
  hx-target="#todo-list"
  hx-swap="beforeend"
  fs-assert="todos/add-item"
  fs-trigger="click"
  fs-assert-added=".todo-item">
  Add
</button>
```

### Dynamic assertion values from server state

The React JSX pattern of interpolating the EXPECTED NEXT STATE works identically with server templates:

```ejs
<input
  type="checkbox"
  <%= todo.completed ? 'checked' : '' %>
  hx-patch="/todos/<%= todo.id %>/toggle"
  hx-target="closest .todo-item"
  hx-swap="outerHTML"
  fs-assert="todos/toggle-complete"
  fs-trigger="change"
  fs-assert-updated=".todo-item[classlist=completed:<%= !todo.completed %>]" />
```

EJS `<%= !todo.completed %>` renders `true` or `false` into the attribute — the same semantics as React JSX `{!todo.completed}`. The server already knows the current state, so compute the negation in the template.

### HX-Trigger response header is the async dispatch path

For `fs-assert-emitted`, dispatch the CustomEvent via the HTMX `HX-Trigger` response header. HTMX fires the event on `document.body` after the swap settles — it bubbles to `document`, and the listener is already registered by the time the event fires. This avoids the synchronous-dispatch footgun documented under Common Mistakes #16.

```js
// Express + HTMX server
res.set('HX-Trigger', JSON.stringify({ 'todo:added': { text: todo.text } }))
res.render('partials/todo-item', { todo })
```

```html
<button
  fs-assert="todos/add-item"
  fs-trigger="click"
  fs-assert-emitted="todo:added">Add</button>
```

### `fs-assert-oob` is NOT `hx-swap-oob`

Same name, orthogonal concepts:

- **`fs-assert-oob`** (Faultsense): assertion routing. Fires a secondary assertion on a side-effect element when a named parent assertion passes or fails.
- **`hx-swap-oob`** (HTMX): DOM delivery. Allows a server response to replace multiple DOM targets in one round trip, not just the primary swap target.

You can use one, both, or neither. They don't interact.

### Preserve instrumentation across OOB swaps

Prefer `hx-swap-oob="innerHTML:#target"` over `hx-swap-oob="true"` (which is `outerHTML`). innerHTML replaces only the children, leaving the target element and its `fs-*` attributes intact across swaps. outerHTML replaces the element — any `fs-*` attributes you don't re-render on the server are lost.

```ejs
<!-- GOOD: #todo-count keeps its fs-* instrumentation across the OOB swap -->
<span hx-swap-oob="innerHTML:#todo-count"><%= uncompleted %>/<%= todos.length %> remaining</span>

<!-- RISKY: replaces the element, losing fs-assert-oob unless re-rendered -->
<div id="todo-count" hx-swap-oob="true">...</div>
```

See `examples/todolist-htmx/` for a complete worked example.
