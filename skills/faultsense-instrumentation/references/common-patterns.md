# Faultsense — Common Patterns

Annotated patterns showing how to instrument common UI interactions. Each includes the reasoning behind the assertion choices.

---

## 1. Button Click → DOM Update (Counter)

**Scenario:** A button increments a counter displayed on the page.

**Reasoning:** The counter element already exists — its text content changes. Use `updated` with `text-matches` to verify the new value is a positive number.

```html
<button
  fs-assert="counter/increment"
  fs-trigger="click"
  fs-assert-updated='#counter[text-matches=Count: [1-9]\d*]'>
  Increment
</button>
<div id="counter">Count: 0</div>
```

---

## 2. Form Submit → Element Added (Todo)

**Scenario:** Submitting a form adds a new item to a list.

**Reasoning:** The new item doesn't exist yet — it will be created in the DOM. Use `added`. The trigger is `click` on the button (the user's interaction point).

```html
<button type="submit"
  fs-assert="todo/add-item"
  fs-trigger="click"
  fs-assert-added=".todo-item">
  Add Todo
</button>
```

---

## 3. Modal Open/Close (Dialog)

**Scenario:** A button opens a modal; a cancel button closes it.

**Reasoning:** Opening: the modal overlay already exists in the DOM (hidden). Use `visible` to verify it now has layout dimensions. Closing: the modal content is removed from the DOM entirely. Use `removed`.

```html
<!-- Open trigger -->
<button
  fs-assert="modal/open"
  fs-trigger="click"
  fs-assert-visible=".modal-overlay">
  Open Modal
</button>

<!-- Close trigger (inside modal) -->
<button
  fs-assert="modal/close"
  fs-trigger="click"
  fs-assert-removed=".modal-content">
  Cancel
</button>
```

**Note:** If the modal is conditionally rendered (not in the DOM until opened), use `added` instead of `visible` for the open trigger.

---

## 4. Tab Switching (Tabbed Interface)

**Scenario:** Clicking a tab shows the corresponding content panel.

**Reasoning:** Tab content panels typically exist in the DOM but are hidden. Use `visible` to verify the target panel now has layout dimensions.

```html
<button class="tab-button" data-tab="settings"
  fs-assert="tabs/switch-tab"
  fs-trigger="click"
  fs-assert-visible=".tab-content[data-tab='settings']">
  Settings
</button>
```

---

## 5. Multi-Step Wizard with Sequence Validation

**Scenario:** Clicking "Next" advances to the next wizard step. Each step requires the previous to have completed.

**Reasoning:** Use `fs-assert-after` to validate step ordering. `after` and `visible` are independent assertions — a sequence violation with correct UI is a visible finding.

```html
<!-- Step 1 -->
<button fs-assert="wizard/step-1" fs-trigger="click"
  fs-assert-visible=".wizard-step[data-step='2']">
  Next
</button>

<!-- Step 2: must have completed step 1 -->
<button fs-assert="wizard/step-2" fs-trigger="click"
  fs-assert-after="wizard/step-1"
  fs-assert-visible=".wizard-step[data-step='3']">
  Next
</button>

<!-- Step 3: must have completed step 2 -->
<button fs-assert="wizard/step-3" fs-trigger="click"
  fs-assert-after="wizard/step-2"
  fs-assert-visible=".confirmation">
  Submit
</button>
```

---

## 6. Form Submit → Conditional Assertions

**Scenario:** A contact form that shows a success message, validation errors, or a server error.

**Reasoning:** The outcome depends on what the app renders. Use conditional assertions to branch: the first condition key whose selector matches wins, others dismissed. No server integration needed.

```html
<form
  fs-assert="contact/submit-form"
  fs-trigger="submit"
  fs-assert-added-success=".success-msg"
  fs-assert-added-validation-error=".validation-errors"
  fs-assert-added-server-error=".server-error"
  fs-assert-timeout="2000">
  <input name="email" type="email" />
  <button type="submit">Send</button>
</form>
```

---

