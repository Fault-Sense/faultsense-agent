<div align="center">
  <img src="https://raw.githubusercontent.com/Fault-Sense/faultsense-agent/main/assets/logo.svg" alt="Faultsense Logo" width="600">
</div>

## E2E Test Assertions That Run Against Real Users

Faultsense is a lightweight (8.6 KB gzipped) browser agent that validates feature correctness in production. Your AI coding assistant instruments the assertions — the same reasoning it uses to write Playwright or Cypress tests — and real user sessions validate them.

```html
<button
  fs-assert="checkout/submit-order"
  fs-trigger="click"
  fs-assert-added-success=".order-confirmation"
  fs-assert-added-error=".error-message[text-matches=try again]">
  Place Order
</button>
```

When a user clicks Place Order: if the order confirmation appears, the `success` condition passes. If an error message appears instead, the `error` condition passes. If neither happens, Faultsense reports a failure — which assertion, which release, what went wrong.

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

### Claude Code Plugin

Install the Faultsense skill for Claude Code:

```
claude plugin add Fault-Sense/faultsense-agent
```

Then ask Claude to instrument any component — the skill provides the full API reference and instrumentation patterns.

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
| `fs-assert-stable="<selector>"` | Element is NOT mutated during timeout window |
| `fs-assert-emitted="<event>"` | CustomEvent fires on document |
| `fs-assert-after="<key>"` | Parent assertion(s) have already passed |

### Conditional Assertions

Handle multiple outcomes from a single action using condition keys:

```html
<button fs-assert="auth/login" fs-trigger="click"
  fs-assert-added-success=".dashboard"
  fs-assert-added-error=".error-msg">Login</button>
```

First condition to match wins, others are dismissed. No server-side integration needed — the UI is the signal.

For cross-type conditionals (e.g., `removed-success` + `added-error`), use `fs-assert-mutex="each"` to group them.

### Inline Modifiers

Chained in the value using CSS-like bracket syntax:

```html
fs-assert-updated='#count[text-matches=\d+]'
fs-assert-updated='#logo[src=/img/new.png][alt=New Logo]'
fs-assert-updated='.panel[classlist=active:true,hidden:false]'
```

- `[text-matches=pattern]` — Text content regex match (partial)
- `[value-matches=pattern]` — Form control `.value` regex match (partial)
- `[checked=true|false]` — Checkbox/radio checked state
- `[disabled=true|false]` — Disabled state
- `[count=N]` / `[count-min=N]` / `[count-max=N]` — Element count
- `[classlist=class:true,class:false]` — Class presence check
- `[attr=value]` — Attribute check (full match)

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
| `load` / `error` | Resource loads or fails |
| `invariant` | Continuous monitoring |
| `hover` / `focus` / `input` | Interaction events |
| `keydown` / `keydown:<key>` | Key press events |
| `online` / `offline` | Connectivity changes |
| `event:<name>` | Custom event on document |

### Assertion Keys

Use `/` to group related assertions hierarchically:

```
fs-assert="checkout/add-to-cart"
fs-assert="checkout/submit-order"
fs-assert="profile/media/upload-photo"
```

Keys must be stable across releases. Human-readable labels are configured on the collector side.

### Element-Level Attributes

| Attribute | Purpose |
|---|---|
| `fs-assert-timeout="<ms>"` | SLA timeout — fail if not resolved in time |
| `fs-assert-mpa="true"` | Persist across page navigation (MPA) |
| `fs-assert-mutex="<mode>"` | Cross-type conditional grouping |
| `fs-assert-oob="<keys>"` | Trigger on parent assertion pass (OOB) |
| `fs-assert-oob-fail="<keys>"` | Trigger on parent assertion fail |

## Configuration

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `releaseLabel` | string | Yes | — | App version or commit hash |
| `collectorURL` | string or function | Yes | — | Backend endpoint or custom collector function |
| `apiKey` | string | If URL | — | API key for the collection endpoint |
| `timeout` | number | No | 1000 | Default assertion timeout (ms) |
| `debug` | boolean | No | false | Enable console logging |
| `userContext` | `Record<string, any>` | No | — | Arbitrary context attached to all payloads |

## Event Payload

Each resolved assertion sends this to the collector:

```ts
interface EventPayload {
  api_key: string;
  assertion_key: string;
  assertion_trigger: string;
  assertion_type: "added" | "removed" | "updated" | "visible" | "hidden" | "loaded" | "stable" | "emitted" | "after";
  assertion_type_value: string;
  assertion_type_modifiers: Record<string, string>;
  attempts: number[];
  condition_key: string;
  element_snapshot: string;
  release_label: string;
  status: "passed" | "failed";
  timestamp: string;
  user_context?: Record<string, any>;
  error_context?: {
    message: string;
    stack?: string;
    source?: string;
    lineno?: number;
    colno?: number;
  };
}
```

## Full API Reference

For the complete API reference including all assertion types, modifiers, OOB patterns, invariants, custom events, sequence assertions, and common patterns, see the [instrumentation guide](skills/faultsense-instrumentation/SKILL.md).

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

## Works With

Faultsense is framework-agnostic — it observes the DOM, not framework internals — so anything that ships HTML works. The table below is verified end-to-end against real framework dev servers via Playwright on every PR. Full results, per-scenario grid, and mutation-pattern coverage live in [`docs/works-with.md`](docs/works-with.md).

| Framework | Runtime | Coverage |
|---|---|---|
| React 19 + Vite | `conformance/react/` | 10/10 scenarios |
| Vue 3 + Vite | `conformance/vue3/` | 10/10 scenarios |
| Hotwire (Rails 8 + Turbo 8) | `conformance/hotwire/` (Docker) | 7/7 scenarios |
| HTMX 2 + Express | `conformance/htmx/` | 7/7 scenarios |

Adding a new framework means scaffolding a minimal harness and a driver file — see [`conformance/README.md`](conformance/README.md). The Layer 1 mutation-pattern suite at [`tests/conformance/`](tests/conformance/) locks in every DOM mutation shape the agent handles, so frameworks that produce those shapes are supported by transitivity — the Layer 2 drivers are empirical confirmation, not the source of truth.

## Package Info

- **Size**: 8.6 KB gzipped
- **Dependencies**: None
- **Browser Support**: Modern browsers (ES2020+)
- **Framework**: Any framework that renders HTML
- **License**: FSL-1.1-ALv2

## Worked Examples

The `examples/` directory contains reference ports you can run locally. The same assertion keys are used in each so you can diff them side-by-side and see how the instrumentation pattern works across rendering paradigms.

- **[todolist-tanstack](examples/todolist-tanstack/)** — React + TanStack Router + TanStack Start (virtual DOM, JSX interpolation for dynamic assertion values).
- **[todolist-htmx](examples/todolist-htmx/)** — HTMX 2 + Express + EJS (server-rendered fragments, hx-boost SPA nav, server-side interpolation for dynamic assertion values).

## Links
- [Documentation](https://www.faultsense.org/docs)
- [Interactive Examples](https://www.faultsense.org/examples)
- [Issues](https://github.com/Fault-Sense/faultsense-agent/issues)
- [Discussions](https://github.com/Fault-Sense/faultsense-agent/discussions)
