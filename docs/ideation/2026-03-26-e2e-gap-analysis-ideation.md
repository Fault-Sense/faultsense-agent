---
date: 2026-03-26
topic: e2e-gap-analysis
focus: Identify test types that e2e frameworks (Playwright, Cypress, AI-native) can verify that Faultsense currently cannot, and ideas for closing those gaps
---

# Ideation: E2E Testing Gap Analysis

## Codebase Context

**Project:** Faultsense Agent — lightweight, zero-dependency TypeScript browser agent that monitors feature health through real-time assertions declared via `fs-*` HTML attributes. Ships as IIFE bundles. Source in `src/` with pipeline: processors → assertions → resolvers → interceptors → collectors.

**Current assertion types:** DOM: added, removed, updated, visible, hidden, loaded. Response-conditional: any DOM type + HTTP status or JSON body key. OOB: side-effect assertions triggered by parent pass. Triggers: click, dblclick, change, blur, submit, mount, unmount, load, error. Modifiers: text-matches, classlist, attribute checks. Self-referencing selectors.

**Fundamental paradigm difference:** E2e tests CONTROL the user — fill in forms, click buttons, assert outcomes with known inputs. Faultsense OBSERVES real users — detects what they did via trigger events and HTTP response context, then asserts expected DOM outcomes. E2e tests know what should happen because they caused it. Faultsense knows what should happen because it observes the context (trigger + response status).

**Key gaps identified vs. e2e test capabilities:**
- No multi-step flow / sequencing (every assertion is independent and stateless)
- No input value assertions (`.value` property)
- No URL/route assertions
- No element count / cardinality assertions
- No "nothing changed" / stability assertions
- No assertions gated on client-side signals (URL, storage, network conditions) — only HTTP status
- No continuous invariants (all assertions require a trigger event)
- No disabled/interactive state assertions
- No fallback/degraded mode verification
- Limited trigger set (no keyboard, hover, scroll, focus, offline events)

**Research coverage:** Playwright (full capability map), Cypress (full capability map), AI-native tools (Playwright MCP, Shortest, Meticulous, Momentic, Checkly, QA Wolf, Autify, Testim, Reflect). Taxonomy of 15 test categories with ~150 specific test types analyzed.

## Ranked Ideas

### 1. Continuous Invariants (`fs-trigger="invariant"`)

**Description:** Assertions that are always active and re-evaluated on every mutation cycle without requiring a user event. Declares page-level contracts: "nav should always be visible," "error-banner should never exist," "footer should always contain the copyright." The MutationObserver already watches the full document — invariants are assertions that never settle on pass, only on fail.

**Rationale:** Closes a fundamental gap in the assertion model. E2e tests routinely check background conditions (no console errors, no broken images, layout intact). Faultsense has a complete blind spot for failures without a proximate user action — CSS regression hiding the nav, race condition flashing an error banner, deploy removing a critical element. The `mount` trigger partially addresses this but settles on first observation. Invariants keep watching.

**Downsides:** Perpetually-active assertions increase MutationObserver processing cost. Need a "dismiss" mechanism to avoid permanent failure on transient states. Risk of noisy false positives on pages with frequent legitimate mutations.

**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

<details>
<summary>Deep Dive: Implementation Analysis</summary>

#### How the Current Trigger System Works

The trigger lifecycle is a three-phase pipeline: **discover elements → create assertions → resolve assertions**.

- **Event-driven** (`click`, `submit`, etc.): `index.ts` registers DOM event listeners. On event, `handleEvent` (`manager.ts:112`) calls `eventProcessor`, which only processes `event.target` itself. The element's `fs-trigger` must match the event type.
- **Mutation-driven** (`mount`): `handleMutations` (`manager.ts:130`) passes newly-added DOM nodes through `createElementProcessor(["mount"])`. Any element entering the DOM with `fs-trigger="mount"` gets processed. Also runs once at init for elements already in the DOM.

**Critical:** Once resolved, assertions are terminal. `completeAssertion` sets `status` and `endTime`. After that, `isAssertionPending` returns false, so all `getPendingDomAssertions` filters exclude it. If the same trigger fires again, `retryCompletedAssertion` resets the fields — but this requires a new trigger event.

#### Why `mount` Is Not Enough

`mount` fires once when an element enters the DOM. The assertion settles once — passes or times out, then it's done. An invariant needs the opposite: it must **never settle on pass**. It should be evaluated on every mutation cycle, and only report when the invariant is violated.

#### Where Invariants Plug Into the Mutation Pipeline

```
MutationObserver callback
  → assertionManager.handleMutations(mutations)
    → mutationHandler (processor pass): discovers new mount-triggered elements
    → enqueueAssertions: adds them, sets timeouts
    → mutationHandler (resolver pass): resolves pending assertions against mutation data
    → settle: sends completed assertions to collector, triggers OOB
```

**The invariant hook point is after the resolver pass** in `handleMutations`. For all invariant assertions, run the invariant check against current DOM state, then report state transitions.

#### Implementation Path

| File | Change |
|---|---|
| `config.ts` | Add `"invariant"` to `supportedTriggers` (~1 line) |
| `types.ts` | Consider `invariant?: boolean` flag on `Assertion` interface |
| `index.ts` | At init, query for `fs-trigger="invariant"` elements alongside `mount`/`load` (~3 lines) |
| `processors/elements.ts` | No changes — `isProcessableElement` already handles this generically |
| `assertions/manager.ts` | Skip `createAssertionTimeout` for invariants. After resolver pass, add invariant evaluation: get all invariant assertions, run `documentResolver`-style check, report state transitions only (~15-20 lines) |
| `assertions/assertion.ts` | New `reportInvariantViolation` — creates CompletedAssertion-like object without mutating the assertion's pending state |
| `resolvers/dom.ts` | No new resolver needed — `documentResolver` logic (querySelector + modifiers) reused |
| `assertions/timeout.ts` | No timeout behavior for invariants |

