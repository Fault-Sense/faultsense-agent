---
title: "feat: Expanded Trigger Set (hover, keydown, focus, input)"
type: feat
status: active
date: 2026-03-28
origin: docs/brainstorms/2026-03-28-expanded-trigger-set-requirements.md
---

# feat: Expanded Trigger Set

## Overview

Add four new trigger types to the Faultsense agent: `hover` (mouseenter), `keydown` with key filtering (colon syntax), `focus` (focusin), and `input`. The event listener infrastructure already handles arbitrary DOM events -- the commented-out events in `supportedEvents` (`src/config.ts:72-80`) confirm this was anticipated. The work is primarily trigger aliasing, trigger parsing with key filtering, fixing a stale re-trigger bug, and wiring the `Event` object through to `isProcessableElement`.

## Problem Statement / Motivation

The current trigger set (`click`, `dblclick`, `change`, `blur`, `submit`, `load`, `error`, `mount`, `unmount`, `invariant`) covers primary user actions but misses common interaction patterns:

- **Hover interactions** -- tooltips, preview panels, dropdown menus triggered by mouse hover have no assertion trigger today.
- **Keyboard shortcuts** -- `Escape` to close a modal, `Ctrl+S` to save, `Enter` to submit inline edits. These are high-value correctness assertions with no current path.
- **Focus interactions** -- autocomplete dropdowns on focus, contextual help panels, skip-to-content links.
- **Form field typing** -- character counters, live validation, search-as-you-type, format masking. `change` only fires on blur, missing the continuous feedback loop.

Additionally, higher-frequency triggers (`input`, unfiltered `keydown`) expose a latent bug in the re-trigger path where pending assertions are never re-evaluated, causing them to go stale and eventually fail via GC.

## Proposed Solution

### Step 1: Fix stale re-trigger resolution (prerequisite, independent bug fix)

The re-trigger path in `src/assertions/manager.ts:107-110` only records an attempt timestamp when an event fires on an element with a pending assertion. It never re-evaluates whether the assertion condition is now met. This causes assertions to go stale, particularly with high-frequency triggers.

**File:** `src/assertions/manager.ts`

In `enqueueAssertions`, the pending re-trigger branch (line 107-110):

```ts
} else if (existingAssertion && isAssertionPending(existingAssertion)) {
  if (!existingAssertion.attempts) existingAssertion.attempts = [];
  existingAssertion.attempts.push(Date.now());
}
```

Add a `checkImmediateResolved` call after recording the attempt:

```ts
} else if (existingAssertion && isAssertionPending(existingAssertion)) {
  if (!existingAssertion.attempts) existingAssertion.attempts = [];
  existingAssertion.attempts.push(Date.now());
  checkImmediateResolved(existingAssertion);
}
```

**File:** `src/assertions/manager.ts`

Extend `checkImmediateResolved` (lines 51-80) to handle ALL DOM assertion types, not just `visible`/`hidden`. The current implementation only checks two types:

```ts
// Current (lines 59-63) -- only visible/hidden
if (assertion.type === "visible" || assertion.type === "hidden") {
  const documentResults = immediateResolver([assertion], config);
  ...
}
```

Replace with a check against all DOM assertion types using the existing `domAssertions` array (already imported at `config.ts:18`):

```ts
const checkImmediateResolved = (assertion: Assertion): void => {
  Promise.resolve().then(() => {
    if (isAssertionPending(assertion)) {
      let deferredResult: CompletedAssertion | null = null;

      if (domAssertions.includes(assertion.type)) {
        const documentResults = immediateResolver([assertion], config);
        if (documentResults.length > 0) {
          deferredResult = documentResults[0];
        }
      }

      if (assertion.type === "route") {
        const routeResults = routeResolver([assertion], config);
        if (routeResults.length > 0) {
          deferredResult = routeResults[0];
        }
      }

      if (deferredResult) {
        settle([deferredResult]);
      }
    }
  });
};
```

The `domAssertions` import already exists at `manager.ts` line 21 (via `config.ts:18`). `immediateResolver` is already imported at line 17.

**Performance:** One `document.querySelector` + modifier evaluation per re-trigger, deferred to microtask. At ~30 events/sec for `input`, this is negligible for a single assertion check. The microtask batching means multiple re-triggers in the same frame coalesce naturally.

### Step 2: Create trigger parsing utility

**New file:** `src/utils/triggers.ts`

Three pure functions for parsing trigger values and matching key filters:

```ts
export interface ParsedTrigger {
  base: string;       // "keydown", "hover", "click", etc.
  filter?: string;    // "Escape", "ctrl+s", undefined
}

export function parseTrigger(raw: string): ParsedTrigger {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) return { base: raw };
  return {
    base: raw.substring(0, colonIdx),
    filter: raw.substring(colonIdx + 1),
  };
}

export interface KeyFilter {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export function parseKeyFilter(filter: string): KeyFilter {
  const parts = filter.split("+");
  const key = parts.pop()!;
  return {
    key,
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    meta: parts.includes("meta"),
  };
}

export function matchesKeyFilter(event: KeyboardEvent, filter: KeyFilter): boolean {
  const keyMatch = event.key.toLowerCase() === filter.key.toLowerCase();
  return (
    keyMatch &&
    event.ctrlKey === filter.ctrl &&
    event.shiftKey === filter.shift &&
    event.altKey === filter.alt &&
    event.metaKey === filter.meta
  );
}
```

Design notes:
- `parseTrigger` is general-purpose -- the colon syntax could extend to other triggers in the future.
- Key matching is case-insensitive for the key itself. Modifier matching is strict (exact match on ctrlKey/shiftKey/altKey/metaKey).
- The full trigger filter string (e.g., `keydown:Escape`) is preserved as the assertion's `trigger` field -- it flows through `parseAssertions` -> `processDetails` in `src/processors/elements.ts:234-241` without modification since `processDetails` reads the raw attribute value.

### Step 3: Config changes

**File:** `src/config.ts`

3a. Add new DOM events to `supportedEvents` (lines 64-81). Uncomment and add the four new events:

```ts
export const supportedEvents = [
  "click",
  "dblclick",
  "change",
  "blur",
  "submit",
  "load",
  "error",
  "mouseenter",  // hover trigger
  "focusin",     // focus trigger
  "input",
  "keydown",
];
```

3b. Add `triggerEventMap` as single source of truth for trigger-to-event aliasing. Replace the manually-maintained `eventTriggerAliases` (lines 83-86):

```ts
/** Maps fs-trigger attribute values to actual DOM event names */
export const triggerEventMap: Record<string, string> = {
  hover: "mouseenter",
  focus: "focusin",
  error: "load",   // existing alias
};

// Derived: invert triggerEventMap for runtime lookup in handleEvent
export const eventTriggerAliases: Record<string, string[]> = {};
for (const [trigger, event] of Object.entries(triggerEventMap)) {
  if (!eventTriggerAliases[event]) eventTriggerAliases[event] = [event];
  eventTriggerAliases[event].push(trigger);
}
```

3c. Update `supportedTriggers` (line 88) to include the new developer-facing trigger names:

```ts
export const supportedTriggers = [
  "mount", "unmount", "invariant",
  "hover", "focus",
  ...supportedEvents,
];
```

Note: `hover` and `focus` are the developer-facing aliases. `mouseenter`, `focusin`, `input`, and `keydown` are in `supportedEvents` and are also valid trigger values (direct use).

### Step 4: Update `isProcessableElement`

**File:** `src/processors/elements.ts`

The current implementation (lines 211-221) does an exact string match against the trigger value:

```ts
function isProcessableElement(
  element: HTMLElement,
  triggers: string[]
): boolean {
  if (element.hasAttribute(assertionTriggerAttr)) {
    return triggers.includes(
      element.getAttribute(assertionTriggerAttr) as string
    );
  }
  return false;
}
```

This fails for `keydown:Escape` because `triggers` contains `["keydown"]`, not `["keydown:Escape"]`.

Update to parse the trigger base and optionally check key filters:

```ts
import { parseTrigger, parseKeyFilter, matchesKeyFilter } from "../utils/triggers";

function isProcessableElement(
  element: HTMLElement,
  triggers: string[],
  event?: Event
): boolean {
  const raw = element.getAttribute(assertionTriggerAttr);
  if (!raw) return false;
  const { base, filter } = parseTrigger(raw);
  if (!triggers.includes(base)) return false;

  // Key filter check: reject if the event doesn't match the specified key
  if (filter && event instanceof KeyboardEvent) {
    return matchesKeyFilter(event, parseKeyFilter(filter));
  }

  return true;
}
```

The `event` parameter is optional -- only passed in event mode (from `handleEvent`). Mount/invariant/mutation processing does not pass an event.

Update all call sites within `processElements` (lines 182, 191) to pass the event. This requires `processElements` to accept an optional `Event` parameter:

```ts
export function processElements(
  targets: HTMLElement[],
  triggers: string[],
  eventMode: boolean = false,
  event?: Event
): Assertion[] {
```

And pass it through to `isProcessableElement`:

- Line 182: `if (isProcessableElement(target, triggers, event))`
- Line 191: `if (isProcessableElement(element, triggers, event))`

