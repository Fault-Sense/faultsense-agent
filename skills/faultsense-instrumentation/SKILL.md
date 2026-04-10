---
name: faultsense-instrumentation
description: This skill should be used when instrumenting web applications with Faultsense production assertion monitoring. Use when asked to "add assertions", "add monitoring", "instrument this component", "add faultsense", "add fs-* attributes", or when building features that need production correctness validation. Also activates when reviewing or modifying existing fs-* instrumentation.
---

# Faultsense Instrumentation

Faultsense is a lightweight, zero-dependency browser agent that validates feature correctness in production through declarative HTML attribute assertions. Think of it as E2E test assertions built into your HTML — running against every real user session.

**Guard clause:** This skill instruments web applications that render to browser DOM. If the target file does not produce HTML output (e.g., backend API code, mobile app, CLI tool), explain this to the user and suggest where in their project the instrumentation belongs instead.

## Context Detection

Before instrumenting, scan the codebase:

1. **Framework:** What renders the HTML? (React, Vue, Svelte, plain HTML, SSR framework)
2. **Existing instrumentation:** Are there already `fs-*` attributes? Follow the established assertion key convention and patterns.
3. **Component patterns:** What interactive elements exist? Forms, buttons, modals, tabs, lists with CRUD?

If existing `fs-*` attributes are found, read them to understand the naming convention and assertion style already in use. Extend it — don't reinvent.

## How to Think About Instrumentation

Reason about each component the same way you'd write an E2E test:

1. **Identify the trigger** — What user action starts this? A click, form submit, page load?
2. **Determine the expected outcome** — What DOM change proves the feature worked correctly?
3. **Choose the assertion type** — Which type matches the expected DOM change?
4. **Add modifiers only when needed** — Refine the check when the default is too broad.

The value of Faultsense is directly proportional to the thought put into what "correct" means. Don't add assertions mechanically — reason about what the user expects to happen and what would constitute a silent failure.

## Decision Tree: Which Assertion Type?

Choose the right type based on the expected DOM outcome:

```
Is the target element NEW (doesn't exist before the action)?
├── YES → fs-assert-added=".selector"
│         (element will be created in the DOM)
└── NO → The element already exists. What changes?
         ├── Content/attributes change → fs-assert-updated=".selector"
         │   (text, attributes, or children mutate)
         ├── Element will be removed → fs-assert-removed=".selector"
         │   (element leaves the DOM entirely)
         ├── Need to verify it's visible → fs-assert-visible=".selector"
         │   (exists AND has layout dimensions — not display:none)
         ├── Need to verify it's hidden → fs-assert-hidden=".selector"
         │   (exists but has NO layout dimensions)
         ├── Media element loads → fs-assert-loaded=".selector"
         │   (img/video/iframe finishes loading)
         └── Element should NOT change → fs-assert-stable=".selector"
             (passes when NO mutation occurs within the timeout window)
```

**Special assertion types (not DOM-based):**
- `fs-assert-emitted="eventName"` — A named CustomEvent fires on `document`
- `fs-assert-after="key1,key2"` — Referenced parent assertions have already passed (sequence validation)

**The critical distinction:** `added` = element doesn't exist yet. `updated` = element exists, content changes. `visible` = element exists, check it has dimensions. Getting this wrong is the #1 instrumentation mistake.

**Mutation-observed vs query-based:** `added`, `removed`, and `updated` resolve from MutationObserver records — they capture the exact moment a DOM change happens and can't be missed. `visible` and `hidden` resolve via point-in-time `querySelector` + layout checks — if an element appears and disappears quickly (e.g., fast edit → save), the check can race and miss it. **Prefer mutation-observed types for elements with short lifetimes.** Use `added`/`removed` for conditionally rendered elements, not `visible`/`hidden`.

---

## API Reference

### Required Attributes

Every instrumented element needs all three:

| Attribute | Purpose | Example |
|---|---|---|
| `fs-assert="<key>"` | Assertion key (hierarchical, `/`-separated) | `"checkout/submit-order"` |
| `fs-trigger="<event>"` | What user action triggers it | `"click"`, `"submit"`, `"mount"`, `"invariant"` |
| `fs-assert-<type>="<selector>"` | Expected DOM outcome | `fs-assert-added=".success-msg"` |

For OOB (out-of-band) elements, `fs-assert-oob` or `fs-assert-oob-fail` replaces `fs-trigger`.

### Assertion Key Convention

Use `/` separators to group related assertions hierarchically:

```
todos/add-item
todos/remove-item
checkout/submit-order
profile/media/upload-photo
```

Keys must be stable across releases. Use the feature area as the prefix, the action as the suffix. Human-readable labels are configured on the collector side, not in the HTML.

### Triggers

`fs-trigger="<value>"` — Exactly one required per element.

| Trigger | When it fires | Typical elements |
|---|---|---|
| `click` | Element is clicked | button, a, div, span |
| `dblclick` | Element is double-clicked | Any |
| `change` | Input value changes | input, select, textarea, checkbox |
| `blur` | Element loses focus | input, textarea |
| `submit` | Form is submitted | form |
| `mount` | Element is added to the DOM | Any (useful for page load validation) |
| `unmount` | Element is removed from the DOM | Any |
| `load` | Resource finishes loading | img, video, iframe |
| `error` | Resource fails to load | img, video, iframe |
| `invariant` | Continuously monitors — only reports failures and recoveries | Any (best with `visible`/`hidden`) |
| `hover` | Mouse enters the element (alias for `mouseenter`) | Any |
| `focus` | Element receives focus (alias for `focusin`) | input, button, a |
| `input` | Value changes while typing | input, textarea |
| `keydown` | Any key is pressed | Any focusable element |
| `keydown:<key>` | Specific key pressed (e.g., `keydown:Escape`, `keydown:ctrl+s`) | Any focusable element |
| `online` | Browser connectivity restored | Any |
| `offline` | Browser connectivity lost | Any |
| `event:<name>` | Named CustomEvent fires on `document` | Any |
| `event:<name>[detail-matches=key:value]` | CustomEvent fires with matching `event.detail` properties (shallow string equality) | Any |

### Assertion Types

At least one required. Value is a CSS selector, optionally with inline modifiers in brackets.

**DOM Assertions:**

| Attribute | Resolves when |
|---|---|
| `fs-assert-added="<selector>"` | A new element matching the selector appears in the DOM |
| `fs-assert-removed="<selector>"` | An element matching the selector is removed from the DOM |
| `fs-assert-updated="<selector>"` | The matched element or its subtree is mutated (text, attributes, children) |
| `fs-assert-visible="<selector>"` | The matched element exists and has layout dimensions |
| `fs-assert-hidden="<selector>"` | The matched element exists but has no layout dimensions |
| `fs-assert-loaded="<selector>"` | A media element (img/video) matching the selector finishes loading |
| `fs-assert-stable="<selector>"` | The matched element's subtree is NOT mutated during the timeout window (inverted `updated`) |

**Event Assertions:**

| Attribute | Resolves when |
|---|---|
| `fs-assert-emitted="<eventName>"` | A matching CustomEvent fires on `document`. Optionally with `[detail-matches=key:pattern]` for regex matching on `event.detail` properties. |

`emitted` listens for live CustomEvents on `document`. `detail-matches` uses regex (partial match) — e.g., `payment:complete[detail-matches=orderId:\d+]`. NOT compatible with MPA mode. Synchronous dispatch from the same trigger handler fires before the assertion is created — use async dispatch.

**Sequence Assertions:**

| Attribute | Resolves when |
|---|---|
| `fs-assert-after="<key>"` | All referenced parent assertion keys have already passed. Comma-separated for multiple (AND semantics). |

