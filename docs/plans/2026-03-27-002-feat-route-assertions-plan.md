---
title: "feat: Add route assertions for URL pathname matching"
type: feat
status: completed
date: 2026-03-27
origin: docs/brainstorms/2026-03-26-route-assertions-requirements.md
---

# feat: Add route assertions for URL pathname matching

## Overview

Add `fs-assert-route="/pattern"` as a new assertion type that matches URL pathnames using anchored regex. Route assertions participate fully in the conditional system (condition keys, sibling groups, `fs-assert-grouped`) and resolve via a dedicated route resolver triggered by History API interception (SPA) or page load evaluation (MPA).

This closes the last major gap between Faultsense and e2e test coverage: navigation correctness — the most commonly asserted thing in e2e tests — has zero Faultsense coverage today.

## Problem Statement

Navigation fails silently in production: `router.push` swallowed by error boundaries, redirects dropping query params, OAuth callbacks landing on wrong pages. Every e2e test asserts `expect(page.url()).toContain('/dashboard')`, but Faultsense has no URL equivalent. Route assertions fill this gap using the same declarative HTML attribute model (see origin: `docs/brainstorms/2026-03-26-route-assertions-requirements.md`).

## Proposed Solution

A new assertion type `"route"` with its own resolver and navigation interceptor. Route assertions are **not** DOM assertions — they resolve by matching `window.location.pathname` against an anchored regex pattern, not by querying the DOM. The `domAssertions` gate in existing DOM resolvers naturally excludes them.

### Architecture

```
Trigger (click/submit/mount) → Element Processor → Route Assertion created
                                                          ↓
                              Navigation Interceptor ← pushState/replaceState/popstate
                                      ↓
                              Route Resolver → settle()
```

**New files:**
- `src/interceptors/navigation.ts` — patches `history.pushState`/`replaceState`, listens `popstate`
- `src/resolvers/route.ts` — matches pending route assertions against `location.pathname`

**Modified files:**
- `src/types.ts:59-65` — add `"route"` to `AssertionType` union
- `src/config.ts:17-30, 38-43` — add `routeAssertions` array, extend `reservedConditionKeys`, extend `supportedAssertions.types`
- `src/processors/elements.ts:134` — extend `parseDynamicTypes` to iterate route types for conditional parsing
- `src/assertions/manager.ts:50-71, 195-206` — add route to `checkImmediateResolved`, wire route resolver into `checkAssertions`, add `handleNavigation` method
- `src/assertions/timeout.ts:24-39` — add `case "route"` to SLA failure message
- `src/processors/oob.ts:9-11` — warn on `fs-assert-oob-route` (not supported in v1)
- `src/index.ts:32` — wire navigation interceptor at init
- `tests/assertions/route.test.ts` — new test file

### Implementation Phases

#### Phase 1: Type System and Config Registration

Extend the type system and config to recognize `"route"` as a valid assertion type.

**`src/types.ts:59-65`** — Add `"route"` to the `AssertionType` union:

```typescript
export type AssertionType =
  | "added"
  | "removed"
  | "updated"
  | "visible"
  | "hidden"
  | "loaded"
  | "route";
```

**`src/config.ts`** — Create a separate `routeAssertions` array (not merged into `domAssertions`) and wire it into the config:

```typescript
export const routeAssertions = ["route"];

// All assertion types for condition key parsing (parseDynamicTypes iterates this)
export const allAssertionTypes = [...domAssertions, ...routeAssertions];

// Reserved condition keys
export const reservedConditionKeys = [...allAssertionTypes, "oob"];

// supportedAssertions.types includes route for attribute parsing
export const supportedAssertions = {
  details: ["assert", "trigger"],
  types: [...allAssertionTypes],
  modifiers: ["mpa", "timeout", "grouped"],
};
```

**Key decision:** `domAssertions` stays unchanged. DOM resolvers continue to gate on `domAssertions.includes()` — route assertions are naturally excluded. `allAssertionTypes` is the superset used only for parsing and validation (see origin: key decision "Not in domAssertions").