#### Key Design Decisions

**Reporting semantics:** State-transition model. Report on pass→fail AND fail→pass. The existing `previousStatus` field on `Assertion` already supports this. `getAssertionsToSettle` already filters `previousStatus === status` to deduplicate. The existing machinery handles this if invariant assertions cycle between completed and re-pending states via `retryCompletedAssertion`.

**Perpetual lifecycle:** After every mutation batch, evaluate all invariants via `documentResolver` logic. If the result is a state change, `settle` sends it to the collector. Then immediately call `retryCompletedAssertion` to reset for the next cycle. Reuses existing code with minimal new abstractions.

**Debouncing:** Start without debounce. `documentResolver` does one `document.querySelector` per invariant — sub-microsecond per selector. Even 50 invariants checked 100 times/second is negligible. Add `requestAnimationFrame` coalescing only if profiling shows a problem.

**Which assertion types make sense:** `visible`, `hidden`, and `removed` (via self-referencing or container). `added` and `updated` don't make semantic sense for invariants (they imply change detection).

#### Edge Cases

- **Transient states during React re-renders:** Framework re-renders may briefly remove and re-add elements. Mitigation: evaluate invariants at the **end** of the mutation batch (after all records processed), not per-record. The `mutationHandler` already aggregates records before calling handlers.
- **Tab backgrounding:** Invariant checks should pause when `document.hidden === true` to avoid spurious reports.
- **Page unload:** `beforeunload`/`pagehide` handlers should dismiss invariant assertions rather than failing them.
- **Bfcache:** Pages restored from bfcache fire no MutationObserver events. Invariants need re-evaluation on `pageshow` events.
- **Faultsense's own mutations:** Filter mutations where `mutation.attributeName` starts with `data-fs-` or `fs-`.

#### Performance

Cost per mutation cycle: O(n) filter for invariant assertions + one `querySelector` per invariant + modifier checks. For 5-20 invariants, overhead is < 0.1ms per cycle. The real risk (memory/GC from CompletedAssertion objects) is eliminated by the state-transition model.

#### Usage Examples

```html
<!-- Nav always visible -->
<nav id="main-nav"
  fs-assert="layout/nav-visible"
  fs-trigger="invariant"
  fs-assert-visible="#main-nav">

<!-- Error banner should never appear -->
<div id="error-root"
  fs-assert="app/no-unexpected-errors"
  fs-trigger="invariant"
  fs-assert-removed="#error-root .fatal-error">

<!-- Auth state consistency -->
<div id="user-menu"
  fs-assert="auth/user-menu-present"
  fs-trigger="invariant"
  fs-assert-visible="#user-menu[classlist=authenticated:true]">

<!-- Critical content never disappears -->
<main id="content"
  fs-assert="content/main-not-empty"
  fs-trigger="invariant"
  fs-assert-visible="#content">
```

</details>

---

### 2. URL/Route Assertions (`fs-assert-route`)

**Description:** New assertion type `fs-assert-route="/dashboard"` that asserts `window.location` matches an expected pattern after a trigger. Supports regex via existing modifier syntax: `fs-assert-route="[text-matches=/users/\\d+]"`. Works for SPA (intercept `pushState`/`replaceState`) and MPA (check URL on next page load via existing MPA persistence). No DOM selector needed — the assertion target is the URL itself.

**Rationale:** Navigation correctness is asserted in virtually every e2e test (`expect(page.url()).toContain('/dashboard')`). Faultsense has zero coverage. Navigation fails silently — `router.push` swallowed by an error boundary, redirect dropping query params, OAuth callback landing on the wrong page. Implementation follows the same interception pattern used for fetch/XHR in `interceptors/network.ts`. With `fs-assert-mpa`, naturally expresses "this click should land me on this URL after the page loads."

**Downsides:** URL patterns are fragile across environments (dev vs staging vs prod). Hash routing vs path routing requires different matching. Query parameter ordering makes exact matching unreliable.

**Confidence:** 85%
**Complexity:** Low-Medium
**Status:** Unexplored

<details>
<summary>Deep Dive: Implementation Analysis</summary>

#### Why Route Must Be a New Assertion Type (Not a Modifier)

Route assertions have no selector — no DOM element to match. The `typeValue` field holds the URL pattern instead. Every existing type interprets `typeValue` as a CSS selector. The resolution mechanism is fundamentally different (check `window.location`, not DOM). It aligns with how `loaded` is a separate type with its own resolver.

#### Type System Integration

`AssertionType` (`types.ts:91-97`) is a string literal union. Adding `"route"` is step one. The key insight: `domAssertions` array (`config.ts:16-23`) acts as a gate — every DOM resolver checks `domAssertions.includes(assertion.type)` before processing. Route should NOT be added to `domAssertions`, only to `supportedAssertions.types`. Existing resolvers will ignore it by design.

#### Resolver Pipeline (Non-DOM Path Already Exists)

The `loaded` type already uses a non-mutation path (event resolver + property resolver). Route would follow the same pattern: a dedicated resolver triggered by a dedicated interceptor signal.

#### History API Interception

Follows the exact pattern from `interceptors/network.ts`:

