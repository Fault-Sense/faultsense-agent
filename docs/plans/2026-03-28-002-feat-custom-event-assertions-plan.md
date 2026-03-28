---
title: "feat: Custom Event Assertions"
type: feat
status: active
date: 2026-03-28
origin: docs/brainstorms/2026-03-28-custom-event-assertions-requirements.md
---

# feat: Custom Event Assertions

## Overview

Add support for CustomEvents in two complementary roles: (1) as triggers that initiate assertion evaluation (`fs-trigger="event:eventName"`), and (2) as assertion types that verify a CustomEvent was dispatched (`fs-assert-emitted="eventName"`). Both roles share a document-level listener pool. Phase 1 (triggers) reuses the entire existing pipeline with no new resolvers. Phase 2 (assertion type) adds a new resolver and type.

## Problem Statement / Motivation

Faultsense currently triggers assertions exclusively from native DOM events, `mount`/`unmount` lifecycle, and `invariant` monitoring. Custom events — the primary inter-component communication mechanism in web components, micro-frontends, and event bus patterns — are invisible to the agent. This creates two gaps:

1. **Trigger gap:** Actions initiated by custom events (e.g., `cart-updated` after an API call) cannot start assertion evaluation.
2. **Outcome gap:** When the correct outcome of a user action is a custom event being dispatched (e.g., `payment:complete`), there is no assertion type to verify it.

## Proposed Solution

### Phase 1: Custom Event as Trigger (`fs-trigger="event:eventName"`)

A custom event replaces the user interaction as the starting signal. Assertion types are declared normally and resolved through existing DOM resolvers.

```html
<div id="cart-count"
  fs-assert="cart/count-sync"
  fs-trigger="event:cart-updated"
  fs-assert-updated="[text-matches=\d+]">
  0 items
</div>
```

**Implementation steps:**

1. **Add a custom event listener registry** — a new module `src/listeners/custom-events.ts` that manages a `Map<string, { handler: EventListener, abortController: AbortController }>` keyed by event name. Exposes `registerCustomEvent(eventName, handler)`, `deregisterAll()`, and `isRegistered(eventName)`.

2. **Parse `event:` prefix in `isProcessableElement`** (`src/processors/elements.ts:211-221`). Currently `isProcessableElement` does a strict `triggers.includes(triggerValue)` check. For custom event triggers, the trigger value is `event:cart-updated` (with possible `[detail-matches=...]` suffix), which won't match the `triggers` array. Two changes needed:
   - Add a helper `isCustomEventTrigger(triggerValue: string): boolean` that checks for the `event:` prefix.
   - In `isProcessableElement`, when the trigger value starts with `event:`, match against a `"custom-event"` sentinel in the triggers array (or match the full `event:eventName` string passed from the custom event handler).

3. **Parse `detail-matches` from the trigger value** — reuse the existing `parseTypeValue` function (`src/processors/elements.ts:48-85`) which already handles bracket syntax. The trigger value `event:cart-updated[detail-matches=action:increment]` parses to `{ selector: "event:cart-updated", modifiers: { "detail-matches": "action:increment" } }`. Add a new `parseTriggerValue(raw: string): { eventName: string, detailMatches?: Record<string, string> }` function that:
   - Strips the `event:` prefix
   - Delegates bracket parsing to `parseTypeValue`
   - Converts `detail-matches` value to key:value pairs (R6: shallow matching, comma-separated `key:value`)

4. **Register document-level listeners at init** (`src/index.ts:70-78`). After the existing `querySelectorAll` for mount/load/invariant triggers, scan for `[fs-trigger^="event:"]` elements. Extract unique event names, register each via `document.addEventListener(eventName, handler)`. The handler:
   - Runs `document.querySelectorAll('[fs-trigger^="event:' + eventName + '"]')` to find matching elements currently in the DOM (R4)
   - For each element, parses `detail-matches` from the trigger value. If specified, checks `event.detail` against the key:value pairs. On mismatch, skips the element (R7)
   - Passes matching elements through `createElementProcessor([triggerValue])` then `enqueueAssertions` — identical to the mount/invariant path

5. **Register new event names on DOM mutation** (`src/assertions/manager.ts:174-196`). In `handleMutations`, after the existing `createElementProcessor(["mount", "invariant"])` call, scan added nodes for `fs-trigger^="event:"` attributes. Extract any event names not already registered and add document-level listeners (R2). No deregistration on element removal — document-level listeners are cheap and persist for the agent lifetime (R3).

6. **Cleanup on agent teardown** (`src/index.ts:84-110`). In the cleanup function, call `deregisterAll()` from the custom event registry to remove all document-level listeners.

