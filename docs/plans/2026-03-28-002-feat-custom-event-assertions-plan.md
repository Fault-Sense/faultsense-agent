---
title: "feat: Custom Event Assertions"
type: feat
status: completed
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

1. **Add a custom event listener registry** — a new module `src/listeners/custom-events.ts` that manages two data structures:
   - `listeners: Map<string, EventListener>` — one document-level listener per unique event name
   - `elements: Map<string, Set<HTMLElement>>` — registered elements per event name, populated by MutationObserver and init scan. Avoids `querySelectorAll` at event-fire time (O(1) lookup vs O(n) DOM walk).

   Exposes: `registerElement(eventName, element, handler)`, `deregisterElement(eventName, element)`, `getElements(eventName)`, `deregisterAll()`.

2. **Parse `event:` prefix in `isProcessableElement`** (`src/processors/elements.ts`). Currently `isProcessableElement` uses `parseTrigger` to extract a base trigger name. For custom event triggers, the base after `parseTrigger` is `event` with filter `cart-updated` (or `event` with filter `cart-updated[detail-matches=...]`). Two options:
   - Match `event` base and pass the full trigger string in the triggers array
   - Or: match the full `event:eventName` string. The cleanest approach: when calling `processElements` from the custom event handler, pass the full trigger values of registered elements in the triggers array. `isProcessableElement` already does `parseTrigger(raw)` and `triggers.includes(base)` — for `event:` triggers, the base is `event`, so include `"event"` in the triggers array.

3. **Parse custom event trigger value** — add `parseCustomEventTrigger(raw: string): { eventName: string, detailMatches?: Record<string, string> }` to a new `src/utils/triggers/custom-events.ts`. Strips the `event:` prefix, delegates bracket parsing to the existing `parseTypeValue` (`src/processors/elements.ts`), and converts `detail-matches` value to key:value pairs (shallow matching, comma-separated `key:value`).

4. **Register elements at init** (`src/index.ts`). After the existing mount/load/invariant scan, query for `[fs-trigger^="event:"]` elements. For each, parse the event name and register in the element Map. Register one document-level listener per unique event name.

5. **Register new elements on DOM mutation** (`src/index.ts` or `src/assertions/manager.ts`). When the MutationObserver detects added nodes with `fs-trigger^="event:"`, register them in the element Map. If the event name is new, also register a document-level listener. On element removal, deregister from the Map (optional — stale entries are harmless since `handleCustomEvent` checks the DOM).

6. **Cleanup on agent teardown** (`src/index.ts`). Call `deregisterAll()` to remove all document-level listeners and clear the element Map.

7. **Expose `handleCustomEvent` from the assertion manager** (`src/assertions/manager.ts`). Add a new method alongside `handleEvent`:

```typescript
const handleCustomEvent = (event: Event): void => {
  const eventName = event.type;
  const registered = customEventRegistry.getElements(eventName);
  if (!registered || registered.size === 0) return;

  const matching: HTMLElement[] = [];
  for (const el of registered) {
    // Skip elements no longer in the DOM (stale Map entries)
    if (!el.isConnected) continue;
    const triggerValue = el.getAttribute(assertionTriggerAttr)!;
    const parsed = parseCustomEventTrigger(triggerValue);
    if (parsed.detailMatches && !matchesDetail(event as CustomEvent, parsed.detailMatches)) {
      continue; // detail mismatch, skip
    }
    matching.push(el);
  }

  if (matching.length === 0) return;
  const triggers = [...new Set(matching.map(el => el.getAttribute(assertionTriggerAttr)!))];
  const elementProcessor = createElementProcessor(triggers);
  enqueueAssertions(elementProcessor(matching));
};
```

The key difference from the original plan: elements come from the Map lookup (O(1)) instead of `querySelectorAll` (O(n) DOM walk). Stale entries are filtered via `el.isConnected`.

8. **`detail-matches` matching function** — add `matchesDetail(event: CustomEvent, matchers: Record<string, string>): boolean` to `src/utils/triggers/custom-events.ts`. If `event.detail` is a primitive, match against `String(event.detail)`. If it's an object, check each `key:value` pair with shallow string equality against `String(event.detail[key])`.

9. **Update `isProcessableElement`** to accept `event:` prefix triggers. Since `parseTrigger("event:cart-updated")` returns `{ base: "event", filter: "cart-updated" }`, include the full raw trigger string in the triggers array when calling from `handleCustomEvent`. In `isProcessableElement`, when `base === "event"`, match the full raw trigger value against the triggers array instead of just the base.

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

### Map-based element registry (performance optimization)

The original approach called `querySelectorAll('[fs-trigger^="event:eventName"]')` on every custom event fire. At typical event frequencies (button clicks, API responses) this is fine (~0.3ms per call). But at high frequencies (60fps custom events like scroll-position-changed), this causes ~18ms/second of DOM walking — visible jank.

The Map-based registry (`Map<string, Set<HTMLElement>>`) eliminates this entirely. Elements are registered when they enter the DOM (via init scan or MutationObserver) and looked up in O(1) at event time. Stale entries (elements removed from DOM) are filtered via `el.isConnected` during the event handler. Memory overhead is negligible (~2-4KB for 10 events with 20 elements).

### `isProcessableElement` must accept custom event trigger strings

`isProcessableElement` uses `parseTrigger(raw)` to extract a base trigger name. For `event:cart-updated`, the base is `event` and the filter is `cart-updated`. When calling from `handleCustomEvent`, pass the full trigger strings of matching elements in the triggers array. In `isProcessableElement`, when `base === "event"`, match the full raw value against the triggers array instead of just the base. This avoids collisions between different custom event names.

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
- **Risk: high-frequency events.** Custom events like `scroll-position-changed` could fire hundreds of times per second. Mitigated by the Map-based element registry — event handler does an O(1) Map lookup instead of DOM walking. At 60fps with the Map, overhead is ~0.3ms/second (negligible).

## Sources & References

- Origin brainstorm: `docs/brainstorms/2026-03-28-custom-event-assertions-requirements.md`
- Element processor (parsing, creation): `src/processors/elements.ts`
- Assertion manager (enqueue, settle, event handling): `src/assertions/manager.ts`
- Agent init and event listener setup: `src/index.ts`
- Type system and config: `src/types.ts`, `src/config.ts`
- DOM resolvers (elementResolver, immediateResolver, documentResolver): `src/resolvers/dom.ts`
- Event resolver (loaded type): `src/resolvers/event.ts`