1. Monkey-patch `history.pushState` and `history.replaceState`
2. Call through to original, then call `navigationHandler` with new URL
3. Listen for `popstate` (back/forward) and call same handler
4. Wire into manager: `interceptNavigation(assertionManager.handleNavigation)`

New file: `src/interceptors/navigation.ts`.

#### MPA Mode (Where Route Assertions Shine Most)

**SPA flow:** Trigger fires → pushState interceptor fires → route resolver checks URL → pass/fail.

**MPA flow:** Trigger fires → assertion created with `fs-assert-mpa="true"` → page navigates → assertion persisted to localStorage → new page loads → `loadAssertions()` restores it → `checkAssertions()` runs → route resolver checks `window.location` → pass/fail.

The existing `documentResolver` already runs on page load for MPA assertions. Adding a `routeResolver` call to `checkAssertions` handles MPA with zero additional plumbing.

#### URL Matching Strategy

`typeValue` is matched as a regex against `location.pathname + location.search + location.hash` (everything after origin). This covers all routing strategies without needing to know which one the app uses. Modifiers can narrow the target: `[match=pathname]`, `[match=hash]`, `[match=href]`.

#### Response-Conditional Combination

`fs-assert-route-200="/dashboard"` means "when response is 200, assert URL matches /dashboard." The HTTP resolver un-gates it (`httpPending = false`), then the route resolver checks the URL. Works naturally with existing gate infrastructure.

#### Implementation Checklist

| File | Change |
|---|---|
| `types.ts` | Add `"route"` to `AssertionType` union |
| `config.ts` | Add `routeAssertions = ["route"]`. Append to `supportedAssertions.types`. Do NOT add to `domAssertions` |
| `interceptors/navigation.ts` | New file — patch `pushState`, `replaceState`, listen `popstate` |
| `resolvers/route.ts` | New file — check `window.location` against `assertion.typeValue` as regex |
| `assertions/manager.ts` | Add `handleNavigation` method. Wire `routeResolver` into `checkAssertions` (MPA) and `handleNavigation` (SPA) |
| `index.ts` | Import and call `interceptNavigation(...)`. Add cleanup |
| `processors/elements.ts` | Extend `parseDynamicTypes` to check `routeAssertions` in addition to `domAssertions` |
| `resolvers/dom.ts` | No changes (route filtered out by `domAssertions` guard) |

#### Edge Cases

- **Redirect chains (A → B → C):** Resolver checks URL at resolution time, not interception time. Only final URL matters within timeout window.
- **pushState before DOM updates:** Favorable — URL changes first, DOM assertions resolve on subsequent mutation. Independent resolution paths.
- **popstate (back/forward):** Resolution signal, not a trigger. Could also be a trigger (`fs-trigger="popstate"`) as a separate enhancement.
- **Dynamic segments:** Regex handles naturally: `fs-assert-route="/users/\d+/profile"`.

#### Usage Examples

```html
<!-- Login redirect (MPA) -->
<form action="/auth/login" method="POST"
  fs-assert="auth/login-redirect"
  fs-trigger="submit"
  fs-assert-route="/dashboard"
  fs-assert-mpa="true">

<!-- Login redirect (SPA, response-conditional) -->
<button
  fs-assert="auth/login-redirect"
  fs-trigger="click"
  fs-assert-route-200="/dashboard"
  fs-assert-route-401="/login\?error=invalid">

<!-- SPA navigation -->
<a href="/settings/profile"
  fs-assert="settings/navigate-profile"
  fs-trigger="click"
  fs-assert-route="/settings/profile">

<!-- OAuth callback (MPA, long timeout) -->
<button
  fs-assert="auth/oauth-start"
  fs-trigger="click"
  fs-assert-route="/auth/callback\?code=.+"
  fs-assert-mpa="true"
  fs-assert-timeout="10000">

<!-- Hash routing -->
<a fs-assert="app/navigate-settings"
   fs-trigger="click"
   fs-assert-route="#/settings">
```

#### Open Design Questions

- Should `popstate` be a supported trigger? (enables assertions on back/forward without click target)
- Negation: "assert URL did NOT change" (form validation failure keeps user on same page) — modifier `[not=true]` or separate type?

</details>

---

### 3. No-Mutation Assertions (`fs-assert-stable`)

**Description:** New assertion type that passes only if the target element's subtree is NOT mutated during the timeout window. The temporal inverse of `updated`. Any mutation during the window fails it immediately. On timeout with no mutations, it passes. Configurable settling period via `[stable-for=500]` modifier.

**Rationale:** Extends the "negative assertion" value prop from element presence (removed/hidden) to element stability. Catches unwanted mutation: price flickering after render, form field resetting unexpectedly, dashboard widget thrashing between states, layout shift from late-loading content. An `updated` assertion passes on the first mutation even if the element then oscillates 50 times. `stable` asserts the UI reached a settled state. Novel even compared to e2e tools — Playwright has no `toBeStable()`. Inverts existing MutationObserver logic: resolve on timeout (no mutations = pass), fail on mutation.

**Downsides:** Legitimate micro-mutations (cursor blink, animation frames) could cause false failures. "Pass on timeout" semantics mean every stable assertion takes the full timeout duration to resolve, increasing reporting latency.

**Confidence:** 75%
**Complexity:** Low-Medium
**Status:** Unexplored

<details>
<summary>Deep Dive: Implementation Analysis</summary>

#### How `updated` Currently Works

The MutationObserver (`index.ts:66-71`) watches `document.body` with `childList: true, subtree: true, attributes: true, characterData: true`. The `mutationHandler` (`mutations.ts`) categorizes each `MutationRecord`:
- `childList`: added nodes → `addedElements`, removed → `removedElements`, `mutation.target` (parent) → `updatedElements`
- `attributes`: `mutation.target` → `updatedElements`
- `characterData`: `mutation.target.parentElement` → `updatedElements`