## 7. MPA Navigation (Multi-Page App)

**Scenario:** A form submission triggers a full page navigation, and the success message appears on the next page.

**Reasoning:** The assertion must survive the page reload. Use `fs-assert-mpa="true"` to persist it to localStorage. On the next page, the agent picks it up and resolves it.

```html
<button
  fs-assert="mpa-form/submit"
  fs-trigger="click"
  fs-assert-mpa="true"
  fs-assert-visible=".success-message">
  Submit
</button>
```

---

## 8. Data Load → Conditional DOM Update

**Scenario:** Clicking a button fetches data. On success, results update. On error, an error element appears.

**Reasoning:** The results container already exists (use `updated` for the success path). The error element is new (use `added` for the error path). Longer timeout for network operations.

```html
<button
  fs-assert="data/load-posts"
  fs-trigger="click"
  fs-assert-updated-success="#results"
  fs-assert-added-error=".error"
  fs-assert-timeout="2600">
  Load Posts
</button>
<div id="results"></div>
```

---

## 9. OOB Side-Effect Validation (Count Label)

**Scenario:** A count label shows "N/M remaining" and should update whenever a todo is added, toggled, or deleted. The count label is in a different component from the trigger elements.

**Reasoning:** Without OOB, you'd need to prop-drill count data into TodoItem just to compute expected text. OOB lets the count label declare its own assertion triggered by other assertions passing. Use state assertions with OOB.

```html
<!-- Triggers (in various components) -->
<button fs-assert="todos/add-item" fs-trigger="click"
  fs-assert-added=".todo-item">Add</button>

<input type="checkbox" fs-assert="todos/toggle-complete"
  fs-trigger="change"
  fs-assert-updated=".todo-item[classlist=completed:true]" />

<button fs-assert="todos/remove-item" fs-trigger="click"
  fs-assert-removed=".todo-item">Delete</button>

<!-- OOB count label (separate component, no prop drilling) -->
<div id="todo-count"
  fs-assert="todos/count-updated"
  fs-assert-oob="todos/add-item,todos/toggle-complete,todos/remove-item"
  fs-assert-visible="[text-matches=\d+/\d+ remaining]">
  2/3 remaining
</div>
```

---

## 10. Invariant Assertion (Continuous Monitoring)

**Scenario:** The main navigation should always be visible. An error banner should never appear.

**Reasoning:** No user action triggers these — they're page-level contracts. Use `fs-trigger="invariant"` for continuous monitoring.

```html
<!-- Navigation must always be visible -->
<nav
  fs-assert="layout/nav-visible"
  fs-trigger="invariant"
  fs-assert-visible=".main-nav">
</nav>

<!-- Error banner must never appear -->
<div
  fs-assert="layout/no-error-banner"
  fs-trigger="invariant"
  fs-assert-hidden=".global-error-banner">
</div>
```

---

## 11. Custom Event Trigger + Emitted Assertion

**Scenario:** The app dispatches custom events for state changes. Verify both the event and the resulting UI.

**Reasoning:** Use `event:<name>` trigger to activate on custom events. Use `emitted` to assert a custom event fires after a user action. `detail-matches` on triggers uses string equality; on `emitted` it uses regex.

```html
<!-- Trigger assertion when the app dispatches a custom event -->
<div fs-assert="cart/sync-check" fs-trigger="event:cart-updated[detail-matches=action:add]"
  fs-assert-visible="#cart-count[text-matches=\d+]">
</div>

<!-- Assert that clicking Pay causes a payment:complete event to fire -->
<button fs-assert="checkout/payment" fs-trigger="click"
  fs-assert-emitted="payment:complete[detail-matches=orderId:\d+]"
  fs-assert-visible=".confirmation">
  Pay Now
</button>
```

---

## 12. Stable Assertion (No Flickering)

**Scenario:** After adding to cart, the price total should not flicker or update unexpectedly.

**Reasoning:** Use `stable` (inverted `updated`) with OOB to start the stability window after the expected mutation. Any mutation during the timeout window fails the assertion.

