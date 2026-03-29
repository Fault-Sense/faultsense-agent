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
