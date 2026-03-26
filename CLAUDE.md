# Faultsense Agent

Lightweight, zero-dependency browser agent that monitors feature health through real-time assertions declared via `fs-*` HTML attributes.

## Core Value Props

- **Semantic correctness:** Asserting that the *right* thing happened, not just that *something* happened.
- **Business logic verification:** Validating that features produce correct outcomes for real users in the field.
- **Negative assertions:** Detecting when something that should NOT have happened did (e.g., unexpected error states).
- **Feature health across releases:** Tracking whether specific features work or break as code ships.

These are the differentiators. No other production monitoring tool declaratively asserts correctness against real user sessions. Dead-click/rage-click detection, frustration heuristics, and ARIA contract monitoring are out of scope — they detect symptoms, not semantic failures, and other tools already cover them. Do not dilute the core value prop by chasing heuristic signals.

Explicit manual instrumentation is the moat, not a limitation. The value is directly proportional to the instrumentation effort — developers must think about what "correct" means and encode it. That's why no one else does this. The pitch: "you already think about correctness in your E2E tests — move those declarations into your HTML and get 100x the coverage against real users."

## How Faultsense Differentiates

- **vs. Session Replay (FullStory, LogRocket, Hotjar, PostHog):** These detect frustration symptoms after the fact — rage clicks, dead clicks, error clicks. They tell you "something is probably broken." Faultsense tells you "this specific thing is definitely broken, and here's what should have happened."
- **vs. Synthetic Monitoring (Datadog Synthetics, New Relic):** These run scripted tests in fake environments on a schedule. Faultsense runs assertions against real user sessions in production — real networks, real data, real device conditions.
- **vs. RUM (Datadog RUM, Sentry, New Relic Browser):** These measure performance (Core Web Vitals, load times, error rates). They answer "is the app fast?" not "is the app correct?" Faultsense answers correctness.
- **vs. E2E Tests (Playwright, Cypress):** These verify correctness but only in CI against test data. Faultsense verifies the same things but in the field, against every real user session, across every release.
- **vs. Error Tracking (Sentry, Bugsnag):** These catch thrown exceptions. Faultsense catches silent failures — features that don't error but simply don't produce the correct outcome.

## Instrumentation Guide

When asked to add Faultsense assertions to a component, reason about it the same way you'd write an E2E test: identify the user action (trigger), determine the expected outcome (assertion type + selector), and add optional checks (modifiers). The full API reference is in `llms-full.txt` at the repo root.

### Quick Reference

| Attribute | Purpose | Example |
|---|---|---|
| `fs-assert` | Assertion key (required) | `"checkout/submit-order"` |
| `fs-trigger` | Event trigger (required) | `"click"`, `"submit"`, `"mount"` |
| `fs-assert-added` | Element appears in DOM | `".success-msg"` |
| `fs-assert-removed` | Element removed from DOM | `".modal-content"` |
| `fs-assert-updated` | Element/subtree mutated | `"#cart-count"` |
| `fs-assert-visible` | Element exists and visible | `".dashboard"` |
| `fs-assert-hidden` | Element exists but hidden | `".loading-spinner"` |
| `fs-assert-loaded` | Media finished loading | `"#hero-image"` |
| `fs-assert-{type}-{condition}` | Conditional assertion (UI) | `fs-assert-added-success=".dashboard"` |
| `fs-assert-grouped` | Group conditionals across types | (no value) |
| `fs-assert-oob-{type}` | OOB: trigger on parent pass | `fs-assert-oob-updated="todos/toggle"` |
| `fs-assert-timeout` | Custom timeout (ms) | `"2000"` |
| `fs-assert-mpa` | Persist across page nav | `"true"` |

### Inline Modifiers (in assertion type value)

Modifiers are chained in the value using CSS-like bracket syntax:

```html
fs-assert-updated='#count[text-matches=\d+]'
fs-assert-updated='#logo[src=/img/new.png][alt=New Logo]'
fs-assert-updated='.panel[classlist=active:true,hidden:false]'
```

- `[text-matches=pattern]` — text content regex/string match
- `[classlist=class:true,class:false]` — class presence check
- `[attr=value]` — any other bracket is an attribute check (replaces attrs-match)

