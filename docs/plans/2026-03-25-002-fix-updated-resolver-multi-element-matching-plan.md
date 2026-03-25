---
title: "fix: Updated resolver should check all matching elements, not just the first"
type: fix
status: completed
date: 2026-03-25
---

# fix: Updated resolver should check all matching elements, not just the first

## Problem

`handleAssertion` in `src/resolvers/dom.ts:133` uses `elements.find(matchFn)` which stops at the first element matching the selector. Modifiers are then checked against only that element. If it doesn't satisfy the modifiers, the assertion fails — even though other mutated elements matching the same selector DO satisfy them.

This manifests when a framework re-renders a list (e.g., React's `router.invalidate()`). All list items get mutations. The resolver picks the first `.todo-item` and checks `classlist=completed:true` against it. If that item isn't the toggled one, the assertion fails.

**Reproduction:**
```html
<input type="checkbox"
  fs-assert="todos/toggle-complete"
  fs-trigger="change"
  fs-assert-updated=".todo-item[classlist=completed:true]">
```
Toggle a checkbox in a list of 3 todos. React re-renders all 3. `elements.find()` returns the first `.todo-item` — which may not be the one with `completed` class.

## Fix

In `handleAssertion` (`src/resolvers/dom.ts:133-158`), change `elements.find(matchFn)` to iterate all matching elements. Pass if ANY matching element satisfies all modifiers. Fail only if NO matching element satisfies them.

```typescript
// Before (dom.ts:139)
const matchingElement = elements.find(matchFn);
if (!matchingElement) return null;
// ... check modifiers on matchingElement

// After
const matchingElements = elements.filter(matchFn);
if (matchingElements.length === 0) return null;

for (const el of matchingElements) {
  let allPassed = true;
  for (const fn of getAssertionModifierFns(assertion)) {
    const [result] = fn(el);
    if (!result) { allPassed = false; break; }
  }
  if (allPassed) {
    return completeAssertion(assertion, true, "");
  }
}

// No element satisfied all modifiers — fail with reason from last checked
// (use the first matching element for the failure message, matching current behavior)
const firstMatch = matchingElements[0];
let failureReason: FailureReasonCode = "";
for (const fn of getAssertionModifierFns(assertion)) {
  const [result, reason] = fn(firstMatch);
  if (!result) { failureReason = reason; break; }
}
return completeAssertion(assertion, false, failureReason ? getFailureMessage(failureReason, assertion) : "");
```

## Scope

- Only `handleAssertion` in `src/resolvers/dom.ts` changes
- Applies to ALL assertion types that use `handleAssertion` (added, removed, updated, visible, hidden) — this is correct behavior for all of them
- Existing tests should continue to pass (single-element cases are a subset of multi-element matching)
- Add new test cases for the multi-element scenario

## Acceptance Criteria

- [ ] `handleAssertion` iterates all elements matching the selector, not just the first
- [ ] Assertion passes if ANY matching element satisfies all modifiers
- [ ] Assertion fails only when NO matching element satisfies modifiers
- [ ] Failure message uses the first matching element (consistent with current UX)
- [ ] Existing 8 `updated.test.ts` tests still pass
- [ ] New test: multiple elements match selector, modifier applies to a non-first element → assertion passes
- [ ] New test: multiple elements match selector, no element satisfies modifier → assertion fails with correct reason

## Context

- `handleAssertion`: `src/resolvers/dom.ts:133-158`
- `elements.find(matchFn)`: `src/resolvers/dom.ts:139` — the line to change
- `getAssertionModifierFns`: `src/resolvers/dom.ts:110-127`
- `updated.test.ts`: `tests/assertions/updated.test.ts`
- Discovery: todolist-tanstack demo, `todos/toggle-complete` assertion with `classlist` modifier

## Sources

- `src/resolvers/dom.ts:133-158` — `handleAssertion` function
- `src/resolvers/dom.ts:139` — the `elements.find()` short-circuit
- `src/resolvers/dom.ts:41-47` — `updated` matcher (self-match + containment)
- `src/processors/mutations.ts:12-35` — how mutation targets become `updatedElements`
- `tests/assertions/updated.test.ts` — existing test coverage