`after` resolves immediately at creation time — passes if all parents passed, fails otherwise. Produces an independent data point alongside any DOM assertions on the same element. Failed `after` assertions recover on re-trigger if parents have since passed. Don't combine with `fs-trigger="invariant"`.

**Conditional Assertions** — append a condition key to the type name:

`fs-assert-{type}-{condition-key}="<selector>"`

Condition keys are freeform lowercase alphanumeric strings with hyphens (e.g., `success`, `error`, `empty`, `rate-limited`). Multiple condition keys on the same element and type form a sibling group — first to resolve wins, others dismissed. No server-side integration needed.

```html
<button fs-assert="auth/login" fs-trigger="click"
  fs-assert-added-success=".dashboard"
  fs-assert-added-error=".error-msg">Login</button>
```

### Inline Modifiers

Modifiers are chained in the attribute value using CSS-like bracket syntax after the selector:

```html
fs-assert-updated='#count[text-matches=\d+]'
fs-assert-updated='#logo[src=/img/new.png][alt=New Logo]'
fs-assert-updated='.panel[classlist=active:true,hidden:false]'
fs-assert-added-success='.success[text-matches=Order #\d+]'
```

**Reserved modifier keys:**

| Key | Description |
|---|---|
| `[text-matches=<pattern>]` | Text content must match (regex, **partial match** — unanchored). Use `^exact$` to anchor. |
| `[value-matches=<pattern>]` | Form control `.value` property must match (regex, **partial match** — unanchored). Works on `input`, `textarea`, `select`. Reads the live DOM property, not the HTML attribute. |
| `[checked=true\|false]` | Checkbox/radio `.checked` DOM property. |
| `[disabled=true\|false]` | Disabled state. Checks native `.disabled` property and `aria-disabled="true"`. |
| `[focused=true\|false]` | Focus state. Checks `document.activeElement === el`. |
| `[focused-within=true\|false]` | Focus-within state. Checks `el.matches(':focus-within')`. |
| `[count=N]` | Exactly N elements must match the selector. |
| `[count-min=N]` | At least N elements must match the selector. |
| `[count-max=N]` | At most N elements must match the selector. |
| `[classlist=<class:bool,...>]` | Class presence check. Format: `active:true,hidden:false`. |

**Unreserved keys** are treated as attribute checks (regex, **full match** — auto-anchored with `^(?:...)$`):

| Example | Checks |
|---|---|
| `[src=/img/logo.png]` | `src` exactly matching `/img/logo.png` |
| `[data-state=active]` | `data-state` exactly matching `"active"` |
| `[data-state=active\|ready]` | `data-state` matching `"active"` or `"ready"` |
| `[aria-expanded=true]` | `aria-expanded="true"` attribute |

Multiple attribute checks can be chained: `#logo[src=/img/new.png][width=100][alt=Logo]`

**Regex anchoring summary:**
- `text-matches` and `value-matches`: **partial match** (unanchored) — pattern can match anywhere in the string
- Attribute checks (unreserved keys): **full match** (auto-anchored) — pattern must match the entire value

### Self-Referencing Selectors

When the assertion target is the element itself, omit the selector and provide only modifiers:

```html
<div id="todo-count"
  fs-assert-updated="[text-matches=\d+/\d+ remaining]">
```

The empty selector before `[` means "check this element."

### Element-Level Attributes

| Attribute | Description |
|---|---|
| `fs-assert-timeout="<ms>"` | SLA timeout — fail if not resolved within this time. Opt-in; assertions without this resolve naturally or are cleaned up by GC. |
| `fs-assert-mpa="true"` | Multi-page assertion. Persisted to localStorage and resolved on the next page load. |
| `fs-assert-mutex="<mode>"` | Cross-type conditional grouping. Requires an explicit value (`""` is invalid and warns). See Conditional Assertions below. |

### Conditional Assertions