### Assertion Key Convention

Use `/` to group related assertions hierarchically, like file paths or package names:

```
fs-assert="checkout/add-to-cart"
fs-assert="checkout/submit-order"
fs-assert="profile/media/upload-photo"
fs-assert="auth/login"
```

The key must be stable across releases. Human-readable labels can be configured on the collector side.

### Self-Referencing Selectors

Omit the selector to check the element itself — provide only modifiers:

```html
fs-assert-updated="[text-matches=\d+/\d+ remaining]"
```

### Out-of-Band (OOB) Assertions

Side-effect elements (count labels, totals) can declare assertions triggered by another assertion's success, eliminating prop drilling:

```html
<div id="todo-count"
  fs-assert="todos/count-updated"
  fs-assert-oob-visible="todos/toggle-complete,todos/add-item,todos/remove-item"
  fs-assert-visible="[text-matches=\d+/\d+ remaining]">
  2/3 remaining
</div>
```

- `fs-assert-oob-{type}="key1,key2"` — fires when any listed parent assertion passes
- OOB only fires on parent **pass**, not fail
- No chaining: OOB passing does not trigger further OOB
- Selector is optional — omit for self-referencing
- **Use state assertions (`visible`, `hidden`, `added`, `removed`) with OOB, not event assertions (`updated`, `loaded`).** OOB assertions are created after the parent's DOM change already happened. State assertions check current DOM and resolve immediately. Event assertions (`updated`, `loaded`) require witnessing a mutation/event and will miss changes that already occurred.

### Placement

- Attributes go on the element the user interacts with (the `event.target`)
- For forms: `fs-trigger="submit"` on the `<form>` or `fs-trigger="click"` on the button
- `fs-*` attributes must reach the DOM — in React/Vue/Svelte, use native elements or forward props
- **React boolean attributes:** React drops custom attributes with boolean `true`. Use `fs-assert-grouped=""` not `fs-assert-grouped` in JSX.
- OOB assertions go on the **side-effect element**, not the trigger element

### Key Mistakes to Avoid

- **Don't put `fs-trigger` on a parent wrapper** — only the exact event target is processed
- **Conditional assertions are UI-based** — `fs-assert-added-success=".dashboard"` and `fs-assert-added-error=".error-msg"` create sibling assertions. First to resolve (selector matches) wins, others are dismissed. No server-side integration needed.
- **Condition keys are freeform** — any lowercase alphanumeric string with hyphens (e.g., `success`, `error`, `empty`, `rate-limited`). Avoid using assertion type names (`added`, `removed`, etc.) as condition keys.
- **`added` vs `updated`** — `added` = element doesn't exist yet; `updated` = element exists, content changes
- **`visible` vs `added`** — `visible` checks layout dimensions of existing element; `added` checks for new element in DOM
- **Don't use `updated` or `loaded` with OOB** — OOB assertions are created after the DOM change. `updated` and `loaded` need to witness the event and will miss it. Use `visible`, `hidden`, `added`, or `removed` instead.
- **Every element needs** `fs-assert` + `fs-trigger` + at least one assertion type

## Project Context

- The agent is open source and collector-agnostic. A hosted backend is a separate project.
- Market positioning (QA/testing tool) does not impact the agent's implementation or architecture.
- MPA (multi-page app) support is first-class — SPAs and MPAs should be equally supported.
- Conditional assertions use UI outcomes as the signal, not network responses. No server-side integration required.

## Notes

- **Queue/Storage refactor:** MPA-marked assertions currently bypass the in-memory queue and go directly to localStorage (`manager.ts:74`). Storage may be better modeled as an implementation detail of the queue. Flagged for future revisit.
- **Cross-type conditional grouping:** Conditional sibling groups default to `assertionKey + type`. Add `fs-assert-grouped` (no value) to link all conditionals on an element as siblings regardless of type — e.g., `fs-assert-removed-success` + `fs-assert-added-error` become mutually exclusive outcomes.

## Development

- `npm test` — run vitest (jsdom environment)
- `npm run build` — esbuild → `dist/faultsense-agent.min.js` (IIFE, minified)
