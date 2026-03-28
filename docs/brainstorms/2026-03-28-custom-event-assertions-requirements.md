---
date: 2026-03-28
topic: custom-event-assertions
---

# Custom Event Assertions (`fs-assert-emitted` / `fs-trigger` Extension)

## Problem Frame

Faultsense currently triggers assertions exclusively from native DOM events (`click`, `submit`, `change`, etc.), `mount`/`unmount` lifecycle, and `invariant` continuous monitoring. Custom events — the primary inter-component communication mechanism in web components, micro-frontends, and many framework patterns — are invisible to the agent. This creates two gaps:

1. **Trigger gap:** Actions initiated by custom events (e.g., a cart widget dispatching `cart-updated` after an API call) cannot trigger assertion evaluation.

2. **Outcome gap:** When the *correct outcome* of a user action is a custom event being dispatched (e.g., a payment form emitting `payment:complete`), there is no assertion type to verify it.

## Critical Design Decision: Listen on `document`, Not the Element

The original brainstorm proposed registering listeners on the element that carries the `fs-*` attributes. **This is wrong for most real-world applications.**

### Where custom events actually fire

In practice, `new CustomEvent('order:confirmed', { detail: { orderId: 123 } })` gets dispatched from:

1. **`document` or `window`** — event bus pattern (most common in React/Vue apps)
2. **The component's root/host element** — web component pattern (`this.dispatchEvent(...)` from the custom element class, not from a child button inside it)
3. **A service/store layer** — sometimes dispatched from a non-DOM source via `document.dispatchEvent`

Consider this example:

```html
<button fs-assert="checkout/submit" fs-trigger="click"
  fs-assert-emitted="order:confirmed[detail-matches=orderId:\d+]">
  Place Order
</button>
```

The button dispatches `click`. The *result* of handling that click (API call completes → order confirmed) dispatches `order:confirmed` from somewhere else entirely — likely `document`, a parent component, or a service. The button never sees this event because:

- `bubbles: false` (CustomEvent default) → event doesn't leave the dispatch target
- `bubbles: true` → bubbling goes UP from the dispatch target, not down to arbitrary elements. The button would only see events from its own descendants.

### The correct approach

**Listen on `document` for all custom events.** This catches:
- Event bus patterns (dispatched on `document` directly)
- Bubbling custom events from anywhere in the DOM (`bubbles: true`)
- Web component events with `composed: true` that cross shadow boundaries

This also **simplifies the implementation** — no per-element listener lifecycle management. One `document.addEventListener(eventName, ...)` per unique event name across all active assertions.

The mental model shifts from "this element emitted an event" to "this event was observed after this trigger fired." Which is more honest about what's actually happening in production.

---

## Angle 1: Custom Event as Trigger (`fs-trigger="event:eventName"`)

### Concept

A custom event acts as the trigger that initiates assertion processing — identical in role to `click` or `submit`. The assertion types are declared normally. The custom event replaces the user interaction as the starting signal.

### Syntax

```html
<!-- When cart-updated fires anywhere, assert the count text updated -->
<div id="cart-count"
  fs-assert="cart/count-sync"
  fs-trigger="event:cart-updated"
  fs-assert-updated="[text-matches=\d+]">
  0 items
</div>

<!-- When data-loaded fires, assert the table is visible -->
<table id="results"
  fs-assert="search/results-loaded"
  fs-trigger="event:data-loaded"
  fs-assert-visible="#results tbody tr[count-min=1]">
</table>
```

The `event:` prefix distinguishes custom events from built-in event names. Everything after `event:` is the literal CustomEvent name.

### How It Works

1. At init, scan for all elements with `fs-trigger="event:*"`. Parse unique event names.
2. Register `document.addEventListener(eventName, handler)` for each unique event name.
3. When the event fires, `querySelectorAll('[fs-trigger="event:eventName"]')` to find matching elements.
4. Process those elements to create assertions via `createElementProcessor` + `enqueueAssertions` — same as mount/invariant initial processing.
5. Assertions resolve through the normal DOM resolver pipeline.