```html
<!-- Primary: add to cart -->
<button fs-assert="cart/add-item" fs-trigger="click"
  fs-assert-updated="#cart-total">
  Add to Cart
</button>

<!-- OOB: verify price doesn't flicker after the cart updates -->
<div
  fs-assert="cart/price-stable"
  fs-assert-oob="cart/add-item"
  fs-assert-stable="#cart-total"
  fs-assert-timeout="500">
</div>
```

---

## 13. Count Assertions (Cardinality)

**Scenario:** After a search, verify the correct number of results appear.

**Reasoning:** Use `count`, `count-min`, `count-max` to verify element cardinality. `count` checks `querySelectorAll(selector).length`.

```html
<!-- After search, verify at least 1 result exists -->
<button fs-assert="search/execute" fs-trigger="click"
  fs-assert-added=".result-card[count-min=1]">Search</button>

<!-- OOB: verify total todo count after add/remove -->
<div
  fs-assert="todos/item-count"
  fs-assert-oob="todos/add-item,todos/remove-item"
  fs-assert-visible=".todo-item[count=5]">
</div>
```

---

## Progressive Assertion Example: Todo Delete

Start simple, then layer on more precise assertions as confidence needs grow.

### Level 1: Basic — Did it disappear?

```html
<button
  fs-assert="todos/remove-item"
  fs-trigger="click"
  fs-assert-removed=".todo-item">
  Remove
</button>
```

Catches the basics — the button works, the item disappears.

### Level 2: Branching — Success or error?

```html
<button
  fs-assert="todos/remove-item"
  fs-trigger="click"
  fs-assert-mutex="each"
  fs-assert-removed-success=".todo-item"
  fs-assert-added-error=".error-msg">
  Remove
</button>
```

Now you know which outcome occurred. `fs-assert-mutex="each"` ties the cross-type conditionals together so exactly one resolves.

### Level 3: Multi-check — Did the toast also appear?

```html
<button
  fs-assert="todos/remove-item"
  fs-trigger="click"
  fs-assert-mutex="each"
  fs-assert-removed-success=".todo-item"
  fs-assert-added-error=".error-msg">
  Remove
</button>

<!-- OOB: verify toast appears on successful delete -->
<div class="toast-container"
  fs-assert="todos/remove-item-toast"
  fs-assert-oob="todos/remove-item"
  fs-assert-visible=".toast[text-matches=Item deleted]">
</div>
```

Three things asserted:
- Conditional on the trigger — item removed (success) or error shown (error)
- OOB on the toast — when `todos/remove-item` passes, checks that a confirmation toast appeared
- Each is an independent assertion with its own key, no coupling between components

---

## HTMX-specific gotchas

HTMX instrumentation works the same as any other framework (`fs-*` attributes in the template), but a handful of HTMX semantics warrant specific guidance. The `examples/todolist-htmx/` directory is a full worked example.

### 1. Use HX-Location, not HX-Redirect, for SPA navigation

HX-Redirect triggers a hard page reload — the agent re-initializes from scratch and pending assertions are lost. HX-Location does a client-side fetch + pushState, preserving the agent session. For `fs-assert-route`, HX-Location is the only option that lets the route resolver see the pushState and satisfy the pending assertion.

```js
// GOOD — preserves the agent session
res.set('HX-Location', '/dashboard').status(204).end()

// BAD — hard reload loses pending fs-assert-route
res.set('HX-Redirect', '/dashboard').status(204).end()
```

### 2. Error responses don't swap by default

HTMX drops 4xx/5xx response bodies and fires `htmx:responseError`. If you declare `fs-assert-*-error` on a trigger, the expected `.error-msg` will never appear because the error fragment never enters the DOM.

Three options:

1. **Return 200 with an error fragment** and use `HX-Retarget` / `HX-Reswap` headers to route it to a dedicated error slot. Simplest; no extension required.
2. **Install the `response-targets` extension** and use `hx-target-error="#error-slot"` or `hx-target-5xx="#error-slot"` on the trigger.
3. **Reclassify the status** via `htmx.config.responseHandling` so HTMX swaps error statuses by default.