The `updated` matcher (`dom.ts:41-47`) matches if the mutated element either directly matches the selector or is contained within the element matching the selector (subtree matching).

#### The Key Architectural Change: Inverted Timeout

Currently, timeout **always means failure** (`timeout.ts:55` calls `completeAssertion(assertion, false, ...)`). No precedent for "pass on timeout" exists.

**Recommended approach:** Generalize timeout to accept a `passOnTimeout` boolean, stored on the `Assertion` interface (e.g., `invertTimeout?: boolean`). This keeps `timeout.ts` as a dumb timer and pushes semantics to the assertion definition. `stable` assertions are created with `invertTimeout: true`.

#### Resolver Change

In `elementResolver` (`dom.ts:177-218`), `stable` uses the same element lists as `updated` (plus `addedElements` and `removedElements` for childList changes), with the same subtree matching. But the handling is inverted: if any element matches, **fail immediately** via `completeAssertion(assertion, false, "Element was mutated during stability window")`.

#### Mutation Filtering: What Should NOT Trigger Failure

| Mutation type | Triggers failure? | Reasoning |
|---|---|---|
| Cursor blink in inputs | No | Not a DOM mutation — paint-level only |
| CSS animations/transitions | No | Not DOM mutations — rendering engine handles these. Only fires if `style`/`class` attributes change |
| React reconciliation markers | No | React uses internal fiber trees, not DOM mutations for diffing |
| Faultsense's own attributes | **Filter out** | OOB processor adds `data-fs-oob-target`. Skip mutations where `attributeName` starts with `data-fs-` |
| Third-party analytics attributes | Yes | Real DOM mutation from user's perspective |

**Key finding:** Most suspected false-positive sources (cursor blink, CSS animations, framework internals) are NOT DOM mutations and won't fire MutationObserver at all. The primary real risk is Faultsense's own attribute mutations.

#### Recommended Usage Pattern: OOB-Triggered

Direct trigger creates a race: click triggers XHR → response mutates DOM (expected) → `stable` fails immediately on that expected mutation. **Solution:** Use OOB to trigger `stable` after the initial mutation passes:

```html
<button fs-assert="dashboard/load-metrics" fs-trigger="click"
  fs-assert-updated=".metrics-panel">Load Metrics</button>

<div class="metrics-panel"
  fs-assert="dashboard/metrics-stable"
  fs-assert-oob-stable="dashboard/load-metrics"
  fs-assert-stable="[text-matches=\$[\d,]+]"
  fs-assert-timeout="3000">
```

The `updated` assertion passes on first render. OOB triggers the `stable` assertion. The stability window starts AFTER the expected mutation.

#### Implementation Summary

| File | Change |
|---|---|
| `types.ts` | Add `"stable"` to `AssertionType` union. Add `invertTimeout?: boolean` to `Assertion` |
| `config.ts` | Add `"stable"` to `domAssertions` and `supportedAssertions.types` |
| `timeout.ts` | Check `assertion.invertTimeout` — pass `true` instead of `false` to `completeAssertion` |
| `resolvers/dom.ts` | Add `"stable"` case in `elementResolver` using same element lists as `updated` but inverted (fail on match) |
| No changes needed | `mutations.ts`, `index.ts`, `elements.ts`, `oob.ts`, `manager.ts` |

**~30-50 lines of new code.** Zero additional MutationObserver cost — reuses the global observer and the same mutation categorization.

#### Production Bugs This Catches

1. **Flickering dashboard widget:** Race condition causes re-render with stale data 200ms after initial render. `updated` passes on first render; the re-render is invisible. `stable` catches the second mutation.
2. **Infinite re-render loop (React useEffect bug):** Component re-renders continuously. No error thrown. `stable` fails immediately on the first unexpected re-render.
3. **Optimistic UI rollback:** App applies optimistic update, server rejects, UI silently reverts. `stable` catches the revert mutation.
4. **Chat message duplication:** WebSocket reconnection race renders duplicate messages. `stable` catches the duplicate insertion.
5. **Form field clobbering:** Autofill script or delayed API response overwrites a field the user edited. `stable` catches the overwrite.

</details>

---

### 4. Property Assertion Primitives (`value-matches`, `count`, `disabled`)

**Description:** Three new modifiers closing the most common e2e assertion gaps:
- `[value-matches=pattern]` — reads `el.value` (the live DOM property, not the HTML attribute) for form controls. E2e equivalent: `toHaveValue()`, `should('have.value')`.
- `[count=N]` / `[count-min=N]` / `[count-max=N]` — asserts how many elements match the selector. E2e equivalent: `toHaveCount()`, `should('have.length')`.
- `[disabled=true|false]` — reads `.disabled` property, `aria-disabled`, `pointer-events`, `inert`. E2e equivalent: `toBeDisabled()`, `toBeEnabled()`.

**Rationale:** These are the three most-used assertion primitives in e2e tools that Faultsense completely lacks. Input value is the #1 assertion in form tests. Cardinality is fundamental to list/search/table correctness ("added one item" vs "added three duplicates"). Disabled state gates double-submit prevention. All three are trivial implementations — entries in `modifiersMap` that read standard DOM properties, fitting the existing modifier architecture perfectly.

**Downsides:** `count` requires `querySelectorAll` which has performance implications with broad selectors. `disabled` detection across various implementation patterns (property, aria, CSS, inert) adds edge case surface area.