This follows the exact same pattern as the online/offline triggers from the context signals brainstorm — window-level events that query for matching trigger elements.

- R1. **Register on `document`** for each unique custom event name found in `fs-trigger="event:*"` attributes at init time.
- R2. **Scan on mount:** When MutationObserver detects new elements with `fs-trigger="event:*"`, register any new event names not already registered.
- R3. **No deregistration on unmount.** Document-level listeners are cheap. Keep them active for the agent's lifetime. Clean up in the agent's cleanup function.
- R4. **Handler queries for matching elements** on each event fire. Only elements currently in the DOM with matching `fs-trigger` are processed. Removed elements are naturally excluded.

### `event.detail` Gating

- R5. **`detail-matches` modifier on trigger value.** Optional modifier to gate assertion creation on the CustomEvent's `detail` payload:

```html
<!-- Only trigger when detail.action === "increment" -->
<div fs-assert="cart/increment"
  fs-trigger="event:cart-updated[detail-matches=action:increment]"
  fs-assert-updated="#cart-count[text-matches=\d+]">
</div>
```

- R6. **Shallow key:value matching.** Comma-separated `key:value` pairs checked against `event.detail`. If `event.detail` is a primitive, match against the raw value: `[detail-matches=success]` checks `String(event.detail) === "success"`.
- R7. **Unmatched detail = no trigger.** If `detail-matches` is specified and doesn't match, the element is skipped — no assertion created.

### Edge Cases

- **Event fires before init:** Missed, same as a click before init. Consistent behavior.
- **Rapid fire / re-trigger:** Same as built-in events. If pending assertion exists, records `attempts[]` timestamp + re-evaluates (per the expanded triggers re-trigger fix).

---

## Angle 2: Custom Event as Assertion Type (`fs-assert-emitted`)

### Concept

A new assertion type where the expected outcome is a specific CustomEvent being dispatched. The event itself is the thing being asserted — not a DOM mutation.

### Syntax

```html
<!-- Click triggers the assertion; assertion passes when payment:complete fires -->
<button fs-assert="payment/process" fs-trigger="click"
  fs-assert-emitted="payment:complete">
  Pay Now
</button>

<!-- Assert the event fires AND check its detail payload -->
<button fs-assert="checkout/submit" fs-trigger="click"
  fs-assert-emitted="order:confirmed[detail-matches=orderId:\d+]">
  Place Order
</button>

<!-- Web component readiness event -->
<my-component fs-assert="widget/init" fs-trigger="mount"
  fs-assert-emitted="widget:ready">
</my-component>
```

### How It Works

1. Add `"emitted"` to `allAssertionTypes`. The type value is the custom event name (not a CSS selector).
2. When an `emitted` assertion is enqueued, register `document.addEventListener(eventName, handler)` if not already registered for that event name.
3. When the event fires, check pending `emitted` assertions for matching event names. Check `detail-matches` modifiers against `event.detail`. Resolve pass/fail.
4. One-shot semantics: first matching event resolves the assertion. Use `AbortController` for cleanup on timeout/GC.

- R8. **Listen on `document`.** Same rationale as Angle 1 — custom events fire from arbitrary sources, not from the trigger element.
- R9. **Shared listener pool.** If both a `trigger` element and an `emitted` assertion reference the same event name, one document-level listener serves both. Maintain a registry of `eventName → { triggerElements: Set, pendingAssertions: Set }`.
- R10. **Detail mismatch leaves assertion pending.** Unlike the trigger angle (where mismatch prevents creation), here the assertion already exists. A non-matching event is ignored — the assertion waits for a matching one or times out.
- R11. **AbortController cleanup.** Store an `AbortController` per assertion. On assertion completion (pass/fail/GC/unload), call `abort()`. If no more assertions or triggers reference the event name, optionally deregister the document listener.
- R12. **MPA incompatible.** `emitted` assertions with `fs-assert-mpa` should warn — listeners cannot survive page navigation.