### Step 5: Wire `Event` param through event processing chain

The `Event` object must flow from `handleEvent` through `createElementProcessor` to `processElements` to `isProcessableElement`.

**File:** `src/processors/elements.ts`

Update `createElementProcessor` (line 164) to accept and forward an optional `Event`:

```ts
export function createElementProcessor(
  triggers: string[],
  eventMode: boolean = false,
  event?: Event
): ElementProcessor {
  return function (targets: HTMLElement[]): Assertion[] {
    return processElements(targets, triggers, eventMode, event);
  };
}
```

**File:** `src/assertions/manager.ts`

Update `handleEvent` (line 162) to pass the event to `createElementProcessor`:

```ts
const handleEvent = (event: Event): void => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const triggers = eventTriggerAliases[event.type] || [event.type];
  const elementProcessor = createElementProcessor(triggers, true, event);
  const created = eventProcessor(event, elementProcessor);
  enqueueAssertions(created);
  ...
};
```

No changes needed to `src/processors/events.ts` -- it already passes the event target to the processor, and the event is captured in the closure.

No changes needed to `src/index.ts` -- the cleanup function already iterates `supportedEvents` to remove listeners, so new events are automatically covered.

### Step 6: Tests

**New file:** `src/utils/__tests__/triggers.test.ts`

Unit tests for the parsing utility:

- `parseTrigger("click")` returns `{ base: "click" }` (no filter)
- `parseTrigger("keydown:Escape")` returns `{ base: "keydown", filter: "Escape" }`
- `parseTrigger("keydown:ctrl+s")` returns `{ base: "keydown", filter: "ctrl+s" }`
- `parseTrigger("keydown:ctrl+shift+s")` returns `{ base: "keydown", filter: "ctrl+shift+s" }`
- `parseKeyFilter("Escape")` returns `{ key: "Escape", ctrl: false, shift: false, alt: false, meta: false }`
- `parseKeyFilter("ctrl+s")` returns `{ key: "s", ctrl: true, shift: false, alt: false, meta: false }`
- `parseKeyFilter("ctrl+shift+s")` returns `{ key: "s", ctrl: true, shift: true, alt: false, meta: false }`
- `matchesKeyFilter` with matching KeyboardEvent returns `true`
- `matchesKeyFilter` with wrong key returns `false`
- `matchesKeyFilter` with missing modifier returns `false`
- `matchesKeyFilter` with extra modifier returns `false` (strict matching)
- Case-insensitive key matching: `keydown:escape` matches `event.key = "Escape"`

**Existing test files to extend:**

- `src/processors/__tests__/elements.test.ts` -- add tests for `isProcessableElement` with filtered triggers:
  - Element with `fs-trigger="keydown:Escape"` is processable when triggers include `"keydown"` and event is `KeyboardEvent({ key: "Escape" })`
  - Element with `fs-trigger="keydown:Escape"` is NOT processable when event is `KeyboardEvent({ key: "Enter" })`
  - Element with `fs-trigger="hover"` is processable when triggers include `"hover"` (no event needed for alias matching)
  - Element with `fs-trigger="focus"` is processable when triggers include `"focus"`

- `src/assertions/__tests__/manager.test.ts` -- add integration tests:
  - Re-trigger re-evaluation: pending assertion resolves on second event when condition is now met (the prerequisite bug fix)
  - `hover` trigger fires assertion on `mouseenter` event
  - `focus` trigger fires assertion on `focusin` event
  - `keydown:Escape` creates assertion only when Escape is pressed, ignores other keys
  - `keydown:ctrl+s` creates assertion only when Ctrl+S is pressed
  - `input` trigger creates assertion on input event, re-trigger re-evaluates pending assertion
  - Full trigger value preserved: assertion created from `fs-trigger="keydown:Escape"` has `trigger === "keydown:Escape"`

- Config tests (if they exist) -- verify:
  - `eventTriggerAliases` derived correctly: `mouseenter` maps to `["mouseenter", "hover"]`, `focusin` maps to `["focusin", "focus"]`
  - `supportedTriggers` includes `hover`, `focus`, `keydown`, `input`, `mouseenter`, `focusin`

## Technical Considerations

### Trigger aliasing derivation

The `triggerEventMap` -> `eventTriggerAliases` derivation ensures a single source of truth. Currently `eventTriggerAliases` is manually maintained (`config.ts:84-86`). The derived approach means adding a new alias only requires one entry in `triggerEventMap`.

The derivation loop initializes `eventTriggerAliases[event] = [event]` before pushing the alias. This ensures the DOM event name itself is always in the array (e.g., `mouseenter` maps to `["mouseenter", "hover"]`), so `isProcessableElement` can match both `fs-trigger="hover"` and `fs-trigger="mouseenter"`.