Conditional assertions use a `{condition-key}` suffix to define multiple possible outcomes:

```html
<button fs-assert="auth/login" fs-trigger="click"
  fs-assert-added-success=".dashboard"
  fs-assert-added-error=".error-msg">Login</button>
```

Condition keys are freeform lowercase alphanumeric with hyphens: `success`, `error`, `empty`, `rate-limited`, etc. Avoid using assertion type names (`added`, `removed`, etc.) as condition keys.

**Sibling groups (same type):** Multiple condition keys on the same element and type form a sibling group. First to match wins, others dismissed.

```html
<!-- Three possible outcomes — first one to match wins -->
<button fs-assert="search/execute" fs-trigger="click"
  fs-assert-added-results=".search-results"
  fs-assert-added-empty=".no-results"
  fs-assert-added-error=".search-error">Search</button>
```

**Cross-type mutex (`fs-assert-mutex`):** Controls mutual exclusion of conditional assertions across different types. Four modes:

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

Only `success` and `error` are mutually exclusive. The `analytics` assertion resolves independently.

### Out-of-Band (OOB) Assertions

OOB assertions fire when a referenced parent assertion passes or fails. Use for side-effect elements (count labels, totals, toasts, error indicators) that should be verified after a primary action resolves, without prop drilling.

`fs-assert-oob` and `fs-assert-oob-fail` replace `fs-trigger` on OOB elements. Assertion types are declared normally via `fs-assert-{type}`.

```html
<!-- Primary action -->
<button fs-assert="todos/add-item" fs-trigger="click"
  fs-assert-added-success=".todo-item"
  fs-assert-added-error=".add-error">Add</button>

<!-- OOB: count should reflect the new total after add succeeds -->
<div id="todo-count"
  fs-assert="todos/count-updated"
  fs-assert-oob="todos/add-item"
  fs-assert-visible="[text-matches=\d+/\d+ remaining]">
  2/3 remaining
</div>

<!-- OOB-fail: verify error indicator shown when add fails -->
<div id="error-check"
  fs-assert="todos/add-error-check"
  fs-assert-oob-fail="todos/add-item"
  fs-assert-visible=".error-indicator">
</div>
```

- `fs-assert-oob="key1,key2"` — fires when any listed parent assertion **passes**
- `fs-assert-oob-fail="key1,key2"` — fires when any listed parent assertion **fails** (timeout, GC, SLA). Dismissed assertions (losing conditional siblings) do NOT trigger oob-fail.
- Both can coexist on the same element as independent triggers
- Multiple parent keys are comma-separated (OR — fires if any parent matches)
- No chaining: OOB passing does not trigger further OOB
- Selector is optional — omit for self-referencing (checks the OOB element itself)
- **Use state assertions** (`visible`, `hidden`, `added`, `removed`) with OOB. Event types (`updated`, `loaded`) require witnessing a mutation and will miss changes that already occurred before the OOB assertion is created.

**Multi-check conditional outcomes:** To verify multiple things on one conditional success (e.g., delete removes the row AND shows a toast), use OOB on the secondary element:

```html
<!-- Primary: conditional on the trigger -->
<button fs-assert="todos/remove-item" fs-trigger="click"
  fs-assert-mutex="each"
  fs-assert-removed-success=".todo-item"
  fs-assert-added-error=".error-msg">Delete</button>

<!-- Secondary: OOB checks toast appeared after successful delete -->
<div class="toast-container"
  fs-assert="todos/delete-toast"
  fs-assert-oob="todos/remove-item"
  fs-assert-visible=".success-toast">
</div>
```

### Invariant Assertions

Continuous monitoring for conditions that should always hold — catches failures without user action:

```html
<nav id="main-nav"
  fs-assert="layout/nav-visible"
  fs-trigger="invariant"
  fs-assert-visible="#main-nav">
</nav>
```