### Synchronous Dispatch Gap

If the trigger handler dispatches the custom event synchronously:
```js
button.addEventListener('click', () => {
  // This fires BEFORE Faultsense creates the emitted assertion
  document.dispatchEvent(new CustomEvent('order:confirmed'));
});
```

The `emitted` listener isn't registered yet — assertion creation happens in the same event loop turn but after the synchronous dispatch. **This is a known limitation.** Document that `emitted` assertions expect asynchronous event dispatch (after API calls, timeouts, microtasks), which is the common case.

---

## Angle 3: Both Together

### Combined Patterns

```html
<!-- Trigger: user clicks. Assertion: custom event fires as a result -->
<button fs-assert="payment/process" fs-trigger="click"
  fs-assert-emitted="payment:complete[detail-matches=status:success]">
  Pay Now
</button>

<!-- Trigger: custom event. Assertion: DOM changes as a result -->
<div id="cart-count"
  fs-assert="cart/count-sync" fs-trigger="event:cart-updated"
  fs-assert-updated="[text-matches=\d+ items]">
  0 items
</div>

<!-- Conditional: emitted event = success, DOM element = error -->
<button fs-assert="data/export" fs-trigger="click"
  fs-assert-grouped=""
  fs-assert-emitted-success="export:complete"
  fs-assert-added-error=".error-banner">
  Export CSV
</button>
```

### The Conditional + Grouped Pattern

The last example is particularly powerful. `fs-assert-emitted-success` and `fs-assert-added-error` use different assertion types with conditional keys, linked by `fs-assert-grouped`. First to resolve wins:
- If `export:complete` fires, the `emitted-success` assertion passes, `added-error` is dismissed
- If `.error-banner` appears in the DOM, the `added-error` assertion passes, `emitted-success` is dismissed

This works with zero changes to the conditional assertion system — `emitted` is just another assertion type that can carry a condition key suffix.

---

## Interaction with OOB

**Custom event triggers complement OOB but do not replace it.**

- OOB is declarative and requires zero app code — Faultsense handles the trigger chain internally. Custom event triggers require the app to dispatch events.
- OOB guarantees ordering (secondary fires after primary resolves). Custom events have no ordering guarantee.
- OOB triggers on assertion *failure* (`fs-assert-oob-fail`). Custom events would need the app to dispatch failure events.
- Custom event triggers are better when the app *already* dispatches events (web components, event buses). OOB is better when adding assertions to an app without custom events.

Both should coexist.

---

## Web Component Patterns

### Vanilla Web Component

```html
<!-- Component dispatches "user-selected" on document when a user is picked -->
<user-picker
  fs-assert="team/select-member" fs-trigger="event:user-selected"
  fs-assert-updated="#selected-user-name[text-matches=.+]">
</user-picker>
```

### Lit Element

```typescript
@customElement('payment-form')
class PaymentForm extends LitElement {
  private async handleSubmit() {
    const result = await processPayment();
    // Dispatches on the host element with bubbles+composed → reaches document
    this.dispatchEvent(new CustomEvent('payment-result', {
      detail: { status: result.status, transactionId: result.id },
      bubbles: true, composed: true
    }));
  }
}
```

```html
<!-- Trigger: use the custom event -->
<payment-form
  fs-assert="checkout/payment" fs-trigger="event:payment-result"
  fs-assert-visible=".confirmation[text-matches=Transaction #\w+]">
</payment-form>

<!-- Or assert the event itself -->
<payment-form
  fs-assert="checkout/payment-event" fs-trigger="submit"
  fs-assert-emitted="payment-result[detail-matches=status:success]">
</payment-form>
```

