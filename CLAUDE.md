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
| `fs-trigger` | Event trigger (required) | `"click"`, `"submit"`, `"mount"`, `"invariant"`, `"event:cart-updated"`, `"event:cart-updated[detail-matches=action:increment]"` |
| `fs-assert-added` | Element appears in DOM | `".success-msg"` |
| `fs-assert-removed` | Element removed from DOM | `".modal-content"` |
| `fs-assert-updated` | Element/subtree mutated | `"#cart-count"` |
| `fs-assert-visible` | Element exists and visible | `".dashboard"` |
| `fs-assert-hidden` | Element exists but hidden | `".loading-spinner"` |
| `fs-assert-loaded` | Media finished loading | `"#hero-image"` |
| `fs-assert-stable` | Element NOT mutated (inverted updated) | `"#panel"` |
| `fs-assert-emitted` | CustomEvent fires on document | `"payment:complete"` or `"payment:complete[detail-matches=orderId:\\d+]"` |
| `fs-assert-after` | Sequence check: parent assertion(s) passed | `"checkout/add-to-cart"` or `"step/A,step/B"` |
| `fs-assert-{type}-{condition}` | Conditional assertion (UI) | `fs-assert-added-success=".dashboard"` |
| `fs-assert-mutex` | Conditional mutual exclusion mode | `"type"` (default), `"each"`, `"conditions"`, `"success,error"` |
| `fs-assert-oob` | OOB: trigger on parent pass | `fs-assert-oob="todos/toggle"` |
| `fs-assert-oob-fail` | OOB: trigger on parent fail | `fs-assert-oob-fail="todos/toggle"` |
| `fs-assert-timeout` | Custom timeout (ms) | `"2000"` |
| `fs-assert-mpa` | Persist across page nav | `"true"` |

### Inline Modifiers (in assertion type value)

Modifiers are chained in the value using CSS-like bracket syntax:

```html
fs-assert-updated='#count[text-matches=\d+]'
fs-assert-updated='#logo[src=/img/new.png][alt=New Logo]'
fs-assert-updated='.panel[classlist=active:true,hidden:false]'
```

- `[text-matches=pattern]` — text content regex, **partial match** (unanchored)
- `[value-matches=pattern]` — form control `.value` property regex, **partial match** (unanchored)
- `[checked=true|false]` — checkbox/radio `.checked` property
- `[disabled=true|false]` — disabled state (native `.disabled` or `aria-disabled`)
- `[focused=true|false]` — focus state (`document.activeElement === el`). Same MutationObserver caveat as `value-matches`.
- `[focused-within=true|false]` — focus-within state (`el.matches(':focus-within')`)
- `[count=N]` / `[count-min=N]` / `[count-max=N]` — element count from `querySelectorAll`
- `[classlist=class:true,class:false]` — class presence check
- `[attr=value]` — attribute check with regex, **full match** (auto-anchored `^(?:value)$`). Supports `|` alternation: `[data-state=active|ready]`

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

### Conditional Assertions

Use condition keys to handle mutually exclusive outcomes from a single user action:

```html
<!-- Login: success vs error -->
<button fs-assert="auth/login" fs-trigger="click"
  fs-assert-added-success=".dashboard"
  fs-assert-added-error=".error-msg">Login</button>
```

- Condition keys are freeform lowercase alphanumeric strings with hyphens (e.g., `success`, `error`, `empty`, `rate-limited`)
- Multiple condition keys on the same element and type form a **sibling group** — first to resolve wins, others dismissed
- 3+ conditionals work as a switch: `fs-assert-added-success`, `fs-assert-added-error`, `fs-assert-added-empty`
- No server-side integration needed — the UI is the signal

**Cross-type mutex (`fs-assert-mutex`):** Controls mutual exclusion of conditional assertions. Four modes:

- **`"type"`** — same-type conditionals race (default). `added-success` vs `added-error` are mutually exclusive; cross-type conditionals resolve independently. This is the behavior when `fs-assert-mutex` is omitted.
- **`"each"`** — all conditionals on the element race as one group. First to resolve wins, all others dismissed.
- **`"conditions"`** — condition keys form outcome groups. When one key wins, assertions with different keys are dismissed. Same-key assertions resolve independently.
- **`"success,error"`** — selective: only listed condition keys compete. Unlisted keys resolve independently.

`fs-assert-mutex` requires an explicit value — `fs-assert-mutex=""` is invalid and logs a warning.

**`mutex="each"`** — all conditionals race, first wins:

```html
<!-- Delete: remove on success, show error on failure -->
<button fs-assert="todos/remove-item" fs-trigger="click"
  fs-assert-mutex="each"
  fs-assert-removed-success=".todo-item"
  fs-assert-added-error=".error-msg"
  fs-assert-timeout="5000">Delete</button>
```

**`mutex="conditions"`** — condition keys compete as outcome groups:

```html
<!-- Add: success needs BOTH DOM change AND custom event. Error needs just DOM. -->
<button fs-assert="todos/add-item" fs-trigger="click"
  fs-assert-mutex="conditions"
  fs-assert-added-success=".todo-item"
  fs-assert-emitted-success="todo:added"
  fs-assert-added-error=".add-error">Add</button>
```

When success wins, error is dismissed but both success assertions (`added` and `emitted`) resolve independently. When error wins, both success assertions are dismissed.

**`mutex="success,error"`** — selective: only listed keys compete:

```html
<button fs-assert="checkout/submit" fs-trigger="click"
  fs-assert-mutex="success,error"
  fs-assert-added-success=".confirmation"
  fs-assert-added-error=".error-msg"
  fs-assert-updated-analytics="#tracking-pixel">Submit</button>
```

Only `success` and `error` are mutually exclusive. The `analytics` assertion resolves independently regardless of which condition wins.

### Invariant Assertions

Continuous monitoring for conditions that should always hold — catches failures without user action:

```html
<!-- Nav should always be visible -->
<nav id="main-nav"
  fs-assert="layout/nav-visible"
  fs-trigger="invariant"
  fs-assert-visible="#main-nav">
```

- Invariants stay **pending** and produce no collector traffic while the condition holds
- Only **failures** (violations) and **recoveries** (pass after failure) are reported
- On page unload, pending invariants are auto-passed as the "all clear" signal
- No timeout — invariants are perpetual for the page lifetime
- Best with state types (`visible`, `hidden`). Event types (`updated`, `loaded`) are allowed but warned against.

### Out-of-Band (OOB) Assertions

Side-effect elements (count labels, totals, toasts, error indicators) can declare assertions triggered by another assertion's pass or fail, eliminating prop drilling. `fs-assert-oob` / `fs-assert-oob-fail` replace `fs-trigger` on OOB elements. Assertion types are declared normally via `fs-assert-{type}`.

```html
<div id="todo-count"
  fs-assert="todos/count-updated"
  fs-assert-oob="todos/toggle-complete,todos/add-item,todos/remove-item"
  fs-assert-visible="[text-matches=\d+/\d+ remaining]">
  2/3 remaining
</div>
```

- `fs-assert-oob="key1,key2"` — fires when any listed parent assertion **passes**
- `fs-assert-oob-fail="key1,key2"` — fires when any listed parent assertion **fails** (timeout, GC, SLA). Dismissed assertions (losing conditional siblings) do NOT trigger oob-fail.
- Both can coexist on the same element as independent triggers
- No chaining: OOB passing does not trigger further OOB
- Selector is optional — omit for self-referencing
- **Use state assertions (`visible`, `hidden`, `added`, `removed`) with OOB, not event assertions (`updated`, `loaded`).** OOB assertions are created after the parent's DOM change already happened.

**Multi-check outcomes with OOB:** To verify multiple things on a conditional success (e.g., delete removes the row AND shows a toast), use OOB on the secondary element:

```html
<!-- Primary: conditional on the trigger element -->
<button fs-assert="todos/remove-item" fs-trigger="click"
  fs-assert-mutex="each"
  fs-assert-removed-success=".todo-item"
  fs-assert-added-error=".error-msg">Delete</button>

<!-- Secondary: OOB checks the toast appeared after successful delete -->
<div class="toast-container"
  fs-assert="todos/delete-toast"
  fs-assert-oob="todos/remove-item"
  fs-assert-visible=".success-toast">
</div>
```

### Sequence Assertions (Multi-Step Flows)

Validate that user actions happen in the correct order. `fs-assert-after` checks whether referenced parent assertions have already passed when the trigger fires.

```html
<!-- Step 1: Add to cart -->
<button fs-assert="checkout/add-to-cart" fs-trigger="click"
  fs-assert-added=".cart-item">Add to Cart</button>

<!-- Step 2: Must have added to cart first -->
<button fs-assert="checkout/submit-payment" fs-trigger="click"
  fs-assert-after="checkout/add-to-cart"
  fs-assert-visible=".confirmation">Pay Now</button>
```