**`src/assertions/timeout.ts:24-39`** — Add route case to the SLA failure message switch:

```typescript
case "route":
  return `Expected URL to match ${assertion.typeValue} within ${timeout}ms.`;
```

- [ ] Add `"route"` to `AssertionType` union in `types.ts`
- [ ] Create `routeAssertions`, `allAssertionTypes`, and `supportedModifiersByType` in `config.ts`
- [ ] Update `reservedConditionKeys` to include route
- [ ] Update `supportedAssertions.types` to include route
- [ ] Add `case "route"` to `getFailureReasonForAssertion` in `timeout.ts`

#### Phase 2: Element Processor — Parsing Route Attributes

Extend `parseDynamicTypes` to recognize route types for conditional parsing (`fs-assert-route-success`, `fs-assert-route-error`). Standard route attributes (`fs-assert-route="/dashboard"`) are already handled by `processTypes` since `"route"` is now in `supportedAssertions.types`.

**`src/processors/elements.ts:134`** — Change the `parseDynamicTypes` loop from `domAssertions` to `allAssertionTypes`:

```typescript
// Before:
for (const domType of domAssertions) {
// After:
for (const domType of allAssertionTypes) {
```

This is a one-line change. The `parseTypeValue` function already handles the value generically — `/dashboard[search=code=]` parses to `{ selector: "/dashboard", modifiers: { search: "code=" } }`.

**Modifier validation:** Add a type-to-supported-modifiers map in `config.ts` so modifier validation is generic and scales as new types are added:

```typescript
// config.ts
export const supportedModifiersByType: Record<string, string[]> = {
  added: ["text-matches", "classlist"],
  removed: ["text-matches", "classlist"],
  updated: ["text-matches", "classlist"],
  visible: ["text-matches", "classlist"],
  hidden: ["text-matches", "classlist"],
  loaded: [],
  route: ["search", "hash"],
};
```

Then in `parseAssertions()`, validate generically after parsing modifiers:

```typescript
const allowed = supportedModifiersByType[type] || [];
for (const mod of Object.keys(modifiers)) {
  if (!allowed.includes(mod)) {
    console.warn(`[Faultsense]: Modifier "${mod}" does not apply to "${type}" assertions. Found on "${assertionKey}".`);
  }
}
```

This replaces any type-specific modifier checks with a single generic validation pass. Any attribute-check modifiers (bare `[attr=value]` brackets) are not affected — those are stored differently from named modifiers.

**Regex validation:** Validate the route pattern at parse time. A malformed regex like `/users/[` would throw `SyntaxError` in the resolver and could break evaluation of all pending route assertions. Catch it early:

```typescript
if (type === "route" && typeValue) {
  try {
    new RegExp(`^${typeValue}$`);
  } catch (e) {
    console.warn(`[Faultsense]: Invalid route pattern "${typeValue}" on "${assertionKey}". Skipping.`);
    // Skip this assertion type
    continue;
  }
}
```

- [ ] Change `parseDynamicTypes` loop to iterate `allAssertionTypes` instead of `domAssertions`
- [ ] Add `supportedModifiersByType` map in `config.ts`
- [ ] Add generic modifier validation in `parseAssertions()` using the map
- [ ] Add regex validation at parse time with console warning on invalid patterns

#### Phase 3: Route Resolver

Create `src/resolvers/route.ts` — a resolver that matches pending route assertions against `window.location`.

The resolver follows the `AssertionCollectionResolver` signature (`types.ts:49-52`), matching `immediateResolver` and `documentResolver`.