### Micro-Frontend Event Bus

```html
<!-- Cart micro-frontend dispatches on document -->
<div id="cart-count"
  fs-assert="cart/item-added" fs-trigger="event:cart:item-added"
  fs-assert-updated="[text-matches=\d+]">
</div>

<!-- Analytics tracker: assert one event triggers another -->
<div id="analytics-tracker"
  fs-assert="analytics/page-tracked" fs-trigger="event:route-changed"
  fs-assert-emitted="analytics:beacon-sent">
</div>
```

### Shadow DOM Notes

- Events dispatched on the custom element host with `bubbles: true` naturally reach `document`. Faultsense's document-level listener catches these.
- Events with `composed: true` cross shadow boundaries. Events with `composed: false` stay inside the shadow root — these are internal implementation events, not public contracts.
- No special shadow DOM handling needed in the agent.

---

## Implementation Recommendations

### Phase 1: Custom Event as Trigger (`fs-trigger="event:*"`)

**Implement first.** Lower-risk, higher-leverage:

- Reuses the entire existing assertion pipeline — event triggers just create assertions, resolved through DOM resolvers
- No new assertion type, no new resolver
- Implementation: document-level listener registration + `querySelectorAll` on fire + `processElements`
- Follows the same pattern as online/offline triggers (window-level events → query for matching elements)
- `detail-matches` modifier reuses the existing inline modifier parser

**Estimated scope:** ~80 lines of new code in init/manager + config changes.

### Phase 2: Custom Event as Assertion Type (`fs-assert-emitted`)

**Implement second.** Requires more new infrastructure:

- New assertion type in the type system
- New resolution path: pending `emitted` assertions matched against incoming events
- AbortController lifecycle for cleanup
- Synchronous dispatch limitation documented

**Estimated scope:** ~120 lines new resolver + type system additions + manager integration.

### Why This Order

1. Phase 1 unlocks web component and micro-frontend support immediately
2. Phase 1 has zero impact on existing resolvers
3. Phase 2 reuses Phase 1's document-level listener infrastructure
4. If Phase 1 solves 80% of use cases, Phase 2 can be deprioritized

---

## Requirements Summary

| ID | Requirement | Angle |
|----|-------------|-------|
| R1 | Register document-level listener per unique custom event name | Both |
| R2 | Scan for new event names on mount (MutationObserver) | Trigger |
| R3 | No per-element deregistration; cleanup on agent teardown | Both |
| R4 | Handler queries DOM for matching trigger elements on fire | Trigger |
| R5 | `detail-matches` modifier on trigger value | Trigger |
| R6 | Shallow key:value matching on event.detail | Both |
| R7 | Unmatched detail = no trigger (assertion not created) | Trigger |
| R8 | Listen on document (not element) | Both |
| R9 | Shared listener pool across triggers and assertions | Both |
| R10 | Detail mismatch leaves emitted assertion pending | Assertion |
| R11 | AbortController cleanup on timeout/GC/unload | Assertion |
| R12 | `emitted` + MPA = warn and ignore MPA | Assertion |

## Scope Boundaries

- No per-element listeners — document-level only
- No nested `event.detail` path matching in v1 — shallow keys only
- No `emitted` + MPA mode in v1
- No wildcard event names
- `emitted` does not replace OOB
- Synchronous dispatch is a documented limitation

## Outstanding Questions

- Should `detail-matches` use the bracket syntax (`fs-trigger="event:name[detail-matches=key:val]"`) or a separate attribute? Bracket syntax is consistent but makes trigger values complex.
- Should detail matching support regex (like `text-matches`) or strict equality? Could support both: bare values for equality, regex patterns for matching.
- How does `emittedResolver` reference pending assertions? Need a map of `eventName → Set<Assertion>` maintained by the manager on enqueue/settle.

## Next Steps

> `/ce:plan` for Phase 1 (custom event triggers) implementation planning
