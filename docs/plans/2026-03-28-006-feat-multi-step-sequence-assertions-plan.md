---
title: "feat: Multi-Step Sequence Assertions (fs-assert-after)"
type: feat
status: completed
date: 2026-03-28
origin: docs/brainstorms/2026-03-28-multi-step-sequential-assertions-requirements.md
---

# feat: Multi-Step Sequence Assertions

## Overview

Add `fs-assert-after` as a new assertion type that validates step ordering in multi-step user flows. When a trigger fires, the `after` assertion checks whether one or more referenced parent assertions have already passed. This produces an independent data point about sequence correctness alongside any DOM/route assertions on the same element.

## Problem Statement / Motivation

Faultsense can assert that individual user actions produce correct DOM outcomes, but cannot assert that actions happened in the correct order. Multi-step flows (checkout, onboarding wizards, auth-gated actions) need sequence verification. Without it, the collector has no signal when a user reaches step 3 without completing step 2 -- even if step 3's DOM assertion passes, the flow was violated.

The `after` type fills this gap by producing two independent data points from a single trigger: (1) was the sequence followed? (2) did the DOM respond correctly? Both signals reach the collector independently, so a sequence violation that still produces correct UI is a visible, actionable finding.

## Proposed Solution

### 1. Type System (`src/types.ts`)

Add `sequenceAssertionTypes` as a third category alongside `domAssertionTypes` and `routeAssertionTypes`. Update `allAssertionTypes` to include it.

**File:** `src/types.ts`, lines 60-63

```typescript
// Current:
export const domAssertionTypes = ["added", "removed", "updated", "visible", "hidden", "loaded", "stable"] as const;
export const routeAssertionTypes = ["route"] as const;
export const allAssertionTypes = [...domAssertionTypes, ...routeAssertionTypes] as const;
export type AssertionType = (typeof allAssertionTypes)[number];

// Change to:
export const domAssertionTypes = ["added", "removed", "updated", "visible", "hidden", "loaded", "stable"] as const;
export const routeAssertionTypes = ["route"] as const;
export const sequenceAssertionTypes = ["after"] as const;
export const allAssertionTypes = [...domAssertionTypes, ...routeAssertionTypes, ...sequenceAssertionTypes] as const;
export type AssertionType = (typeof allAssertionTypes)[number];
```

This automatically makes `"after"` a valid `AssertionType` and includes it in `allAssertionTypes`, which `processTypes` in `elements.ts` (line 244) iterates over to parse `fs-assert-{type}` attributes.

### 2. Config (`src/config.ts`)

Add `sequenceAssertions` array and `after` entry in `supportedModifiersByType`.

**File:** `src/config.ts`

After line 19 (`routeAssertions`), add:
```typescript
export const sequenceAssertions: string[] = [...sequenceAssertionTypes];
```

At line 29-38 (`supportedModifiersByType`), add the `after` entry with empty modifiers:
```typescript
export const supportedModifiersByType: Record<AssertionType, readonly string[]> = {
  // ... existing entries ...
  route: [],
  after: [],  // No DOM modifiers apply to sequence assertions
};
```

This is required because `Record<AssertionType, ...>` will produce a compile error if `after` is missing -- the existing pattern enforces exhaustiveness.

Also add `"after"` to `reservedConditionKeys` (line 25). This happens automatically since `reservedConditionKeys` spreads `allAssertionTypes`, but worth noting for awareness.

### 3. New Resolver (`src/resolvers/sequence.ts`)

Create a new file following the `routeResolver` pattern (`src/resolvers/route.ts`, lines 96-145). The resolver implements `AssertionCollectionResolver`.

```typescript
import { Assertion, CompletedAssertion, Configuration } from "../types";
import { completeAssertion } from "../assertions/assertion";

export function sequenceResolver(
  activeAssertions: Assertion[],
  _config: Configuration
): CompletedAssertion[] {
  const completed: CompletedAssertion[] = [];

  for (const assertion of activeAssertions) {
    if (assertion.type !== "after") continue;
    if (assertion.endTime) continue;

    const requiredKeys = assertion.typeValue.split(",").map(k => k.trim());
    const firstUnmet = requiredKeys.find(key =>
      !activeAssertions.some(a => a.assertionKey === key && a.status === "passed")
    );

    const result = completeAssertion(
      assertion,
      !firstUnmet,
      firstUnmet ? `Precondition not met: "${firstUnmet}" has not passed.` : ""
    );

    if (result) completed.push(result);
  }

  return completed;
}
```

