<div align="center">
  <img src="https://raw.githubusercontent.com/Fault-Sense/faultsense-agent/main/assets/logo.svg" alt="Faultsense Logo" width="600">
</div>

## E2E Test Assertions That Run Against Real Users

Faultsense is a lightweight (6.5 KB gzipped) browser agent that validates feature correctness in production. Your AI coding assistant instruments the assertions — the same reasoning it uses to write Playwright or Cypress tests — and real user sessions validate them.

```html
<button
  fs-assert="checkout/submit-order"
  fs-trigger="click"
  fs-assert-added-201=".order-confirmation"
  fs-assert-added-4xx=".error-message[text-matches=try again]">
  Place Order
</button>
```

When a user clicks Place Order: if the API returns 201, the order confirmation should appear. If 4xx, an error message should appear. If neither happens, Faultsense reports a failure — which assertion, which release, what went wrong.

## Quick Start

### Installation

```html
<script
  defer
  id="fs-agent"
  src="https://unpkg.com/faultsense@latest/dist/faultsense-agent.min.js"
  data-release-label="0.0.0"
  data-collector-url="console"
  data-debug="true"
/>
```

Or initialize manually:

```html
<script src="https://unpkg.com/faultsense@latest/dist/faultsense-agent.min.js"></script>
<script>
document.addEventListener('DOMContentLoaded', () => {
  Faultsense.init({
    releaseLabel: '0.0.0',
    collectorURL: Faultsense.collectors.consoleCollector,
    debug: true
  });
});
</script>
```

### Tell Your AI to Instrument

Ask your AI coding assistant to add Faultsense assertions to a component. It already knows how — same reasoning as writing E2E tests.

```
"Add faultsense assertions to the checkout form component"
```

The AI reads your component, understands what should happen when users interact with it, and generates the `fs-*` attributes.

## How It Works

Every assertion needs three things:

1. **A key** — `fs-assert="checkout/submit-order"` identifies this assertion
2. **A trigger** — `fs-trigger="click"` defines when the assertion activates
3. **An expected outcome** — `fs-assert-added=".success"` defines what should happen

### Assertion Types

Value is a CSS selector, optionally with inline modifiers in brackets.

| Attribute | Resolves when |
|---|---|
| `fs-assert-added="<selector>"` | Element appears in the DOM |
| `fs-assert-removed="<selector>"` | Element is removed from the DOM |
| `fs-assert-updated="<selector>"` | Element or subtree is mutated |
| `fs-assert-visible="<selector>"` | Element exists and is visible |
| `fs-assert-hidden="<selector>"` | Element exists but is hidden |
| `fs-assert-loaded="<selector>"` | Media element finishes loading |

### Response-Conditional Assertions

Append an HTTP status code to any assertion type. The response determines which DOM assertion to check:

```html
fs-assert-added-200=".success"     <!-- on 200, assert .success appears -->
fs-assert-added-4xx=".error"       <!-- on 4xx, assert .error appears -->
fs-assert-removed-200=".todo-item" <!-- on 200, assert item is removed -->
```

Status can be exact (`200`, `404`) or a range (`2xx`, `4xx`, `5xx`). Exact takes priority. Multiple conditions per element create independent assertions — when one matches, siblings are silently dismissed.

Requires the `fs-resp-for` header to link the response to the assertion:
- Request header: `fetch(url, { headers: { "fs-resp-for": "checkout/submit-order" } })`
- Response header: `fs-resp-for: checkout/submit-order`
- Query param: `?fs-resp-for=checkout/submit-order`

### Inline Modifiers

Chained in the value using CSS-like bracket syntax:

```html
fs-assert-updated='#count[text-matches=\d+]'
fs-assert-updated='#logo[src=/img/new.png][alt=New Logo]'
fs-assert-updated='.panel[classlist=active:true,hidden:false]'
```

- `[text-matches=pattern]` — Text content regex/string match
- `[classlist=class:true,class:false]` — Class presence check
- `[attr=value]` — Any other key is an attribute check

### Triggers

| Trigger | When it fires |
|---|---|
| `click` | Element is clicked |
| `dblclick` | Element is double-clicked |
| `change` | Input value changes |
| `blur` | Element loses focus |
| `submit` | Form is submitted |
| `mount` | Element is added to the DOM |
| `unmount` | Element is removed from the DOM |
| `load` | Resource finishes loading |
| `error` | Resource fails to load |

### Assertion Keys

Use `/` to group related assertions hierarchically:

```
fs-assert="checkout/add-to-cart"
fs-assert="checkout/submit-order"
fs-assert="profile/media/upload-photo"
```

Keys must be stable across releases. Human-readable labels are configured on the collector side.

### Element-Level Modifiers

```html
fs-assert-timeout="2000"  <!-- Override default timeout (ms) -->
fs-assert-mpa="true"      <!-- Persist across page navigation -->
```

## Configuration

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `releaseLabel` | string | Yes | — | App version or commit hash |
| `collectorURL` | string or function | Yes | — | Backend endpoint or custom collector function |
| `apiKey` | string | If URL | — | API key for the collection endpoint |
| `timeout` | number | No | 1000 | Default assertion timeout (ms) |
| `debug` | boolean | No | false | Enable console logging |

## Event Payload

Each resolved assertion sends this to the collector:

```ts
interface EventPayload {
  assertion_key: string;
  assertion_trigger: string;
  assertion_type: "added" | "removed" | "updated" | "visible" | "hidden" | "loaded";
  assertion_type_value: string;
  assertion_type_modifiers: Record<string, string>;
  element_snapshot: string;
  release_label: string;
  status: "passed" | "failed";
  status_reason: string;
  timestamp: string;
}
```

## Framework Usage

The `fs-*` attributes work in any framework that renders to the DOM.

#### React JSX
```jsx
<button onClick={handleAdd}
  fs-assert="cart/add-item" fs-trigger="click"
  fs-assert-updated="#cart-count">
  Add to Cart
</button>
```

#### Vue SFC
```vue
<template>
  <button @click="handleAdd"
    fs-assert="cart/add-item" fs-trigger="click"
    fs-assert-updated="#cart-count">
    Add to Cart
  </button>
</template>
```

#### Svelte
```svelte
<button on:click={handleAdd}
  fs-assert="cart/add-item" fs-trigger="click"
  fs-assert-updated="#cart-count">
  Add to Cart
</button>
```

## Package Info

- **Size**: 6.8 KB gzipped
- **Dependencies**: None
- **Browser Support**: Modern browsers (ES2020+)
- **Framework**: Any framework that renders HTML
- **License**: FSL-1.1-ALv2

## Links
- [Documentation](https://www.faultsense.org/docs)
- [Interactive Examples](https://www.faultsense.org/examples)
- [Issues](https://github.com/Fault-Sense/faultsense-agent/issues)
- [Discussions](https://github.com/Fault-Sense/faultsense-agent/discussions)