- Invariants stay **pending** — no collector traffic while the condition holds
- Only **failures** (violations) and **recoveries** (pass after failure) are reported
- On page unload, pending invariants are auto-passed as the "all clear" signal
- No timeout — invariants are perpetual for the page lifetime
- Best with state types (`visible`, `hidden`). Event types (`updated`, `loaded`) are allowed but warned against.
- Invariants do not support conditional keys or MPA mode

### Stable Assertions

Stable assertions pass when the target element's subtree is NOT mutated during the timeout window. The temporal inverse of `updated`.

```html
<!-- OOB: verify price display doesn't flicker after add-to-cart -->
<div
  fs-assert="cart/price-stable"
  fs-assert-oob="cart/add-item"
  fs-assert-stable="#price-total"
  fs-assert-timeout="500">
</div>

<!-- Perpetual: this element should never be mutated -->
<div id="legal-notice"
  fs-assert="layout/legal-stable"
  fs-trigger="invariant"
  fs-assert-stable="#legal-notice">
</div>
```

- **Best with OOB**: Start the stability window after an expected mutation passes.
- **Works with `invariant`**: Perpetual "never mutate" monitoring.
- **Without `fs-assert-timeout`**: Passes via GC sweep (default 5s). Use explicit timeout for tighter stability windows.

### Sequence Assertions (Multi-Step Flows)

Validate that user actions happen in the correct order:

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
- Produces an independent data point alongside any DOM assertions on the same element.
- Failed `after` assertions can recover via re-trigger if the parent passes later.
- Chaining works: A → B → C, each `after` checks only its direct parent.
- **Don't combine with `fs-trigger="invariant"`** — invariants skip immediate resolution.

### Custom Event Assertions

**Custom Event Triggers** (`fs-trigger="event:<name>"`): Trigger assertion evaluation when a named CustomEvent fires on `document`.

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

- `detail-matches` on triggers does **shallow string equality** on `event.detail` properties
- Without `detail-matches`, any dispatch of the named event triggers the assertion

**Emitted Assertion Type** (`fs-assert-emitted="<eventName>"`): Passes when a matching CustomEvent fires on `document`.

```html
<button fs-assert="checkout/payment" fs-trigger="click"
  fs-assert-emitted="payment:complete[detail-matches=orderId:\d+]">
  Pay Now
</button>
```

- `detail-matches` on `emitted` uses **regex matching** (unlike the trigger version which uses string equality)
- NOT compatible with MPA mode — warns and ignores `fs-assert-mpa`
- **Synchronous dispatch limitation:** if the CustomEvent is dispatched synchronously in the same click handler, the event fires before the assertion is created. Use async dispatch.

---

## Dynamic Assertion Values

For bidirectional interactions (toggles, checkboxes, accordions), compute the **expected next state** in the attribute value:

```jsx
// React: toggle expects the class to flip
<input type="checkbox"
  fs-assert="todos/toggle-complete"
  fs-trigger="change"
  fs-assert-updated={`.todo-item[classlist=completed:${!todo.completed}]`} />
```

When `todo.completed` is `false`, the assertion checks for `completed:true` (checking). When `true`, it checks for `completed:false` (unchecking).

This works in any framework with dynamic attribute values (React JSX, Vue `:attr`, Svelte `{expression}`).

---

## HTMX Patterns

HTMX is fully supported — the agent's wait-for-pass resolver handles HTMX's transient swap states (`htmx-swapping`, `htmx-added`, `htmx-settling`) automatically, with no framework-specific configuration. A few patterns are worth knowing:

**`added` vs `updated` depends on the swap strategy, not the markup.** This is the #1 HTMX instrumentation mistake.