**Critical difference from other resolvers:** The `sequenceResolver` must receive the FULL `activeAssertions` array -- including completed assertions -- because it needs to find parent assertions with `status === "passed"`. This is unlike:
- `immediateResolver` and `documentResolver` (`src/resolvers/dom.ts`) which receive only pending assertions via `getPendingDomAssertions()` (line 210, 215)
- `routeResolver` (`src/resolvers/route.ts`) which receives pending assertions via `getPendingAssertions()` (line 221)
- `elementResolver` which receives pending DOM assertions via `getPendingDomAssertions()` (line 168)

The resolver always resolves -- it either passes (all parents passed) or fails (at least one parent has not passed). There is no "wait and check later" path. This makes it suitable for `checkImmediateResolved` only, with no recurring check needed.

### 4. Manager Integration (`src/assertions/manager.ts`)

**4a. Import the resolver** (after line 39):
```typescript
import { sequenceResolver } from "../resolvers/sequence";
```

**4b. Add to `checkImmediateResolved`** (after the `route` block, lines 67-72):

```typescript
// Check if a sequence assertion's parent(s) have already passed
if (assertion.type === "after") {
  const sequenceResults = sequenceResolver(activeAssertions, config)
    .filter(r => r.assertionKey === assertion.assertionKey && r.type === "after");
  if (sequenceResults.length > 0) {
    deferredResult = sequenceResults[0];
  }
}
```

Note: `checkImmediateResolved` is called inside `enqueueAssertions` (line 137) which has closure access to `activeAssertions`. The full array (not just pending) is passed to `sequenceResolver`, which is what enables parent lookup.

**4c. No changes needed in:**
- `handleMutations` (line 174) -- `mutationHandler` passes to `elementResolver` which skips non-DOM types via `domAssertions.includes()` guard (dom.ts line 249)
- `handleEvent` (line 156) -- `eventResolver` only processes DOM assertions
- `checkAssertions` (line 209) -- `documentResolver` and `propertyResolver` skip non-DOM types; `routeResolver` skips non-route types
- `handleNavigation` (line 204) -- passes to `routeResolver` only
- `settle` (line 225) -- generic, works with any assertion type already
- `handlePageUnload` (line 325) -- `after` assertions resolve immediately so they will never be pending at unload time; if somehow pending, they would be handled by the existing stale-on-unload logic (line 349)

### 5. Parser (`src/processors/elements.ts`)

**No changes required.** The existing `processTypes` function (line 243-255) iterates `supportedAssertions.types` which spreads `allAssertionTypes`. Adding `"after"` to `allAssertionTypes` means `fs-assert-after="checkout/submit-payment"` will be parsed as `{ type: "after", value: "checkout/submit-payment" }` automatically.

The `createAssertions` function (line 297-371) has a route-specific filter (lines 305-323) but no special handling is needed for `after` -- it has no parse-time validation requirements. The modifier warning at line 334 will work correctly because `supportedModifiersByType["after"]` is `[]`, so any inline modifiers on an `after` attribute will be warned.

**Conditional key support:** `parseDynamicTypes` (line 129) iterates `allAssertionTypes` and would match `fs-assert-after-somekey`. This is technically valid but semantically unusual -- conditional sequence assertions. No special handling needed; it works or the user doesn't use it.

### 6. DOM Resolvers (`src/resolvers/dom.ts`)

**No changes required.** All three resolvers (`elementResolver` line 249, `immediateResolver` line 302, `documentResolver` line 354) guard with `domAssertions.includes(assertion.type)`, which will naturally skip `after` since it is in `sequenceAssertionTypes`, not `domAssertionTypes`.

### 7. Tests

Create `src/resolvers/__tests__/sequence.test.ts`:

- **Basic pass:** Parent assertion exists with `status: "passed"` -> `after` assertion passes
- **Basic fail:** Parent assertion does not exist -> `after` assertion fails with reason `'Precondition not met: "step/A" has not passed.'`
- **Parent pending:** Parent assertion exists but no status -> `after` fails
- **Parent failed:** Parent assertion exists with `status: "failed"` -> `after` fails
- **Parent dismissed:** Parent assertion exists with `status: "dismissed"` -> `after` fails
- **Multiple parents (AND):** `"step/A,step/B"` -- both passed -> pass; one missing -> fail with first unmet key in reason
- **Chaining:** A -> B -> C, each `after` checks only its direct parent
- **Skips non-after assertions:** Assertions with other types are not processed
- **Skips completed assertions:** `after` assertions with `endTime` set are not re-processed

Integration tests in `src/assertions/__tests__/manager.test.ts` (or a new sequence-specific test file):