### `mouseenter` in capture phase

The agent registers all event listeners in capture phase on `document` (`src/index.ts:37-43`). `mouseenter` does not bubble, but capture phase on `document` receives non-bubbling events. MDN confirms this behavior. The brainstorm flags cross-browser verification (Safari/Firefox) as a test item.

### `focusin` vs `focus`

`focus` does not bubble, `focusin` does. Since the agent uses capture phase, either would technically work. However, `focusin` is the standard choice for delegated focus handling and is more predictable. The alias `focus` -> `focusin` gives developers the intuitive name.

### No agent-level debouncing

The re-trigger mechanism is the natural debounce for `input` and unfiltered `keydown`. The first event creates the assertion; subsequent events on the same element hit the re-trigger path (record attempt + re-evaluate via `checkImmediateResolved`). No new assertions pile up. Each re-trigger runs one `document.querySelector` + modifier evaluation, deferred to microtask.

### Full trigger value on assertion

`fs-trigger="keydown:Escape"` produces `assertion.trigger = "keydown:Escape"`. This happens naturally because `processDetails` in `src/processors/elements.ts:234-241` reads the raw attribute value and stores it as `metadata.details["trigger"]`, which flows into `createAssertions` at line 357: `trigger: metadata.details.trigger`. No change needed for storage -- the full string is already preserved.

### `ElementProcessor` type signature unchanged

The `ElementProcessor` type (`src/types.ts:14`) is `(elements: HTMLElement[]) => Assertion[]`. The `Event` parameter is captured in the closure created by `createElementProcessor`, so the type signature does not change. This avoids cascading type changes through `MutationProcessor`, `MutationHandler`, etc.

## Acceptance Criteria

1. `fs-trigger="hover"` creates an assertion when `mouseenter` fires on the element.
2. `fs-trigger="focus"` creates an assertion when `focusin` fires on the element.
3. `fs-trigger="input"` creates an assertion when `input` fires on the element.
4. `fs-trigger="keydown"` (unfiltered) creates an assertion on any `keydown` event.
5. `fs-trigger="keydown:Escape"` creates an assertion only when `event.key === "Escape"`.
6. `fs-trigger="keydown:ctrl+s"` creates an assertion only when Ctrl+S is pressed (strict modifier matching).
7. Full trigger value (e.g., `keydown:Escape`) is stored as `assertion.trigger` and sent to collector.
8. Re-triggering a pending assertion re-evaluates its condition via `checkImmediateResolved` (all DOM types, not just visible/hidden).
9. `eventTriggerAliases` is derived from `triggerEventMap`, not manually maintained.
10. Cleanup function removes listeners for all new event types (automatic via `supportedEvents` iteration).
11. All existing tests continue to pass.

## Dependencies & Risks

- **No external dependencies.** All changes are internal to the agent.
- **Risk: `mouseenter` capture phase cross-browser.** MDN specifies capture phase receives non-bubbling events, but Safari has historically had quirks. Mitigated by testing in Safari/Firefox during QA.
- **Risk: Breaking existing `error` alias.** The `error: ["load"]` alias moves into `triggerEventMap` and is derived. Must verify the derived output matches the current behavior: `eventTriggerAliases["load"] = ["load", "error"]`. The current manual value is `error: ["load"]` which maps event type `error` to triggers `["load"]`. The new derivation maps `triggerEventMap.error = "load"` to `eventTriggerAliases["load"] = ["load", "error"]`. In `handleEvent`, when a `load` event fires, `eventTriggerAliases["load"]` returns `["load", "error"]`, meaning elements with `fs-trigger="load"` or `fs-trigger="error"` are both processed. This matches current behavior.
- **Risk: Performance of `checkImmediateResolved` on every re-trigger.** One querySelector per re-trigger, deferred to microtask. At typical input rates (30 events/sec), this is negligible. The microtask coalescing prevents redundant checks within the same frame.

## Sources & References

- Brainstorm: `docs/brainstorms/2026-03-28-expanded-trigger-set-requirements.md`
- Config (supportedEvents, aliases): `src/config.ts:64-88`
- Manager (handleEvent, enqueueAssertions, checkImmediateResolved): `src/assertions/manager.ts:51-80, 107-110, 156-171`
- Element processor (isProcessableElement, createElementProcessor): `src/processors/elements.ts:164-221`
- Event processor: `src/processors/events.ts:1-7`
- Init (event listener registration, cleanup): `src/index.ts:36-44, 84-92`
- Types (Assertion.trigger field): `src/types.ts:78`