- Value is one or more assertion keys (comma-separated). ALL must have passed (AND semantics).
- Resolves immediately: passes if all parents passed, fails otherwise.
- Produces an independent data point alongside any DOM/route assertions on the same element.
- Failed `after` assertions can recover via re-trigger if the parent passes later.
- Chaining works: A → B → C, each `after` checks only its direct parent.
- **Don't combine with `fs-trigger="invariant"`** — invariants skip immediate resolution, so `after` would never be checked.

### Custom Event Assertions

Two features for integrating with application-level CustomEvents dispatched on `document`.

**Custom Event Triggers** (`fs-trigger="event:<name>"`): Trigger assertion evaluation when a named CustomEvent fires on `document`. Listeners are registered automatically at init and via MutationObserver for dynamically added elements. Works with all existing assertion types.

```html
<!-- Trigger on a custom event -->
<div fs-assert="cart/sync" fs-trigger="event:cart-updated"
  fs-assert-visible="#cart-count[text-matches=\d+]">
</div>

<!-- With detail-matches: shallow string equality on event.detail properties -->
<div fs-assert="cart/item-added" fs-trigger="event:cart-updated[detail-matches=action:increment]"
  fs-assert-updated="#cart-count">
</div>
```

- `detail-matches` does shallow string equality on `event.detail` properties (e.g., `action:increment` checks `event.detail.action === "increment"`)
- Without `detail-matches`, any dispatch of the named event triggers the assertion

**Emitted Assertion Type** (`fs-assert-emitted="<eventName>"`): Passes when a matching CustomEvent fires on `document`. The value is an event name, optionally with `detail-matches` using regex matching.

```html
<!-- Assert that a payment:complete event fires after clicking Pay -->
<button fs-assert="checkout/payment" fs-trigger="click"
  fs-assert-emitted="payment:complete[detail-matches=orderId:\d+]">
  Pay Now
</button>
```

- `detail-matches` on `emitted` uses **regex matching** (unlike the trigger version which uses string equality)
- NOT compatible with MPA mode — warns and ignores `fs-assert-mpa` on elements with `emitted`
- **Synchronous dispatch limitation:** if the CustomEvent is dispatched synchronously in the same click handler, the event fires before the assertion is created. Use async dispatch (API callbacks, `setTimeout`, Promises) instead.

### Placement

- Attributes go on the element the user interacts with (the `event.target`)
- For forms: `fs-trigger="submit"` on the `<form>` or `fs-trigger="click"` on the button
- `fs-*` attributes must reach the DOM — in React/Vue/Svelte, use native elements or forward props
- **React boolean attributes:** React drops custom attributes with boolean `true`. Always use explicit string values for `fs-*` attributes in JSX (e.g., `fs-assert-mutex="each"`).
- OOB assertions go on the **side-effect element**, not the trigger element

### Key Mistakes to Avoid

- **Don't put `fs-trigger` on a parent wrapper** — only the exact event target is processed
- **Conditional assertions are UI-based** — `fs-assert-added-success=".dashboard"` and `fs-assert-added-error=".error-msg"` create sibling assertions. First to resolve (selector matches) wins, others are dismissed. No server-side integration needed.
- **Condition keys are freeform** — any lowercase alphanumeric string with hyphens (e.g., `success`, `error`, `empty`, `rate-limited`). Avoid using assertion type names (`added`, `removed`, etc.) as condition keys.
- **`added` vs `updated`** — `added` = element doesn't exist yet; `updated` = element exists, content changes
- **`visible` vs `added`** — `visible` checks layout dimensions of existing element; `added` checks for new element in DOM
- **Broad selectors in lists** — `.todo-text` matches ALL items in a list. `added` may resolve against the wrong sibling. Use `updated` when the specific element's content changes, or narrow with IDs/data attributes (`.todo-text[data-id=123]`). `updated` tracks the specific mutation; `added` just checks if any matching element appeared.
- **Don't use `updated` or `loaded` with OOB** — OOB assertions are created after the DOM change. `updated` and `loaded` need to witness the event and will miss it. Use `visible`, `hidden`, `added`, or `removed` instead.
- **Invariants use `visible`/`hidden`** — `fs-trigger="invariant"` creates perpetual assertions that only report failures. Use state-based types (`visible`, `hidden`). Event types (`updated`, `loaded`) are allowed but warned against.
- **`stable` is inverted `updated`** — passes when NO mutation occurs within the timeout window, fails on any mutation. Best used with OOB (trigger stable after an expected mutation passes) or with `fs-assert-timeout` for explicit stability windows. Works with `invariant` trigger for perpetual "never mutate" monitoring.
- **`count` requires an explicit selector** — self-referencing count (no selector) is always 1 and will warn at parse time.
- **`value-matches` reads `.value` property, not attribute** — only meaningful on form controls (`input`, `textarea`, `select`). MutationObserver doesn't fire on `.value` changes, so use with event triggers (`change`, `blur`).
- **`checked` is separate from `value-matches`** — `el.value` and `el.checked` are different DOM properties. Use `[checked=true]` for checkbox/radio state.
- **Don't use `emitted` with MPA mode** — `fs-assert-emitted` listens for live CustomEvents on `document`. MPA assertions persist to localStorage and resolve on the next page load, where the event will never re-fire. The agent warns and ignores `fs-assert-mpa` on elements with `emitted`.
- **Don't dispatch CustomEvents synchronously in the trigger handler** — if a click handler dispatches a CustomEvent synchronously, it fires before the assertion is created. Use async dispatch (`setTimeout`, Promises, API callbacks) so the event fires after the agent has set up the listener.
- **Every element needs** `fs-assert` + `fs-trigger` (or `fs-assert-oob`/`fs-assert-oob-fail`) + at least one assertion type