**Confidence:** 95%
**Complexity:** Low
**Status:** Unexplored

<details>
<summary>Deep Dive: Implementation Analysis</summary>

#### How the Modifier System Works End-to-End

**Parse** (`processors/elements.ts`): `parseTypeValue()` takes `#note[text-matches=Count: \d+][classlist=active:true]` and splits into `selector` + `modifiers` Record. The bracket parser (lines 53-78) handles nested brackets for regex character classes. `resolveInlineModifiers()` classifies modifiers: reserved keys (`text-matches`, `classlist` per `config.ts:35`) pass through; unreserved keys become `attrs-match` JSON blob.

**Store** (`types.ts:122`): Modifiers stored as `Partial<Record<AssertionModifiers, AssertionModiferValue>>` on the Assertion object.

**Evaluate** (`resolvers/dom.ts`): `getAssertionModifierFns()` builds an array of check functions from `modifiersMap`. `handleAssertion()` runs all modifier functions against matched elements — iterates ALL matching elements and passes if ANY single element satisfies ALL modifiers.

Current `modifiersMap` entries:
- `text-matches`: `new RegExp(modValue).test(el.textContent)`
- `attrs-match`: JSON parse → check `el.getAttribute(key) === value` for all
- `classlist`: JSON parse → check `el.classList.contains()` for each

Modifiers are checked **at resolution time** (when MutationObserver fires), not continuously.

#### `value-matches` Implementation

**Drop-in to `modifiersMap`.** Follows exact same pattern as `text-matches`:

| Step | Change |
|---|---|
| `config.ts:35` | Add `"value-matches"` to `inlineModifiers` |
| `types.ts:100-106` | Add `"value-matches"` to `AssertionModifiers` union |
| `resolvers/dom.ts` | Add to `modifiersMap`: read `(el as HTMLInputElement).value`, test with `new RegExp(modValue)` |

**Critical edge case — MutationObserver doesn't fire on `.value` changes.** Input `.value` is a property, not an attribute. Typing into an input does NOT trigger MutationObserver. `value-matches` only reliably evaluates during event-triggered resolution (`fs-trigger="change"` or `fs-trigger="blur"`), or when a programmatic update also causes a DOM mutation. This is the correct behavior for Faultsense's model — the trigger event is the signal that the interaction happened.