7. **Expose `handleCustomEvent` from the assertion manager** (`src/assertions/manager.ts`). Add a new method alongside `handleEvent`:

```typescript
const handleCustomEvent = (event: Event): void => {
  const eventName = event.type;
  const triggerSelector = `[${assertionTriggerAttr}^="event:${eventName}"]`;
  const elements = document.querySelectorAll(triggerSelector);
  const matching: HTMLElement[] = [];

  for (const el of Array.from(elements) as HTMLElement[]) {
    const triggerValue = el.getAttribute(assertionTriggerAttr)!;
    const parsed = parseTriggerValue(triggerValue);
    if (parsed.detailMatches && !matchesDetail(event as CustomEvent, parsed.detailMatches)) {
      continue; // R7: detail mismatch, skip
    }
    matching.push(el);
  }

  if (matching.length === 0) return;
  const elementProcessor = createElementProcessor([...new Set(matching.map(el => el.getAttribute(assertionTriggerAttr)!))]);
  enqueueAssertions(elementProcessor(matching));
};
```

8. **`detail-matches` matching function** — add `matchesDetail(event: CustomEvent, matchers: Record<string, string>): boolean` to the custom events module. Implements R6: if `event.detail` is a primitive, match against `String(event.detail)`. If it's an object, check each `key:value` pair with shallow equality against `event.detail[key]`. Regex support deferred to v2.

9. **Update `supportedTriggers`** (`src/config.ts:88`). The `supportedTriggers` array is used for validation. Custom event triggers are open-ended (any event name), so validation should accept any string starting with `event:`. This means `supportedTriggers` validation in `isProcessableElement` needs to be relaxed for custom events rather than adding to the array.

### Phase 2: Custom Event as Assertion Type (`fs-assert-emitted`)

A new assertion type where the expected outcome is a specific CustomEvent being dispatched.

```html
<button fs-assert="payment/process" fs-trigger="click"
  fs-assert-emitted="payment:complete[detail-matches=orderId:\d+]">
  Pay Now
</button>
```

**Implementation steps:**

1. **Add `"emitted"` to the type system** (`src/types.ts:60-63`). Add `"emitted"` to `allAssertionTypes`. Since `emitted` is neither a DOM type nor a route type, add a new category:

```typescript
export const domAssertionTypes = ["added", "removed", "updated", "visible", "hidden", "loaded", "stable"] as const;
export const eventAssertionTypes = ["emitted"] as const;
export const routeAssertionTypes = ["route"] as const;
export const allAssertionTypes = [...domAssertionTypes, ...eventAssertionTypes, ...routeAssertionTypes] as const;
```

2. **Add `supportedModifiersByType` entry** (`src/config.ts:29-38`). Add `emitted: ["detail-matches"]` to the record. Add `"detail-matches"` to `inlineModifiers` (`src/config.ts:49`).

3. **Create the emitted resolver** — new file `src/resolvers/emitted.ts`. This resolver is event-driven, not called from the mutation/document resolver loop. It exposes:

```typescript
export function emittedResolver(
  event: CustomEvent,
  assertions: Assertion[]
): CompletedAssertion[] {
  // Filter to pending emitted assertions matching event.type
  // For each: check detail-matches modifier against event.detail
  // R10: mismatch leaves assertion pending (return nothing)
  // Match: completeAssertion(assertion, true, "")
}
```

The resolver checks `assertion.typeValue` (the event name, parsed from the attribute value minus modifiers) against `event.type`. If the event name matches, checks `detail-matches` modifier using the same `matchesDetail` function from Phase 1. For `detail-matches` on emitted assertions, support regex matching on values (consistent with `text-matches` behavior) since the brainstorm asks for `[detail-matches=orderId:\d+]`.

4. **Integrate with the shared listener pool** (R9). Extend the custom event registry from Phase 1 to track both trigger elements and pending emitted assertions per event name. When a custom event fires:
   - Phase 1 handler runs: queries DOM for trigger elements, creates assertions
   - Phase 2 handler runs: checks pending `emitted` assertions against the event, resolves matches

   Both run from the same `document.addEventListener` callback. The handler in `handleCustomEvent` (or a renamed `handleCustomEventDispatch`) calls both paths:

```typescript
// In the shared handler:
// 1. Process trigger elements (Phase 1)
// ... existing trigger logic ...
// 2. Resolve emitted assertions (Phase 2)
const emittedResults = emittedResolver(
  event as CustomEvent,
  getPendingEmittedAssertions(activeAssertions)
);
settle(emittedResults);
```

