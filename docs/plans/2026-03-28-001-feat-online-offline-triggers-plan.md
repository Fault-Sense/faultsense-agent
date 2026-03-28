---
title: "feat: Online/Offline Network State Triggers"
type: feat
status: completed
date: 2026-03-28
origin: docs/brainstorms/2026-03-28-context-signals-requirements.md
---

# feat: Online/Offline Network State Triggers

Add `fs-trigger="online"` and `fs-trigger="offline"` so assertions can fire on browser connectivity state changes. Online fires on recovery transitions; offline fires when connectivity is lost. Offline elements are auto-processed on init if the page loads while already offline.

## Acceptance Criteria

- [ ] `fs-trigger="online"` creates assertions when `navigator.onLine` transitions to `true`
- [ ] `fs-trigger="offline"` creates assertions when `navigator.onLine` transitions to `false`
- [ ] On init, if `navigator.onLine === false`, all `fs-trigger="offline"` elements are immediately processed
- [ ] On init, `fs-trigger="online"` elements are NOT auto-processed (online is the default state)
- [ ] `"online"` and `"offline"` are in `supportedTriggers` but NOT in `supportedEvents`
- [ ] Window listeners are removed in the cleanup function returned by `init()`
- [ ] Existing element processor, assertion pipeline, and resolvers require no changes

## Context

- `online`/`offline` are `window`-level events, not `document`-level. They cannot go through the existing `handleEvent` path because it guards on `event.target instanceof HTMLElement` (manager.ts:158).
- The handler pattern mirrors how `mount`/`load`/`invariant` elements are processed on init (index.ts:71-78): `querySelectorAll` for matching trigger elements, then `processElements`.
- No debounce in v1. Deferred to a future iteration if rapid oscillation proves noisy in practice.

## MVP

### Step 1: Add to `supportedTriggers` in config.ts

Add `"online"` and `"offline"` to the `supportedTriggers` array (line 88). This allows the element processor to accept these trigger values during parsing. Do NOT add them to `supportedEvents` (line 64) -- they are window events, not document events.

**File:** `src/config.ts` (line 88)

```typescript
// Before:
export const supportedTriggers = ["mount", "unmount", "invariant", ...supportedEvents];

// After:
export const supportedTriggers = ["mount", "unmount", "invariant", "online", "offline", ...supportedEvents];
```

### Step 2: Register window listeners and initial state check in `init()`

Add two `window.addEventListener` calls for `online` and `offline` alongside the existing `pagehide`/`beforeunload` listeners (after line 56). Each handler queries the DOM for elements with the matching trigger and calls `processElements`. Also add an initial offline state check after the existing mount/load/invariant processing (after line 78).

**File:** `src/index.ts`

After the `beforeunload` listener (line 56), add the online/offline handlers:

```typescript
  // Network state change listeners
  const handleOnline = () => {
    const elements = document.querySelectorAll(
      `[${assertionTriggerAttr}="online"]`
    );
    assertionManager.processElements(Array.from(elements) as HTMLElement[], [
      "online",
    ]);
  };
  const handleOffline = () => {
    const elements = document.querySelectorAll(
      `[${assertionTriggerAttr}="offline"]`
    );
    assertionManager.processElements(Array.from(elements) as HTMLElement[], [
      "offline",
    ]);
  };
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
```

After the existing mount/load/invariant processing block (line 78), add the initial offline check:

```typescript
  // If the page loaded while offline, immediately process offline-triggered elements
  if (!navigator.onLine) {
    const offlineElements = document.querySelectorAll(
      `[${assertionTriggerAttr}="offline"]`
    );
    assertionManager.processElements(
      Array.from(offlineElements) as HTMLElement[],
      ["offline"]
    );
  }
```

### Step 3: Add cleanup for window listeners

In the cleanup function returned by `init()` (starting at line 84), add removal of the online/offline listeners. Also fix the existing cleanup bug where `pagehide`/`beforeunload` use `document.removeEventListener` instead of `window.removeEventListener`.

**File:** `src/index.ts` (inside the cleanup function)

```typescript
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("offline", handleOffline);
```

Note: The existing cleanup (lines 93-101) incorrectly uses `document.removeEventListener` for `pagehide` and `beforeunload`, but those were added with `window.addEventListener`. This should be fixed to `window.removeEventListener` in the same change.

### Step 4: Tests

**File:** `tests/online-offline.test.ts` (new file)

Test cases:
1. `fs-trigger="offline"` elements are processed when the `offline` event fires on `window`
2. `fs-trigger="online"` elements are processed when the `online` event fires on `window`
3. On init with `navigator.onLine === false`, offline elements are auto-processed
4. On init with `navigator.onLine === true`, online elements are NOT auto-processed
5. Cleanup function removes the window listeners (verify no processing after cleanup)
6. Online/offline triggers work with assertion types (`fs-assert-visible`, `fs-assert-added`, etc.)
7. Online/offline triggers work with conditional assertions and OOB

## Sources

- **Origin document:** docs/brainstorms/2026-03-28-context-signals-requirements.md (Part 1: Online/Offline Triggers)