| Swap | DOM effect | Correct type |
|---|---|---|
| `hx-swap="outerHTML"` (no morph) | Old element removed, new element inserted | `fs-assert-added` |
| `hx-swap="innerHTML"` | Parent keeps identity, children replaced | `fs-assert-updated` on parent, or `fs-assert-added` on the new children |
| `hx-swap="morph:outerHTML"` (idiomorph) | Target element is **patched in place** — same DOM node, attributes/class/children mutate | `fs-assert-updated` |
| `hx-swap="morph:innerHTML"` | Parent and its children patched in place | `fs-assert-updated` |
| `hx-swap="beforeend"` / `afterbegin"` | New child appended, existing siblings untouched | `fs-assert-added` |

The common trap: a button with `hx-swap="morph:outerHTML"` toggling a row between view mode (`.todo-item`) and edit mode (`.todo-item-edit`) looks like "a new edit row appeared" — but with idiomorph, it's the same `<div id="todo-1">` getting its class and children patched. Use `fs-assert-updated=".todo-item-edit"`, not `fs-assert-added`.

**JavaScript class toggles are `updated`, not `added`.** When a click handler does `element.classList.add('complete')` on an existing node, the element is mutated, not added. `fs-assert-added=".foo.complete"` will never match (the element isn't in `addedElements`). Use `fs-assert-updated`.

**Narrow selectors in lists.** During a standard (non-morph) `outerHTML` swap, the old and new elements briefly coexist as the browser processes the mutation batch. Under wait-for-pass this isn't a correctness problem, but broad selectors can match the wrong element. Prefer specific ids over class selectors:

```html
<!-- Good: targets the specific item being toggled -->
fs-assert-added="#todo-123[classlist=completed:true]"

<!-- Risky: matches every .todo-item on the page -->
fs-assert-added=".todo-item[classlist=completed:true]"
```

**OOB swaps.** HTMX's `hx-swap-oob` pairs naturally with Faultsense's `fs-assert-oob`. Put the OOB assertion on the side-effect element (count display, toast container, error indicator) and reference the primary assertion key. The agent re-queries the DOM state when the parent resolves, so OOB assertions see the HTMX response already applied.

**Transient swap classes.** You do NOT need to special-case `htmx-swapping`, `htmx-added`, or `htmx-settling` in your modifier checks. The resolver waits for a mutation batch that satisfies the assertion, so intermediate states where these classes are present but the target class isn't yet settled are silently ignored.

**Fake checkboxes / icon-in-button patterns.** HTMX apps often use `<button>` with nested `<span>` or `<svg>` icons instead of native `<input>` elements. Clicks on the inner icon resolve to the button's `fs-trigger` automatically — put the instrumentation on the `<button>`, not on the icon span.

---

## Timeout Model

Assertions resolve naturally when the DOM changes. There is no default per-assertion timer.

- **No default timeout.** Assertions without `fs-assert-timeout` wait until the DOM resolves them or the GC cleans them up.
- **SLA timeout** (`fs-assert-timeout="2000"`) — opt-in performance contract. Fails if the expected outcome doesn't happen within the declared time.
- **GC sweep** (`config.gcInterval`, default 5s) — background timer cleans up stale assertions. Matches Playwright's default assertion timeout.
- **Page unload** — assertions older than `config.unloadGracePeriod` (default 2s) are failed on page close. Fresh assertions are silently dropped.
- **Re-trigger tracking** — when a user re-triggers an action while its assertion is still pending, the timestamp is recorded in an `attempts[]` array.

**When to use `fs-assert-timeout`:** Only when you have a specific performance SLA. Don't add timeouts to every assertion.

---

## Placement Rules

1. **Attributes go on the trigger element** — the element the user directly interacts with. Clicks on descendants of an instrumented element (icon spans inside a button, text inside a label, any non-instrumented child) resolve up to the nearest `fs-trigger` ancestor via `closest()`, so nested content works naturally without `pointer-events: none` workarounds.
2. **For forms**: Use `fs-trigger="submit"` on the `<form>` element, OR `fs-trigger="click"` on the submit `<button>`.
3. **For mount/unmount**: Place on the element being observed.
4. **For load/error**: Place on the media element itself.
5. **One trigger per element**: `fs-trigger` accepts exactly one value.
6. **Multiple assertion types on one element**: Valid. Each creates a separate assertion.
7. **Framework components**: `fs-*` attributes must reach the actual DOM element. In React, native elements pass through. Wrapper components need to forward props.
8. **OOB assertions** go on the **side-effect element**, not the trigger element.
9. **React boolean attributes:** Always use explicit string values (e.g., `fs-assert-mutex="each"`).

---

## Common Mistakes

1. **Placing `fs-trigger` too high in the tree.** The agent walks up from `event.target` to the nearest `fs-trigger` ancestor, so nested icons and text inside an instrumented button work fine. But broad placement — e.g., `fs-trigger="click"` on a container `<div>` that wraps multiple unrelated children — will fire for ANY click inside it, producing noisy assertions. Put the trigger on the specific element the user is meant to interact with.

2. **Using reserved words as condition keys.** Avoid assertion type names (`added`, `removed`, `updated`, `visible`, `hidden`, `loaded`, `oob`, `oob-fail`) as condition keys.

3. **Using `added` when `updated` is correct.** `added` = element doesn't exist yet, will be created. `updated` = element already exists, content changes.

4. **Using `visible` when `added` is correct.** `visible` checks an existing element's layout dimensions. `added` checks for a new element in the DOM.

5. **Missing required attributes.** Every element needs: `fs-assert` + `fs-trigger` (or `fs-assert-oob`/`fs-assert-oob-fail`) + at least one assertion type.

6. **Using `updated` or `loaded` with OOB or invariant assertions.** OOB and invariant assertions check current DOM state. Event-based types require witnessing a mutation and will miss changes that already occurred. Use state-based types (`visible`, `hidden`, `added`, `removed`).

7. **Using bare boolean attributes in React JSX.** React drops custom attributes with boolean `true`. Write `fs-assert-mutex="each"` not `fs-assert-mutex`.

8. **Using `text-matches` with exact dynamic values.** Use regex patterns for dynamic content: `[text-matches=\\d+]` not `[text-matches=42]`.

9. **Expecting AND logic with `mutex="each"` under same condition key.** With `mutex="each"`, `fs-assert-removed-success` and `fs-assert-visible-success` are siblings (first wins), not AND. Use `mutex="conditions"` for same-key independence, or use OOB for secondary checks.

10. **Using CSS attribute selectors in modifier values.** The bracket parser treats `[` as a modifier delimiter. `[data-id="123"] .btn[disabled=true]` will be misparsed. Use id/class selectors instead.

11. **Using OOB for per-item assertions in lists.** OOB broadcasts to ALL elements matching `fs-assert-oob="key"`. Use OOB for singleton elements (count displays, toasts). For per-item state, use multiple assertion types on the trigger element.

12. **Using `count` with self-referencing (no selector).** Count of self is always 1. `count` requires an explicit selector.

13. **Using `value-matches` and expecting MutationObserver to detect `.value` changes.** The `.value` property is not an attribute — typing doesn't trigger MutationObserver. Use with event triggers (`change`, `blur`).

14. **Confusing `checked` with `value-matches` on checkboxes.** `el.value` on a checkbox returns the static `value` attribute. Use `[checked=true]` for checkbox/radio state.

15. **Using `fs-assert-after` with `fs-trigger="invariant"`.** Invariants skip immediate resolution, so `after` would never be checked.

16. **Dispatching CustomEvents synchronously in the trigger handler.** The event fires before the `emitted` assertion listener is created. Use async dispatch.

17. **Using `emitted` with MPA mode.** MPA assertions persist to localStorage and resolve on the next page load, where the event will never re-fire.

18. **Broad selectors in lists with `added`.** `.todo-text` matches ALL items. `added` may resolve against the wrong sibling. Use `updated` for specific content changes, or narrow with IDs/data attributes.