5. **Register listeners for emitted assertion event names** — when `enqueueAssertions` receives an assertion with `type === "emitted"`, extract the event name from `typeValue` and register a document-level listener if not already registered. This mirrors Phase 1's scan-on-mount pattern but runs at enqueue time since emitted assertions are created by other triggers (click, submit, mount), not by the emitted event itself.

6. **Add `getPendingEmittedAssertions` helper** to `src/assertions/assertion.ts` — filters `activeAssertions` for pending assertions with `type === "emitted"`.

7. **AbortController cleanup** (R11). Store an `AbortController` on the assertion (new optional field on `Assertion` interface). When the assertion completes (pass/fail/GC/unload), call `abort()`. In the custom event registry, use `{ signal: assertion.abortController.signal }` for per-assertion listener cleanup. However, since Phase 1 already uses a shared document-level listener per event name, the AbortController is used to remove the assertion from the pending pool rather than to deregister the listener itself. Listener deregistration only happens when no triggers OR emitted assertions reference the event name (optional optimization; keeping listeners is also fine per R3).

8. **MPA incompatibility warning** (R12). In `createAssertions` (`src/processors/elements.ts:297-371`), when `type === "emitted"` and `mpa_mode === true`, emit a console warning and set `mpa_mode = false`:

```typescript
if (typeEntry.type === "emitted" && Boolean(metadata.modifiers["mpa"])) {
  console.warn(
    `[Faultsense]: "emitted" assertions cannot persist across page navigation (MPA mode). ` +
    `Ignoring fs-assert-mpa on "${metadata.details["assert"]}".`
  );
}
```

9. **Conditional + grouped support** — `emitted` assertions carry condition keys naturally since `parseDynamicTypes` (`src/processors/elements.ts:129-162`) already handles `fs-assert-emitted-success="eventName"` by matching `emitted` in `allAssertionTypes` and extracting the `success` suffix. No changes needed — the conditional system treats `emitted` like any other type.

10. **Update `checkImmediateResolved`** (`src/assertions/manager.ts:51-80`). Emitted assertions should NOT be checked by immediate resolvers since they wait for a future event, not current DOM state. Add a guard: `if (assertion.type === "emitted") return;`.

## Technical Considerations

### Document-level listening, not element-level

Custom events fire from arbitrary sources — `document`, component hosts, service layers — not from the trigger element. Listening on the element would miss events dispatched on `document` (event bus pattern) and events that bubble from unrelated DOM subtrees. A single `document.addEventListener(eventName)` per unique event name catches all patterns: event bus, bubbling with `composed: true`, and direct document dispatch. This is the same pattern used for native event listeners in `src/index.ts:38-44`.

### `parseTypeValue` reuse for trigger values

The existing `parseTypeValue` (`src/processors/elements.ts:48-85`) handles bracket syntax with nested brackets (regex character classes). This already works for `event:cart-updated[detail-matches=action:increment]`. The only adaptation needed is a wrapper that strips the `event:` prefix and interprets the "selector" portion as the event name rather than a CSS selector.

### `isProcessableElement` must accept custom event trigger strings

Currently (`src/processors/elements.ts:211-221`), the function does `triggers.includes(element.getAttribute(assertionTriggerAttr))`. For custom events, the trigger attribute value is `event:cart-updated[detail-matches=...]` which is unique per element. The handler must pass the exact trigger string or match on the `event:` prefix. The cleanest approach: when calling `processElements` from the custom event handler, pass the full trigger string (e.g., `"event:cart-updated"`) in the triggers array, and update `isProcessableElement` to do a `startsWith` check for `event:` prefix triggers.

### Synchronous dispatch gap (Phase 2 only)

If the click handler dispatches a custom event synchronously, the `emitted` assertion hasn't been created yet — both happen in the same event loop turn, but assertion creation runs after the synchronous dispatch. This is a documented limitation. The common case (async API calls, microtasks, timeouts) works correctly because the event fires in a later turn after the assertion is pending.

### Re-trigger semantics

Custom event triggers follow the same re-trigger rules as native events. If a trigger fires while an assertion from the same key is already pending, the `attempts[]` timestamp is recorded (`src/assertions/manager.ts:108-110`). No special handling needed.

### Event name collision with native events

The `event:` prefix prevents collision. `fs-trigger="event:click"` explicitly listens for a CustomEvent named `"click"` on `document`, which is distinct from native click handling (captured in the `supportedEvents` listener loop). Unlikely in practice but technically correct.

### Shared handler ordering (Phase 2)

When both trigger and emitted assertions reference the same event name, the handler must run trigger processing first (creating new assertions) then emitted resolution (resolving pending assertions). This ensures an emitted assertion created by the same event name's trigger can't resolve itself in the same tick — which is correct, since that would be a synchronous self-reference.