**Other edge cases:**
- Non-form elements: `el.value` is `undefined` → modifier fails (don't fall back to textContent — clean separation)
- Select elements: `el.value` returns the selected option's value attribute, not display text — correct and expected
- Checkbox/radio: `el.value` is the static value attribute, not checked state — document this, recommend `[checked]` attribute check instead
- Textarea: works as expected

#### `count` Implementation

**Architecturally different.** Current modifiers check a property of a single matched element. `count` checks cardinality of the result set.

**Recommended approach: Pre-modifier check in `handleAssertion`.** Before the per-element modifier loop, check if the assertion has a count modifier. Run `document.querySelectorAll(selector).length` and compare. This makes `count` a "selector-level modifier" — a new concept, but cleanly separated.

| Step | Change |
|---|---|
| `config.ts` | Add `"count"`, `"count-min"`, `"count-max"` to `inlineModifiers` |
| `types.ts` | Add to `AssertionModifiers` union |
| `resolvers/dom.ts` | Add selector-level check in `handleAssertion()` before per-element loop |

**Design decision:** Should `[count=3][text-matches=\w+]` mean "3 elements match `.item`" or "3 elements match `.item` AND have text matching `\w+`"? Recommend: count applies to the selector matches, then per-element modifiers apply individually. Simpler, more predictable.

**Self-referencing with count is nonsensical** (count of the element itself is always 1). Should require explicit selector.

#### `disabled` Implementation

**Drop-in to `modifiersMap`,** same pattern as `classlist`.

Checks in priority order:
1. `'disabled' in el && (el as any).disabled` — native property on form elements
2. `el.getAttribute('aria-disabled') === 'true'` — ARIA attribute
3. `el.hasAttribute('inert')` — HTML inert attribute
4. `getComputedStyle(el).pointerEvents === 'none'` — CSS property

**Performance note:** `getComputedStyle` forces layout reflow if styles are dirty. Consider making `pointer-events` check opt-in, or excluding it from v1. The first three checks are free.

**Ancestor `inert`:** `el.closest('[inert]')` would catch inherited inert state but adds DOM traversal. Skip for v1 — document that only the element's own `inert` attribute is checked.

#### Usage Examples

```html
<!-- value-matches: verify search populated after autocomplete -->
<input id="search" type="text"
  fs-assert="search/autocomplete-fill"
  fs-trigger="change"
  fs-assert-updated="[value-matches=.{3,}]" />

<!-- value-matches: verify zip code format after autofill -->
<button fs-assert="checkout/apply-address" fs-trigger="click"
  fs-assert-updated="#zip[value-matches=^\d{5}(-\d{4})?$]">Apply Address</button>

<!-- count: verify search results appeared -->
<form fs-assert="search/execute" fs-trigger="submit"
  fs-assert-added-200=".result-card[count-min=1]">

<!-- count: verify item removal reduced count -->
<button fs-assert="cart/remove-item" fs-trigger="click"
  fs-assert-updated=".cart-item[count-max=10]">Remove Item</button>

<!-- disabled: verify button disables after submit (double-submit prevention) -->
<form fs-assert="checkout/submit-order" fs-trigger="submit"
  fs-assert-updated="#submit-btn[disabled=true]">

<!-- disabled: verify submit enabled after valid input -->
<input id="email" fs-assert="signup/email-validation" fs-trigger="blur"
  fs-assert-updated="#submit-btn[disabled=false]">
```

</details>

---

### 5. Client-Side Context Signals (URL/Storage/Network Condition Gates)

**Description:** Extend the response-conditional pattern beyond HTTP status to other observable client-side signals:
- `fs-assert-added=".success[url=/dashboard]"` — gate DOM assertion on URL matching a pattern (inline modifier)
- `fs-assert-added-storage-cart=".cart-items"` — gate DOM assertion on localStorage key being set (suffix pattern)
- `fs-trigger="offline"` / `fs-trigger="online"` — trigger assertions on real network degradation/recovery

These are additional "context signals" that tell Faultsense what SHOULD have happened without requiring `fs-resp-for` header integration on the server.

**Rationale:** The `fs-resp-for` header approach requires server cooperation, which is the biggest adoption friction for response-conditional assertions. Many correctness signals are already observable client-side: URL changed to `/dashboard` after login (no server needed), `localStorage.cart` updated after add-to-cart, network went offline. For the login form example — distinguishing "should show error" vs "should show success" — URL change to `/dashboard` or `localStorage.token` being set are zero-integration alternatives to checking HTTP 200 vs 400. Network condition triggers turn Faultsense's production context into a unique advantage: real users go offline, and Faultsense can assert the app handled it.

**Downsides:** Intercepting `pushState`, `Storage.setItem`, and `navigator.onLine` adds interception surface area. Multiple gating signals on one assertion increases parse complexity. Storage events don't fire within the same tab (need proxy via `Storage.prototype.setItem` interception).

**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

<details>
<summary>Deep Dive: Implementation Analysis</summary>

#### How Response-Conditionals Work Today (End-to-End)

1. **Parse** (`elements.ts:124`): `parseDynamicTypes()` scans for `fs-assert-added-200` or `fs-assert-added-json-todo`. Splits after DOM type, tests against `statusSuffixPattern` or `jsonSuffixPattern`. Stores as modifier: `{ "response-status": "200" }`.
2. **Gate** (`elements.ts:321`): If modifiers contain `response-status`/`response-json-key`, assertion created with `httpPending: true`. Gated assertions are invisible to DOM resolvers.
3. **Intercept + Resolve** (`interceptors/network.ts` + `resolvers/http.ts`): Fetch/XHR interceptor matches responses to assertions via `fs-resp-for` header. On match: `httpPending = false` (unblocking DOM resolution), siblings dismissed.
4. **DOM Resolution Unblocked** (`assertion.ts:22`): `getPendingDomAssertions()` filters on `!a.httpPending`. Once gate opens, assertion enters normal DOM pipeline.

**Key insight:** `httpPending` is a generic gate. The HTTP resolver is a "gate opener." This same pattern generalizes to any signal type.

#### Generalized Gate Architecture

Rename `httpPending` to something like `gatesPending: string[]` where each entry is a gate type (`"http"`, `"url"`, `"storage"`). Assertion only enters DOM resolution when all gates are cleared. Supports multiple simultaneous gates.

#### URL Gate: Inline Modifier Approach (Recommended)

URL values contain `/` which is invalid in attribute names. Suffix pattern (`fs-assert-added-url-/dashboard`) doesn't work. **Inline modifier is correct:**

```html
fs-assert-added=".success-msg[url=/dashboard]"
```

Leverages existing `parseTypeValue()` bracket parser. Add `"url"` to `resolveInlineModifiers()` as a reserved modifier key. The URL gate resolver intercepts `pushState`/`replaceState`/`popstate`, matches URL against the modifier value, and flips the gate.

#### Storage Gate: Suffix Pattern Works

Storage keys are simple strings: `fs-assert-added-storage-cart=".cart-items"` follows the existing suffix pattern. `parseDynamicTypes()` recognizes `storage-{key}` after DOM type. Modifier: `{ "storage-key": "cart" }`.

**Interception:** Proxy `Storage.prototype.setItem` globally (like fetch/XHR). Also listen to `window.addEventListener('storage')` for cross-tab writes. `removeItem`/`clear()` also need proxying if removal detection is desired.

**Cookies explicitly excluded from v1.** `document.cookie` getter/setter interception via `Object.defineProperty` is fragile and risks breaking cookie-dependent libraries.

#### Offline/Online: Triggers, Not Gates

These are **triggers** (like `click`, `mount`), not gates. Add to `supportedTriggers` in `config.ts`.

**Challenge:** `handleEvent` (`manager.ts:112`) checks `event.target instanceof HTMLElement` and returns early otherwise. `online`/`offline` events fire on `window`. Need a new pattern:

```
window.addEventListener('offline', () => {
  const elements = document.querySelectorAll(`[fs-trigger="offline"]`);
  assertionManager.processElements(Array.from(elements), ["offline"]);
});
```

Reuses existing `processElements` path. Also need initial check of `navigator.onLine` at init time (like `mount` processes existing elements).

#### The Login Form Solved Without fs-resp-for

```html
<form fs-assert="auth/login" fs-trigger="submit"
  fs-assert-added=".dashboard-welcome[url=/dashboard]"
  fs-assert-added=".error-msg[url=/login]"
  fs-assert-timeout="5000">
```

After submit: if app navigates to `/dashboard` and `.dashboard-welcome` appears, first assertion passes, second dismissed. If we stay on `/login` and `.error-msg` appears, second passes, first dismissed. **No server-side header needed.**

#### Differentiation from `fs-assert-route`

- `fs-assert-route`: URL IS the assertion target ("assert we navigated to /dashboard")
- URL gate modifier: URL is a precondition for a DOM assertion ("when we're on /dashboard, assert .welcome is visible")

These are complementary features. A URL gate on `mount` trigger with `fs-assert-visible` is practically equivalent to a route assertion + DOM assertion, but the route assertion is semantically cleaner for pure navigation checks.

#### Usage Examples

```html
<!-- Login success/error without fs-resp-for -->
<form fs-assert="auth/login" fs-trigger="submit"
  fs-assert-added=".dashboard-welcome[url=/dashboard]"
  fs-assert-added=".error-msg[url=/login]">

<!-- Cart persistence verified via storage -->
<button fs-assert="cart/add-item" fs-trigger="click"
  fs-assert-updated=".cart-count[storage=cart][text-matches=\d+]">
  Add to Cart
</button>

<!-- Offline UX verification -->
<div class="app-container"
  fs-assert="app/offline-banner"
  fs-trigger="offline"
  fs-assert-visible=".offline-banner">

<!-- Reconnection recovery -->
<div class="offline-banner"
  fs-assert="app/reconnect"
  fs-trigger="online"
  fs-assert-hidden=".offline-banner">

<!-- Multi-gate: URL + DOM -->
<a href="/settings" fs-assert="settings/load-profile"
   fs-trigger="click"
   fs-assert-visible=".profile-section[url=/settings]"
   fs-assert-timeout="3000">Settings</a>
```

</details>

---

### 6. Degraded Mode Assertions (OOB on Fail)

**Description:** Extend OOB assertions to trigger on parent FAIL/TIMEOUT, not just PASS. New attribute: `fs-assert-oob-fail-added="third-party/chat-widget"` — when the chat widget assertion fails or times out, assert the fallback UI appeared. Implementation is a filter change in `settle()`: the OOB system already evaluates parent assertion status, it currently filters to `status === 'passed'`.

**Rationale:** E2e tests can't meaningfully test third-party failures, CDN outages, or slow dependency loads because they control the environment. In production, these happen constantly. The question isn't "did it fail?" (error tracking covers that) but "when it failed, did the fallback UI appear?" This is pure semantic correctness that only a production agent can verify. The implementation cost is near-zero — the OOB infrastructure is fully built, it just needs to respond to failure in addition to success.

**Downsides:** Encourages assertions on external dependencies with unpredictable failure modes. "Fail" and "timeout" may warrant different fallback behaviors. Could generate noise if a dependency fails intermittently.

**Confidence:** 85%
**Complexity:** Low
**Status:** Unexplored

<details>
<summary>Deep Dive: Implementation Analysis</summary>

#### How OOB Works Today

**Parsing** (`processors/oob.ts`): OOB attributes follow `fs-assert-oob-{type}` pattern (prefix from `config.ts:32`). Value is comma-separated parent assertion keys. The OOB element also needs `fs-assert` (its own key) and `fs-assert-{type}` (the DOM assertion to perform).

**Trigger mechanism** (`manager.ts:204-219`): Inside `settle()`:
1. Filter completed assertions to `toSettle` (non-dismissed, status changed)
2. Send to collector
3. **Line 208:** `const passed = toSettle.filter(a => a.status === "passed" && !a.oob)`
4. If any passed, call `findAndCreateOobAssertions(passed)` — scans DOM for `fs-assert-oob-*` elements
5. For each OOB element, check if comma-separated parent keys match a passed assertion key
6. Create new `Assertion` objects with `trigger: "oob"` and `oob: true`
7. Enqueue and try `immediateResolver`

**The pass-only filter is exactly one line:** `a.status === "passed"`. The `!a.oob` guard prevents chaining.

**OOB assertions are created dynamically at settle time**, not upfront. No `Assertion` object exists until a parent settles.

#### What Changes

**Attribute syntax: `fs-assert-oob-fail-{type}`** (recommended over `oob-{type}-fail` which collides with status suffix pattern).

| File | Change |
|---|---|
| `config.ts` | Add `oobFailPrefix = "fs-assert-oob-fail-"` |
| `processors/oob.ts` | Add `oobFailSelector` from `oobFailPrefix`. Parameterize `findAndCreateOobAssertions` to accept prefix, or add `findAndCreateOobFailAssertions` |
| `assertions/manager.ts` | In `settle()`, add second block: `const failed = toSettle.filter(a => a.status === "failed" && !a.oob)` → call fail-OOB finder |
| `types.ts` | No changes needed. `oob: true` works for both. Optionally expand to `oob?: "pass" \| "fail"` for telemetry |

**~15-25 lines of new production code** plus the config constant.

#### Why `fail` and `timeout` Should NOT Be Separate

Timeouts already resolve as `status: "failed"` (`timeout.ts:55`). No separate `"timed_out"` status exists. Splitting `oob-fail` vs `oob-timeout` would require a new `AssertionStatus` value (breaking change) or inspecting `statusReason` strings (fragile). A single `oob-fail` that fires on any `status === "failed"` is correct.

#### Edge Cases

**Parent retried after fail:** `settle()` fires with the failed assertion before any retry opportunity (retry only happens on a new trigger event). Fire fail-OOB immediately on first failure. If parent later retries and passes, pass-OOB fires separately. Degraded UI assertion handles this naturally.

**OOB element not in DOM yet:** `querySelectorAll(oobFailSelector)` won't find it. Same as pass-OOB today — acceptable. The fallback element should already be in the DOM as a hidden container.

**Both pass-OOB and fail-OOB on same parent:** Use separate elements:
```html
<!-- Success path -->
<div id="chat-container"
  fs-assert="chat/widget-loaded"
  fs-assert-oob-visible="third-party/chat-widget"
  fs-assert-visible="">

<!-- Failure path -->
<div id="chat-fallback"
  fs-assert="chat/fallback-shown"
  fs-assert-oob-fail-visible="third-party/chat-widget"
  fs-assert-visible="">
  Chat is temporarily unavailable
</div>
```

**Cascading failures:** Anti-chaining guard (`!a.oob`) already prevents this. Fail-OOB has `oob: true`, so its own failure won't trigger further OOB.

#### Usage Examples

```html
<!-- Third-party widget fails → fallback shown -->
<div id="chat-mount"
  fs-assert="vendor/chat-widget"
  fs-trigger="mount"
  fs-assert-added="#intercom-container"
  fs-assert-timeout="5000">
</div>
<div id="chat-fallback"
  fs-assert="vendor/chat-fallback"
  fs-assert-oob-fail-visible="vendor/chat-widget"
  fs-assert-visible="">
  <a href="/contact">Contact support</a>
</div>

<!-- API timeout → error state shown -->
<button fs-trigger="click"
  fs-assert="dashboard/load-data"
  fs-assert-added-200=".data-table"
  fs-assert-timeout="3000">Load Data</button>
<div id="error-banner"
  fs-assert="dashboard/load-error-shown"
  fs-assert-oob-fail-visible="dashboard/load-data"
  fs-assert-visible="[text-matches=Unable to load]">
</div>

<!-- Image fails → placeholder shown -->
<img id="hero"
  fs-assert="homepage/hero-image"
  fs-trigger="mount"
  fs-assert-loaded="#hero"
  fs-assert-timeout="5000" />
<div id="hero-placeholder"
  fs-assert="homepage/hero-fallback"
  fs-assert-oob-fail-visible="homepage/hero-image"
  fs-assert-visible="">Image unavailable</div>

<!-- Feature flags unreachable → default experience -->
<div id="feature-flag-mount"
  fs-assert="flags/load-config"
  fs-trigger="mount"
  fs-assert-updated="#app[data-flags-loaded=true]"
  fs-assert-timeout="2000">
</div>
<div id="default-nav"
  fs-assert="flags/default-nav-rendered"
  fs-assert-oob-fail-visible="flags/load-config"
  fs-assert-visible=".nav-default">
</div>
```

</details>

---

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Multi-step journey assertions (fs-assert-after) | Excluded from this artifact per user request — evaluated separately |
| 2 | checked modifier | Subsumed by `value-matches` — `.checked` is a property like `.value` |
| 3 | validity modifier (ValidityState) | Too narrow; coupled to HTML5 native validation which many apps don't use |
| 4 | selected-option modifier | Subsumed by `value-matches` on select elements |
| 5 | Strict temporal ordering (fs-assert-sequence) | Over-engineered vs `fs-assert-after` which achieves the same with less API surface |
| 6 | Session Assertion Ledger | Backend/collector concern, not an agent feature |
| 7 | Assertion Scopes | Premature — let `fs-assert-after` prove the journey concept first |
| 8 | Flow Timeout | Natural consequence of `fs-assert-after` + existing per-assertion timeouts |
| 9 | Cross-page journey stitching | Natural extension of `fs-assert-after` + existing MPA persistence |
| 10 | Inverse journeys (fs-assert-not-after) | Niche security use case; hard to instrument without false positives |
| 11 | Trigger composition | Adds significant parsing complexity; defer until limitations proven painful |
| 12 | Request body assertions | Complex interception; narrow use case vs adoption friction |
| 13 | Unhandled error boundary assertions | Overlaps with error tracking tools (Sentry, Bugsnag) |
| 14 | Session continuity assertions | Covered by navigation triggers + MPA mode + `fs-assert-after` |
| 15 | WebSocket/SSE stream assertions | Important but narrow audience; high implementation complexity |
| 16 | Retry/idempotency assertions | Complex trigger counting semantics; narrow use case |
| 17 | fs-assert-focused | Niche accessibility value; low production signal-to-noise |
| 18 | fs-assert-scrolled | Niche; IntersectionObserver overhead for low-frequency failure |
| 19 | fs-assert-ordered | Complex comparator logic for narrow DOM pattern |
| 20 | fs-assert-computed (CSS styles) | Computed value normalization is tricky; perf risk with broad selectors |
| 21 | Composite assertions (AND/OR gates) | Over-engineered; `fs-assert-after` + OOB covers most composition needs |
| 22 | Assertion decay | Complex lifecycle; `fs-assert-stable` covers primary use case more cleanly |
| 23 | Snapshot diffing | High false-positive risk; noisy on dynamic content |
| 24 | Assertion inference (fs-assert-auto) | Unreliable; dilutes manual instrumentation moat |
| 25 | Response body shape assertions | Incremental extension of existing `json-key`, not a new capability |
| 26 | Timing budget assertions | Conflates correctness with performance; data already flows via duration |
| 27 | Empty state assertions | Subsumed by `count=0` modifier |
| 28 | Stale content / freshness | Complex re-arming lifecycle; better as collector-side metric |

## Session Log
- 2026-03-26: Initial ideation — 48 raw ideas from 6 sub-agents, ~30 after dedup, 3 cross-cutting combinations synthesized, 7 survived filtering, 6 written to artifact (idea #1 multi-step journeys excluded per user direction)
- 2026-03-26: Deep dive on all 6 ideas — codebase analysis of implementation paths, specific files/functions, edge cases, design decisions, and concrete usage examples added to each idea