- **Two data points from one trigger:** Element with `fs-assert-after` + `fs-assert-added` creates two independent assertions; both resolve independently
- **Re-trigger recovery:** `after` fails (parent not passed), parent later passes, trigger re-fires -> `after` now passes via `retryCompletedAssertion`
- **MPA cross-page:** Parent passed on page 1 (persisted via MPA), child on page 2 loads from storage and finds parent -> `after` passes
- **Immediate resolution:** `after` assertion resolves in the same microtask via `checkImmediateResolved`, not waiting for DOM mutations or GC

## Technical Considerations

### activeAssertions visibility

The `sequenceResolver` is the first resolver that needs to see completed assertions. All other resolvers operate on filtered subsets (pending DOM, pending all). The manager must pass the raw `activeAssertions` array, not a filtered view. This is safe because `sequenceResolver` only reads status -- it does not mutate assertions it doesn't own.

### No timeout / no GC interaction

`after` assertions resolve immediately (pass or fail) at enqueue time. They will never be pending when GC runs. If an `after` assertion somehow remains pending (bug), GC will clean it up through the existing sweep (manager.ts line 143-148). No special GC handling needed.

### Circular dependencies

A -> B -> A: Both `after` assertions fail because neither parent has passed at the time of check. No detection or prevention needed -- the failure reason communicates the problem clearly.

### OOB interaction

`fs-assert-oob` and `fs-assert-after` are orthogonal. OOB controls when an assertion is created (triggered by parent pass/fail). `after` is an assertion type that checks parent status at creation time. An element can have both: OOB triggers creation, `after` checks a different parent's status. No interaction or special handling.

### Invariant interaction

`fs-trigger="invariant"` with `fs-assert-after` is technically allowed but semantically odd -- invariants skip `checkImmediateResolved` (manager.ts line 116), so the `after` would never be checked. The `after` type resolves immediately and has no recurring check path. This combination should be warned against in documentation but does not require code-level prevention.

## Acceptance Criteria

1. `fs-assert-after="step/A"` on a triggered element creates an assertion with `type: "after"` and `typeValue: "step/A"`
2. The `after` assertion passes if a passed assertion with `assertionKey === "step/A"` exists in `activeAssertions`; fails otherwise
3. The `after` assertion resolves immediately via `checkImmediateResolved` (same microtask as enqueue)
4. Other assertion types on the same element (`added`, `visible`, `route`, etc.) create independent assertions unaffected by the `after` result
5. `fs-assert-after="step/A,step/B"` requires ALL referenced keys to have passed (AND semantics)
6. Failure reason format: `Precondition not met: "{first_unmet_key}" has not passed.`
7. Re-trigger on a failed `after` assertion re-evaluates; if parent has since passed, `after` now passes
8. MPA support: parent passed on page 1 (persisted), child on page 2 finds it in loaded `activeAssertions`
9. Chaining (A -> B -> C) works without transitive checks -- each `after` checks only its direct parent
10. No changes to DOM resolvers, event resolvers, or existing assertion types
11. TypeScript compiles cleanly with `after` in `AssertionType` union and all exhaustive checks (`supportedModifiersByType`)

## Dependencies & Risks

- **Low risk:** The change is additive. No existing assertion types, resolvers, or processing paths are modified. The new type is excluded from DOM/route resolvers by existing type guards.
- **activeAssertions exposure:** Passing the full (unfiltered) `activeAssertions` to `sequenceResolver` is a new pattern. Other resolvers receive filtered subsets. If future resolvers follow this pattern carelessly, they could introduce mutation bugs. The `sequenceResolver` is read-only on non-`after` assertions, which mitigates this.
- **Conditional `after`:** `fs-assert-after-success` / `fs-assert-after-error` would be parsed by `parseDynamicTypes`. This is an untested edge case. It works mechanically but needs documentation guidance on whether it's a supported pattern.

## Sources & References

- Brainstorm: `docs/brainstorms/2026-03-28-multi-step-sequential-assertions-requirements.md`
- Type definitions: `src/types.ts` (lines 60-63 for type arrays, line 74-97 for Assertion interface)
- Config: `src/config.ts` (lines 18-19 for assertion arrays, lines 29-38 for supportedModifiersByType)
- Manager: `src/assertions/manager.ts` (lines 51-80 for checkImmediateResolved, lines 81-154 for enqueueAssertions)
- Element processor: `src/processors/elements.ts` (lines 243-255 for processTypes, lines 297-371 for createAssertions)
- DOM resolvers: `src/resolvers/dom.ts` (line 249 for type guard pattern)
- Route resolver: `src/resolvers/route.ts` (lines 96-145 for resolver pattern reference)
- Assertion utilities: `src/assertions/assertion.ts` (lines 116-146 for completeAssertion)