### Emitted assertions and the existing resolver pipeline

Emitted assertions bypass all DOM resolvers (`elementResolver`, `documentResolver`, `immediateResolver`, `propertyResolver`). The `domAssertions` gate in each resolver (`src/resolvers/dom.ts:249`, `src/resolvers/dom.ts:302`, `src/resolvers/dom.ts:354`) already filters to `domAssertionTypes`, so `emitted` is naturally excluded as long as it's in `eventAssertionTypes` and not `domAssertionTypes`. Same for `getPendingDomAssertions` — it should continue to filter to DOM types only.

### `ApiPayload` and collector compatibility

The `assertion_type` field in `ApiPayload` (`src/types.ts:111`) is typed as `AssertionType`. Adding `"emitted"` to `allAssertionTypes` automatically extends this union. The collector receives `assertion_type: "emitted"` and `assertion_type_value: "payment:complete"` — no schema changes needed, but the collector backend should be updated to recognize the new type.

## Acceptance Criteria

### Phase 1: Custom Event as Trigger

- [ ] `fs-trigger="event:eventName"` registers a document-level listener for `eventName`
- [ ] When the event fires, elements with matching `fs-trigger` are processed through `createElementProcessor` and `enqueueAssertions`
- [ ] `detail-matches` modifier on trigger value gates assertion creation: `fs-trigger="event:cart-updated[detail-matches=action:increment]"` only triggers when `event.detail.action === "increment"`
- [ ] Unmatched `detail-matches` skips the element entirely (no assertion created)
- [ ] New elements added to DOM with `fs-trigger="event:*"` register listeners for new event names via MutationObserver
- [ ] Document-level listeners cleaned up on agent teardown
- [ ] Re-trigger on pending assertion records `attempts[]` timestamp
- [ ] Existing DOM assertion types (`added`, `removed`, `updated`, `visible`, `hidden`, `loaded`, `stable`) work normally when triggered by custom events
- [ ] `detail-matches` with primitive `event.detail` checks `String(event.detail)` equality

### Phase 2: Custom Event as Assertion Type

- [ ] `fs-assert-emitted="eventName"` creates a pending assertion resolved by a matching CustomEvent on `document`
- [ ] `detail-matches` modifier on emitted type value gates resolution: event fires but detail doesn't match leaves assertion pending (R10)
- [ ] `detail-matches` supports regex matching on values (consistent with `text-matches`)
- [ ] Shared listener pool: trigger and emitted assertions for the same event name use one document listener (R9)
- [ ] `emitted` + `fs-assert-mpa` warns and ignores MPA mode (R12)
- [ ] Conditional assertions work: `fs-assert-emitted-success="eventName"` paired with `fs-assert-added-error=".error"` + `fs-assert-grouped` resolves first-wins
- [ ] GC sweep and SLA timeout correctly fail unresolved emitted assertions
- [ ] Page unload correctly fails stale emitted assertions
- [ ] Synchronous dispatch limitation is documented in `llms-full.txt` and `CLAUDE.md`

## Dependencies & Risks

- **No external dependencies.** Both phases use only `document.addEventListener` / `removeEventListener` and `querySelectorAll`.
- **Phase 2 depends on Phase 1** — the shared listener registry and `detail-matches` parsing are built in Phase 1.
- **Collector backend impact:** The collector must handle `assertion_type: "emitted"`. If the backend rejects unknown types, Phase 2 assertions will fail to report. Coordinate with the collector repo.
- **Risk: event name typos.** Unlike CSS selectors, custom event names have no DOM-level validation. A typo in the event name means the listener registers but never fires. Consider a debug-mode warning for registered listeners that never fire within a configurable window (out of scope for this plan, flagged for future).
- **Risk: high-frequency events.** Custom events like `scroll-position-changed` could fire hundreds of times per second. The handler does a `querySelectorAll` on each fire. Mitigation: the selector `[fs-trigger^="event:eventName"]` is fast (attribute prefix match), and the result set is typically small. If this becomes a problem, cache the element set and invalidate on mutation.

## Sources & References

- Origin brainstorm: `docs/brainstorms/2026-03-28-custom-event-assertions-requirements.md`
- Element processor (parsing, creation): `src/processors/elements.ts`
- Assertion manager (enqueue, settle, event handling): `src/assertions/manager.ts`
- Agent init and event listener setup: `src/index.ts`
- Type system and config: `src/types.ts`, `src/config.ts`
- DOM resolvers (elementResolver, immediateResolver, documentResolver): `src/resolvers/dom.ts`
- Event resolver (loaded type): `src/resolvers/event.ts`