```js
// Option 1 — server returns 200 + error fragment, retargeted
res.set('HX-Retarget', '#add-error-slot')
res.set('HX-Reswap', 'innerHTML')
res.render('partials/add-todo-error', { error: 'Todo cannot be empty' })
```

### 3. HX-Trigger header is the async dispatch path for fs-assert-emitted

Synchronous `document.dispatchEvent` inside a click handler fires BEFORE the assertion listener is registered (Common Mistakes #16). In HTMX, use the `HX-Trigger` response header — HTMX dispatches the CustomEvent on `document.body` after `htmx:afterSettle`, giving the assertion listener time to register.

```js
res.set('HX-Trigger', JSON.stringify({ 'payment:complete': { orderId: '1234' } }))
```

```html
<button
  fs-assert="checkout/payment"
  fs-trigger="click"
  fs-assert-emitted="payment:complete[detail-matches=orderId:\d+]">
  Pay Now
</button>
```

### 4. Focus is not reliable on swapped-in inputs — call `.focus()` explicitly

HTMX preserves focus on swapped elements that have a matching `id` pre- and post-swap, but it does NOT consistently focus newly-added inputs. `autofocus` works in some browsers on dynamic insertion and not others. Assertions using `[focused=true]` on swapped content need an explicit `.focus()` call.

The cleanest pattern: ship a small inline `<script>` in the swap partial itself. HTMX executes inline scripts in swapped content **synchronously during the swap**, which runs *before* the MutationObserver callback microtask fires — so by the time `elementResolver` evaluates `focused=true`, `document.activeElement === input` is already true.

```ejs
<!-- In your edit partial -->
<div id="todo-<%= todo.id %>" class="todo-item" data-status="editing">
  <input class="todo-edit-input" autofocus ... />
  ...
</div>
<script>
  ;(function () {
    var el = document.getElementById('todo-<%= todo.id %>')
    var input = el && el.querySelector('.todo-edit-input')
    if (input) {
      input.focus()
      if (input.select) input.select()
    }
  })()
</script>
```

The leading `;` on the IIFE defends against ASI if another script tag precedes this one in the swap pipeline. The `autofocus` attribute is a belt-and-suspenders fallback for browsers that honor it on dynamic insertion.

Alternatively, use `hx-on::after-settle` on the button that triggers the swap — but an inline script in the partial keeps the focus logic co-located with the element that needs it.

### 5. MPA mode is for hard nav only

`fs-assert-mpa="true"` is an opt-in signal that means "persist this assertion across a real page navigation." The agent writes it to `localStorage` on `pagehide` and reloads it on the next init (the next real `DOMContentLoaded`).

**Do not use `fs-assert-mpa="true"` on hx-boosted routes.** hx-boost never fires a real unload, so MPA assertions created under boost are written to storage but never reloaded — they're orphaned. Under hx-boost the agent session is long-lived, so you don't need MPA mode: a regular DOM assertion can wait for the new view to render and resolve naturally.

MPA is only appropriate when a subset of your app does actual hard navigation (e.g., a legacy flow wrapped inside an otherwise SPA app, or a form that POSTs to a different origin).

### 6. Scope `stable` assertions outside the swap target

`fs-assert-stable="#foo"` fails if any mutation touches `#foo`'s subtree. If `#foo` is inside your `hx-target`, every swap mutates it and stable always fails. Place stability sentinels OUTSIDE the swap target or use OOB with a narrow `innerHTML:#foo` swap that updates only text content.

### 7. Form submit and click both fire under HTMX

HTMX calls `preventDefault()` on the native submit event AFTER listeners have already run. Faultsense's capture-phase listeners see the event first — both `fs-trigger="submit"` on the `<form>` and `fs-trigger="click"` on the submit button work unchanged under HTMX.

### 8. Default `hx-target` is the triggering element itself

`<button hx-post="/x">Submit</button>` without an explicit `hx-target` replaces the button's own innerHTML with the response. If you add `fs-assert-updated` on that button, it will fire — but the button element itself is being mutated, so the assertion target needs care. For most cases, set an explicit `hx-target` (e.g. `hx-target="#result-container"`) and assert against that target.

### 9. `hx-swap="outerHTML"` = `added`, not `updated`

This is the most load-bearing rule for HTMX instrumentation: **when HTMX replaces an element via `outerHTML` swap, the agent sees an `added` event, not an `updated` event.** Matching the React convention of `fs-assert-updated` for in-place mutations will silently fail.

Why: `elementResolver` uses a type-based switch (`src/resolvers/dom.ts:200-217`) to decide which mutation list to check. For `updated`, it looks at `updatedElements` — which under a `childList` mutation (the DOM shape an outerHTML swap produces) contains the *parent* of the swapped element, not the element itself. The new element lands in `addedElements`, which is only consulted for `added` (and, separately, for `visible`/`hidden`).

React can use `updated` for list-item class changes because React mutates `className` in place, which fires an `attributes` mutation where `mutation.target` IS the todo item. HTMX replaces the whole element, so the mutation shape is different.

```ejs
<!-- WRONG under outerHTML swap: never resolves -->
<input type="checkbox"
  hx-patch="/todos/<%= todo.id %>/toggle"
  hx-target="closest .todo-item"
  hx-swap="outerHTML"
  fs-assert="todos/toggle"
  fs-trigger="change"
  fs-assert-updated=".todo-item[classlist=completed:<%= !todo.completed %>]">

<!-- RIGHT: outerHTML replaces the item, so the new .todo-item is an added node -->
<input type="checkbox"
  hx-patch="/todos/<%= todo.id %>/toggle"
  hx-target="closest .todo-item"
  hx-swap="outerHTML"
  fs-assert="todos/toggle"
  fs-trigger="change"
  fs-assert-added=".todo-item[classlist=completed:<%= !todo.completed %>]">
```

If you're using `innerHTML` swap to update text content without replacing the wrapper (e.g. `hx-swap-oob="innerHTML:#todo-count"` changing just the text inside), `updated` IS correct — the wrapper stays and only its subtree mutates. The rule is specifically about `outerHTML`, `delete`, or any swap that *replaces* the matched element.

### 10. Don't put multiple IIFEs in one inline `<script>` — use an external file

Classic JavaScript ASI trap:

```html
<script>
  (function () { /* A */ })()
  (function () { /* B */ })()   // ← parsed as A()(B())() — throws
</script>
```

The parser does not insert a semicolon between `})()` and the next `(`, so the second IIFE becomes an argument to a call on the first one's return value. Under initial page load this is already fragile; under hx-boost swap it's guaranteed to crash because the script is re-evaluated as a unit every time the boost re-runs inline scripts.

Two fixes:

1. **Preferred:** move the JS to an external file in `public/` and load it once from the layout's `<head>`. The `<head>` is outside the swap target under `<body hx-boost="true">`, so it's evaluated exactly once per real page load and survives every virtual nav.
2. **Fallback:** if the script must be inline, wrap everything in a single IIFE, or prefix each inner IIFE with a leading `;`.

```js
// public/todos.js — loaded once from layout <head>
(function () {
  // feature A
  window.addEventListener('online', render)

  // feature B
  document.addEventListener('todo:added', handler)

  // feature C — body-delegated so it survives hx-boost body swaps
  document.addEventListener('click', delegated)
})()
```

```html
<!-- layout.ejs -->
<head>
  <script src="/faultsense-panel.min.js" defer></script>
  <script src="/faultsense-agent.min.js" defer ...></script>
  <script src="/htmx.min.js" defer></script>
  <script src="/todos.js" defer></script>
</head>
```

The same rule applies to event listeners that need to survive boost: delegate from `document` (or `document.body`, which persists across body innerHTML swaps) rather than from a specific element that will get replaced on the next swap.