```typescript
// src/resolvers/route.ts
import { Assertion, CompletedAssertion, Configuration } from "../types";
import { completeAssertion } from "../assertions/assertion";

export function routeResolver(
  activeAssertions: Assertion[],
  config: Configuration
): CompletedAssertion[] {
  const completed: CompletedAssertion[] = [];

  for (const assertion of activeAssertions) {
    if (assertion.type !== "route") continue;
    if (assertion.endTime) continue; // already completed

    const pattern = new RegExp(`^${assertion.typeValue}$`);
    let matches = pattern.test(window.location.pathname);

    // Check optional search modifier
    if (matches && assertion.modifiers["search"]) {
      const searchPattern = new RegExp(assertion.modifiers["search"]);
      matches = searchPattern.test(window.location.search);
    }

    // Check optional hash modifier
    if (matches && assertion.modifiers["hash"]) {
      const hashPattern = new RegExp(assertion.modifiers["hash"]);
      matches = hashPattern.test(window.location.hash);
    }

    if (matches) {
      const result = completeAssertion(assertion, true, "");
      if (result) completed.push(result);
    }
  }

  return completed;
}
```

**Design notes:**
- `[search=pattern]` matches against raw `location.search` (includes `?`). This is what the browser API returns — no hidden transformation (see origin: outstanding question).
- `[hash=pattern]` matches against raw `location.hash` (includes `#`). Same principle.
- Regex is anchored (`^pattern$`) for pathname but **not** for search/hash modifiers — substring matching is more useful there (e.g., `[search=code=]` matches `?code=abc123`).
- The resolver only reports **passes**. Failures are handled by the timeout/GC system, not the resolver (same as DOM resolvers).

- [ ] Create `src/resolvers/route.ts` with `routeResolver` function
- [ ] Pathname matching: anchored regex (`^pattern$`)
- [ ] Search/hash modifier matching: unanchored regex (substring)
- [ ] Only report passes — failures handled by timeout/GC

#### Phase 4: Navigation Interceptor

Create `src/interceptors/navigation.ts` — patches `history.pushState`/`replaceState` and listens for `popstate` to detect SPA navigation.

```typescript
// src/interceptors/navigation.ts
export type NavigationHandler = () => void;

export function interceptNavigation(handler: NavigationHandler): void {
  // Patch pushState
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState(...args);
    handler();
  };

  // Patch replaceState
  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    originalReplaceState(...args);
    handler();
  };

  // Listen for popstate (browser back/forward)
  window.addEventListener("popstate", () => handler());
}
```