## Project Context

- The agent is open source and collector-agnostic. A hosted backend is a separate project.
- Market positioning (QA/testing tool) does not impact the agent's implementation or architecture.
- MPA (multi-page app) support is first-class — SPAs and MPAs should be equally supported.
- Conditional assertions use UI outcomes as the signal, not network responses. No server-side integration required.

## Notes

- **Queue/Storage refactor:** MPA-marked assertions currently bypass the in-memory queue and go directly to localStorage (`manager.ts:74`). Storage may be better modeled as an implementation detail of the queue. Flagged for future revisit.
- **Cross-type conditional mutex:** Conditional sibling groups default to `assertionKey + type`. Use `fs-assert-mutex` to link conditionals across types — e.g., `fs-assert-mutex="each"` makes `fs-assert-removed-success` + `fs-assert-added-error` mutually exclusive. See `"each"`, `"conditions"`, and selective modes.

## Timeout Model

Assertions resolve naturally when the DOM changes. No default per-assertion timer.

- **GC sweep** (`config.gcInterval`, default 30s) — a background timer cleans up stale assertions that never resolved.
- **SLA timeout** (`fs-assert-timeout="2000"`) — opt-in per-assertion timer for performance contracts.
- **Page unload** — assertions older than `config.unloadGracePeriod` (default 2s) are failed on page close. Fresh assertions are silently dropped (user navigated, not a failure). Uses `sendBeacon` for reliable delivery.
- **Re-trigger tracking** — when a trigger fires on a pending assertion, the timestamp is recorded in an `attempts[]` array on the assertion. Included in the collector payload for rage-click analysis.

## Error Context

JS errors do not instantly fail assertions. When an uncaught exception occurs, all pending assertions are tagged with `errorContext` (first error wins — subsequent errors do not overwrite). The assertion continues resolving normally via DOM observation, timeout, or GC.

- **Passes with errorContext:** the feature worked but a JS error occurred in the session — tells the collector "passed but investigate."
- **Fails with errorContext:** the feature broke and here's the likely cause.
- The collector derives human-readable failure messages from assertion metadata (type, selector, modifiers, timeout). No failure reason strings are generated by the agent.

## Configuration

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `releaseLabel` | string | Yes | — | App version or commit hash |
| `collectorURL` | string or function | Yes | — | Backend endpoint URL or custom collector function |
| `apiKey` | string | If URL | — | API key (required when collectorURL is a URL) |
| `timeout` | number | No | 1000 | Default assertion timeout in ms |
| `debug` | boolean | No | false | Enable console logging |
| `userContext` | `Record<string, any>` | No | — | Arbitrary context attached to all assertion payloads (e.g., userId, plan tier) |

## API Methods

- **`Faultsense.init(config)`** — initialize the agent with configuration options.
- **`Faultsense.cleanup()`** — tear down the agent, remove all listeners and observers.
- **`Faultsense.registerCleanupHook(fn)`** — register a function to run during cleanup.
- **`Faultsense.setUserContext(context)`** — replace the current user context. Does not merge — pass the complete context each time. Subsequent assertion payloads include the updated context.

```javascript
// At init
Faultsense.init({
  releaseLabel: '1.0.0',
  collectorURL: '...',
  userContext: { plan: 'pro' }
});

// After login
Faultsense.setUserContext({ userId: 'u_123', plan: 'pro' });
```

## Development

- `npm test` — run vitest (jsdom environment)
- `npm run build` — esbuild → `dist/faultsense-agent.min.js` (IIFE, minified)