**Design decisions (see origin):**
- **Always-on from init** — mirrors MutationObserver. No lazy initialization, no race window.
- **No cleanup/restore** — follows the error interceptor precedent (`src/interceptors/error.ts` also doesn't restore originals). The patched methods chain correctly.
- Handler fires **after** the state change so `location.pathname` is already updated when the route resolver runs.

- [ ] Create `src/interceptors/navigation.ts`
- [ ] Patch `history.pushState` — call original then handler
- [ ] Patch `history.replaceState` — call original then handler
- [ ] Listen for `popstate` event
- [ ] Handler fires after state change (location already updated)

#### Phase 5: Manager Integration

Wire the route resolver and navigation interceptor into the assertion manager.

**`src/assertions/manager.ts`** — Three integration points:

**5a. `handleNavigation` method** (new, after `handleGlobalError` at line 193):

```typescript
const handleNavigation = (): void => {
  const pending = getPendingAssertions(activeAssertions);
  settle(routeResolver(pending, config));
};
```

Follows the `handleGlobalError` pattern — interceptor calls a manager method, manager runs resolver, feeds result to `settle()`. The route resolver filters for `type === "route"` internally, so passing all pending assertions is fine.

**5b. `checkImmediateResolved` extension** (line 50-71):

Add route type check alongside visible/hidden:

```typescript
// After the visible/hidden block (line 58-63):
if (assertion.type === "route") {
  const routeResults = routeResolver([assertion], config);
  if (routeResults.length > 0) {
    deferredResult = routeResults[0];
  }
}
```

This handles the case where the URL already matches when the assertion is created (e.g., a `mount` trigger on a page that's already at the correct URL).

**5c. `checkAssertions` extension** (line 195-206):

Add route resolver call for MPA assertions loaded from storage:

```typescript
const checkAssertions = (): void => {
  const pendingAssertions = getPendingDomAssertions(activeAssertions);
  // ... existing DOM resolver calls ...

  // Route assertions loaded from storage (MPA)
  const pendingRouteAssertions = getPendingAssertions(activeAssertions);
  settle(routeResolver(pendingRouteAssertions, config));
};
```

**5d. Expose `handleNavigation`** in the return object (line 365-376).

- [ ] Add `handleNavigation` method to manager
- [ ] Extend `checkImmediateResolved` for route type
- [ ] Extend `checkAssertions` to call route resolver (MPA support)
- [ ] Expose `handleNavigation` in manager's return object

#### Phase 6: Init Wiring

**`src/index.ts:32`** — Wire navigation interceptor alongside error interceptor:

```typescript
import { interceptNavigation } from "./interceptors/navigation";
// ...
interceptErrors(assertionManager.handleGlobalError);
interceptNavigation(assertionManager.handleNavigation);
```

No cleanup needed for the navigation interceptor (follows error interceptor precedent).

- [ ] Import and call `interceptNavigation` in `init()`
- [ ] Wire to `assertionManager.handleNavigation`

#### Phase 7: OOB Warning

**`src/processors/oob.ts`** — Add a console warning if `fs-assert-oob-route` is detected. Route OOB is not supported in v1 (route assertions created after a parent pass would need to match the current URL immediately, which is a valid use case but deferred).

The simplest approach: check for `fs-assert-oob-route` attributes during the OOB scan and warn:

```typescript
// After the oobSelector query (line 21)
const routeOobElements = document.querySelectorAll(`[${oobPrefix}route]`);
if (routeOobElements.length > 0) {
  console.warn("[Faultsense]: fs-assert-oob-route is not supported. Route assertions cannot be triggered via OOB.");
}
```

- [ ] Add console warning for `fs-assert-oob-route` attributes

#### Phase 8: Tests

Create `tests/assertions/route.test.ts` following the existing test patterns (see `tests/assertions/added.test.ts`, `tests/assertions/invariant.test.ts`).

**Test cases:**

SPA resolution:
- [ ] Basic route match: click → `pushState("/dashboard")` → route assertion passes
- [ ] Route mismatch: click → `pushState("/wrong")` → assertion stays pending
- [ ] Dynamic segments: `fs-assert-route="/users/\d+"` matches `pushState("/users/42")`
- [ ] Anchored regex: `/dash` does NOT match `/dashboard`
- [ ] `replaceState` triggers resolution
- [ ] `popstate` (back/forward) triggers resolution
- [ ] Immediate resolution: route already matches current URL on creation

Modifiers:
- [ ] `[search=code=]` matches `?code=abc123`
- [ ] `[hash=section]` matches `#section-2`
- [ ] Search + hash combined: both must match
- [ ] DOM modifier on route produces console warning

Conditionals:
- [ ] `fs-assert-route-success="/dashboard"` + `fs-assert-route-error="/login"` — first to match wins, other dismissed
- [ ] Cross-type grouped: `fs-assert-route-success="/dashboard"` + `fs-assert-added-error=".error-msg"` — route passes, DOM sibling dismissed

MPA:
- [ ] Route assertion with `fs-assert-mpa="true"` persists to localStorage
- [ ] On page load, stored route assertion resolves against current pathname

Timeouts:
- [ ] SLA timeout: route doesn't match within `fs-assert-timeout` → fails with SLA message
- [ ] GC sweep: route assertion without timeout cleaned up after `gcInterval`

Validation:
- [ ] Invalid regex pattern produces console warning and is skipped
- [ ] Empty `typeValue` produces warning (route needs a pattern)

## System-Wide Impact

- **Interaction graph:** Trigger event → element processor creates route assertion → `enqueueAssertions` → `checkImmediateResolved` (may resolve immediately if URL matches) → navigation interceptor fires on pushState/replaceState/popstate → `handleNavigation` → `routeResolver` → `settle()` → sibling dismissal → collector dispatch → OOB scan (but route OOB blocked with warning)
- **Error propagation:** Invalid regex caught at parse time with console warning, assertion skipped. Route resolver catches no errors — patterns are pre-validated.
- **State lifecycle risks:** None beyond existing patterns. Route assertions use the same `activeAssertions` array, same timeout/GC/unload cleanup, same MPA persistence.
- **API surface parity:** Collector payload gets a new `assertion_type: "route"` value. Downstream collectors must handle this (coordination dependency with the collector project).

## Acceptance Criteria

- [ ] `fs-assert-route="/dashboard"` on a button resolves when SPA navigates to `/dashboard`
- [ ] Login form with `fs-assert-route-success="/dashboard"` + `fs-assert-added-error=".error-msg"` (grouped) correctly reports success or error outcome
- [ ] SPA navigation via `pushState` resolves pending route assertions
- [ ] MPA navigation with `fs-assert-mpa="true"` resolves on next page load
- [ ] Route assertions with `[search=code=]` match OAuth callback URLs
- [ ] DOM modifiers on route assertions produce a console warning
- [ ] Invalid regex patterns produce a console warning and are skipped
- [ ] `fs-assert-oob-route` produces a console warning
- [ ] All existing tests continue to pass (no regression)

## Scope Boundaries

- No `popstate` as a trigger type — separate future feature (see origin)
- No URL negation (`fs-assert-route-not`) in v1
- No route invariants in v1
- No `fs-assert-oob-route` in v1 (warning emitted)
- Hash and search matching are opt-in modifiers, not part of the default regex target
- No navigation interceptor cleanup/restore (follows error interceptor precedent)

## Dependencies & Prerequisites

- Conditional assertions system (condition keys, sibling groups, `fs-assert-grouped`) — **shipped**
- Invariant assertions — **shipped** (commit `9720aa1`)
- Collector must handle `assertion_type: "route"` — **coordination dependency** (separate project)

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-26-route-assertions-requirements.md](docs/brainstorms/2026-03-26-route-assertions-requirements.md) — key decisions carried forward: anchored regex matching, always-on interceptor, not in `domAssertions`, console warning on invalid modifiers

### Internal References

- Type system: `src/types.ts:59-65` (AssertionType union)
- Config registry: `src/config.ts:17-30` (domAssertions, reservedConditionKeys)
- Element processor: `src/processors/elements.ts:126-159` (parseDynamicTypes)
- Manager orchestration: `src/assertions/manager.ts:50-71, 147-206` (checkImmediateResolved, handleEvent, checkAssertions)
- Error interceptor pattern: `src/interceptors/error.ts` (monkey-patch + handler callback)
- OOB processor: `src/processors/oob.ts:9-11` (oobSelector construction)
- Timeout messages: `src/assertions/timeout.ts:24-39` (type-specific failure reasons)
- Init wiring: `src/index.ts:30-32` (interceptor setup)

### Institutional Learnings

- **Extend the pipeline, don't build alongside it.** The invariant feature shrunk from ~60 lines to ~25 when integrated into existing resolvers instead of a parallel path. Route follows this: one resolver, wired into existing `settle()` flow. (from `docs/solutions/logic-errors/assertion-pipeline-extension-ui-conditional-and-invariant-triggers.md`)
- **OOB assertions must resolve actual `activeAssertions`, not freshly-created objects.** After `enqueueAssertions`, look up from `activeAssertions` by key. (same source)
- **Dismissed siblings must be restored on retry.** When retrying a conditional, `enqueueAssertions` also retries all siblings via `getSiblingGroup`. (from `docs/solutions/logic-errors/gc-timeout-refactor-and-instrumentation-patterns.md`)
- **Event ordering matters for instrumentation.** The navigation handler fires after the state change so `location.pathname` is already updated. (same source)
