---
title: "feat: Add property assertion primitives and fs-assert-stable"
type: feat
status: completed
date: 2026-03-27
origin: docs/brainstorms/2026-03-27-property-primitives-and-stable-requirements.md
---

# feat: Add property assertion primitives and fs-assert-stable

## Overview

Add four new inline modifiers (`value-matches`, `checked`, `count`/`count-min`/`count-max`, `disabled`) and one new assertion type (`stable`) to close the highest-value gaps from the e2e gap analysis. The modifiers slot into the existing modifier architecture. `stable` reuses the `updated` resolver pipeline with inverted pass/fail semantics via an `invertResolution` property on the assertion.

## Problem Statement / Motivation

Faultsense lacks the three most common e2e assertion primitives — input values, element counts, and disabled state. It also has no way to assert that UI *settled* after an action (no flickering, re-renders, or silent rollbacks). These were the top remaining gaps from the gap analysis (see origin: `docs/brainstorms/2026-03-27-property-primitives-and-stable-requirements.md`).

## Proposed Solution

**Property primitives:** Four new entries in the modifier system following the exact pattern of `text-matches` and `classlist`. `count` is the exception — it's a selector-level modifier that runs before the per-element loop.

**`stable`:** A new assertion type that is `updated` with inverted resolution. The `invertResolution: true` property is stamped on the assertion at creation time (driven by a config list). `completeAssertion` flips the pass/fail boolean when this property is set. No changes to resolvers, timeouts, or settlement — the entire `updated` pipeline runs identically.

## Technical Considerations

### Inversion ordering in `completeAssertion`

The inversion MUST be applied **before** the invariant guard (assertion.ts:122-125). The invariant guard checks `success === true` to suppress no-op completions. If inversion runs after the guard, `stable + invariant` breaks: a mutation detection calls `completeAssertion(assertion, true, "")`, the guard sees `success=true` and returns `null` (suppressed), and the inversion never runs. The mutation is silently swallowed.

Correct ordering in `completeAssertion`:
1. Apply `invertResolution` flip
2. Then check invariant guard
3. Then proceed with status comparison and completion

### `stable` timeout behavior

Without an explicit `fs-assert-timeout`, a `stable` assertion relies on the 30-second GC sweep to pass. This is acceptable — GC cleanup naturally resolves stable assertions that had no mutations. Developers can use `fs-assert-timeout` for tighter stability windows when needed (e.g., `fs-assert-timeout="2000"`).

### `count` as a selector-level modifier

`count`/`count-min`/`count-max` operate on the result set (`querySelectorAll(selector).length`), not on individual elements. The current `modifiersMap` functions receive a single `HTMLElement`. These modifiers need a **pre-check in `handleAssertion`** before the per-element loop: extract count modifiers from the assertion, run `document.querySelectorAll(selector)`, compare count, short-circuit on failure. The per-element modifiers then run on mutation-detected elements as normal.

### `handlePageUnload` must respect `invertResolution`

The unload handler (manager.ts:325-372) bypasses `completeAssertion` and uses `Object.assign` directly. A pending `stable` assertion would be reported as "failed" when it should logically be "passed" (no mutation before unload). The unload path must check `invertResolution` and flip the status.

### `data-fs-*` mutation filtering

The stable resolver must ignore Faultsense's own attribute mutations. In practice, the only fs-attribute mutation is `data-fs-oob-target` set by the OOB processor. The filtering approach: in the `stable` case of `elementResolver`, filter the `updatedElements` list by checking against mutation records. Since mutation records aren't directly available in the resolver, the mutation handler (`mutations.ts`) should track `fsOnlyMutationTargets` — elements whose only mutations in this batch were `data-fs-*` attributes. The stable resolver filters these out.

## Acceptance Criteria

### Phase 1: Property Assertion Primitives

- [ ] `value-matches` modifier reads `el.value` and tests against regex pattern
- [ ] `checked` modifier reads `el.checked` boolean, coerces string `"true"`/`"false"`
- [ ] `count`/`count-min`/`count-max` modifiers check `querySelectorAll(selector).length` before per-element loop
- [ ] `disabled` modifier checks `.disabled` property and `aria-disabled="true"` attribute
- [ ] All new modifiers registered in `inlineModifiers`, `domModifiers`, `modifiersMap`
- [ ] Failure reason messages for each new modifier
- [ ] `supportedModifiersByType` updated for all DOM assertion types
- [ ] Self-referencing `count` warns at parse time (count of self is always 1)
- [ ] Tests for each modifier: happy path, failure path, edge cases

### Phase 2: fs-assert-stable

- [ ] `stable` added to `domAssertionTypes`, `supportedModifiersByType`, `elementResolver` switch, timeout failure messages
- [ ] `invertResolution: boolean` added to `Assertion` interface
- [ ] `invertedResolutionTypes` config list, checked at assertion creation time
- [ ] `completeAssertion` flips pass/fail boolean when `invertResolution` is true — **before** invariant guard
- [ ] `stable` case in `elementResolver` uses `updatedElements` with `updated` matcher
- [ ] `data-fs-*` attribute mutations filtered via `fsOnlyMutationTargets` tracking in mutations.ts
- [ ] `handlePageUnload` respects `invertResolution`
- [ ] Tests: pass on timeout (GC or SLA), fail on mutation, invariant combo, OOB combo, page unload, conditional sibling dismissal

## Implementation Phases

### Phase 1: Property Assertion Primitives

#### Step 1.1: Type and config registration

**`src/types.ts`**
- Add `"value-matches"`, `"checked"`, `"disabled"`, `"count"`, `"count-min"`, `"count-max"` to `domModifiers` tuple

**`src/config.ts`**
- Add all six to `inlineModifiers` array
- Add all six to `supportedModifiersByType` for all DOM assertion types (`added`, `removed`, `updated`, `visible`, `hidden`). Not `loaded`, `route`, or `stable`.

#### Step 1.2: Parser updates

**`src/processors/elements.ts`**
- `resolveInlineModifiers()`: Add `"value-matches"`, `"checked"`, `"disabled"` as reserved keys (pass through like `text-matches`)
- `resolveInlineModifiers()`: Add `"count"`, `"count-min"`, `"count-max"` as reserved keys. Store as string values (numeric comparison happens in resolver).
- Self-referencing check: In `createAssertions()`, warn if count modifiers present on assertions with no selector (self-referencing). Still create the assertion — count=1 implicitly.

#### Step 1.3: Modifier check functions

**`src/resolvers/dom.ts` — `modifiersMap` additions:**

```typescript
// value-matches: regex against el.value DOM property
"value-matches": (el: HTMLElement, modValue: string) => [
  "value" in el ? new RegExp(modValue).test((el as HTMLInputElement).value) : false,
  "value-matches",
],

// checked: boolean DOM property
"checked": (el: HTMLElement, modValue: string) => [
  "checked" in el ? (el as HTMLInputElement).checked === (modValue === "true") : false,
  "checked",
],

// disabled: native property + aria-disabled
"disabled": (el: HTMLElement, modValue: string) => {
  const isDisabled = ("disabled" in el && (el as HTMLButtonElement).disabled) ||
    el.getAttribute("aria-disabled") === "true";
  return [modValue === "true" ? isDisabled : !isDisabled, "disabled"];
},
```

#### Step 1.4: Count pre-check in `handleAssertion`

**`src/resolvers/dom.ts`:**

Extract count modifiers from assertion before the per-element loop. Run `document.querySelectorAll(selector).length` and compare against `count` (exact), `count-min` (>=), `count-max` (<=). Short-circuit with failure if any count check fails.

```typescript
// In handleAssertion, before the per-element modifier loop:
const countResult = checkCountModifiers(assertion);
if (countResult !== null) return countResult; // failed count check

function checkCountModifiers(assertion: Assertion): CompletedAssertion | null {
  const mods = assertion.modifiers;
  if (!mods) return null;
  const count = mods["count"];
  const countMin = mods["count-min"];
  const countMax = mods["count-max"];
  if (!count && !countMin && !countMax) return null;
  if (!assertion.typeValue) return null; // self-referencing, warned at parse time

  const actual = document.querySelectorAll(assertion.typeValue).length;
  if (count && actual !== Number(count)) return completeAssertion(assertion, false, `Expected ${count} elements matching ${assertion.typeValue}, found ${actual}`);
  if (countMin && actual < Number(countMin)) return completeAssertion(assertion, false, `Expected at least ${countMin} elements matching ${assertion.typeValue}, found ${actual}`);
  if (countMax && actual > Number(countMax)) return completeAssertion(assertion, false, `Expected at most ${countMax} elements matching ${assertion.typeValue}, found ${actual}`);
  return null; // all count checks passed
}
```

Note: `count` modifiers must be excluded from `getAssertionModifierFns()` since they're handled separately. Add them to a `selectorLevelModifiers` set and filter them out.

#### Step 1.5: Failure reason messages

**`src/resolvers/dom.ts` — `getFailureReasonForAssertion()`:**

Add cases for `"value-matches"`, `"checked"`, `"disabled"`. Count failures use inline reason strings (see Step 1.4).

#### Step 1.6: Tests

**`tests/modifiers/value-matches.test.ts`:**
- Input with matching value → pass
- Input with non-matching value → fail
- Non-form element → fail (no `.value` property)
- Select element → reads selected option value
- Textarea → reads content

**`tests/modifiers/checked.test.ts`:**
- Checkbox checked, `[checked=true]` → pass
- Checkbox unchecked, `[checked=true]` → fail
- `[checked=false]` inverse
- Non-checkbox element → fail

**`tests/modifiers/count.test.ts`:**
- `[count=3]` with exactly 3 matching elements → pass
- `[count=3]` with 2 elements → fail
- `[count-min=2]` and `[count-max=5]` range checks
- Self-referencing with count → warn, pass with count=1
- Count combined with per-element modifiers (e.g., `[count=3][text-matches=\w+]`)

**`tests/modifiers/disabled.test.ts`:**
- Button with native `.disabled` → `[disabled=true]` pass
- Element with `aria-disabled="true"` → `[disabled=true]` pass
- `aria-disabled="false"` → `[disabled=true]` fail
- `[disabled=false]` inverse checks

### Phase 2: fs-assert-stable

#### Step 2.1: Type system registration

**`src/types.ts`:**
- Add `"stable"` to `domAssertionTypes`
- Add `invertResolution?: boolean` to `Assertion` interface

**`src/config.ts`:**
- Add `invertedResolutionTypes: string[] = ["stable"]`
- Add `stable: domModifiers` to `supportedModifiersByType`

**`src/assertions/timeout.ts`:**
- Add `"stable"` case to `getFailureReasonForAssertion()`: `"Expected ${assertion.typeValue} to remain stable within ${timeout}ms."`

#### Step 2.2: Assertion creation — stamp `invertResolution`

**`src/processors/elements.ts` — `createAssertions()`:**

After building the assertion object, check if `type` is in `invertedResolutionTypes` config. If so, set `assertion.invertResolution = true`.

No warning needed if `stable` lacks `fs-assert-timeout` — GC cleanup is an acceptable pass path.

#### Step 2.3: `completeAssertion` inversion

**`src/assertions/assertion.ts`:**

At the **top** of `completeAssertion`, before the invariant guard:

```typescript
if (assertion.invertResolution) {
  success = !success;
}
```

This ensures:
- Mutation detected → resolver calls `completeAssertion(assertion, true, "")` → inverted to `false` → fails
- Timeout fires → calls `completeAssertion(assertion, false, reason)` → inverted to `true` → passes
- Invariant guard sees the post-inversion `success` value → `stable + invariant` works correctly

#### Step 2.4: `elementResolver` — stable case

**`src/resolvers/dom.ts`:**

In the `elementResolver` switch statement, add `stable` alongside `updated` — same element list (`updatedElements`), same matcher (`assertionTypeMatchers.updated`). The only difference: filter out `fsOnlyMutationTargets` before passing to `handleAssertion`.

```typescript
case "stable": {
  const filtered = updatedElements.filter(el => !fsOnlyMutationTargets.has(el));
  const allUpdated = [...filtered, ...addedElements, ...removedElements];
  elements = allUpdated;
  break;
}
```

Note: `stable` should also detect `addedElements` and `removedElements` in the subtree — any childList change within the target is a mutation that should fail stable. The `updated` type only uses `updatedElements`, but `stable` needs the broader set.

#### Step 2.5: Mutation filtering for `data-fs-*`

**`src/processors/mutations.ts`:**

Track a `fsOnlyMutationTargets: Set<HTMLElement>` in the mutation handler:

1. For each `attributes` mutation where `mutation.attributeName?.startsWith("data-fs-") || mutation.attributeName?.startsWith("fs-")`: add `mutation.target` to `fsOnlyMutationTargets`
2. For each other mutation (childList, characterData, non-fs attribute) on the same target: remove from `fsOnlyMutationTargets`
3. After processing all mutation records, elements remaining in `fsOnlyMutationTargets` had ONLY fs-attribute mutations

Export `fsOnlyMutationTargets` alongside the existing element lists for use in the stable resolver.

#### Step 2.6: `handlePageUnload` fix

**`src/assertions/manager.ts` — `handlePageUnload()`:**

The unload handler uses `Object.assign` to build completed assertions directly, bypassing `completeAssertion`. Add an `invertResolution` check:

```typescript
const status = assertion.invertResolution
  ? (isStale ? "passed" : "failed")  // invert: stale = pass (no mutation), fresh = fail
  : (isStale ? "failed" : "passed"); // normal behavior
```

Wait — the unload handler's logic is: stale assertions (older than `unloadGracePeriod`) are failed, fresh assertions are silently dropped. For `stable`, a stale pending assertion on unload means no mutation happened during the page's lifetime — that's a pass. The inversion handles this correctly.

#### Step 2.7: Tests

**`tests/assertions/stable.test.ts`:**

- **Pass on timeout:** Element not mutated, SLA timeout fires → passes (inverted)
- **Fail on mutation:** Child element updated → fails (inverted)
- **Fail on attribute change:** Target attribute changed → fails
- **Fail on childList change:** Child added/removed → fails
- **Ignore `data-fs-*` mutations:** OOB target attribute set → does NOT fail
- **Invariant combo:** `fs-trigger="invariant"` + `fs-assert-stable` → fails on mutation, re-arms, passes on page unload
- **OOB combo:** Parent passes → stable OOB assertion created → no further mutations → passes on timeout
- **Conditional sibling dismissal:** `stable-success` passes via timeout → dismisses `updated-error` sibling
- **Page unload:** Pending stable assertion → passed on unload (stale, inverted)
- **GC pass path:** No `fs-assert-timeout` set → GC sweep passes the stable assertion (inverted)
- **With modifiers:** `fs-assert-stable="#panel[text-matches=Dashboard]"` — mutation on panel fails even if text still matches (stability is about absence of mutation, not content)

## Dependencies & Risks

- **`describe.only` in classlist.test.ts (line 8):** This would skip all other tests when running the full suite. Must be removed before or during this work.
- **Mutation handler change (Step 2.5):** Adding `fsOnlyMutationTargets` tracking to `mutations.ts` could affect performance if not careful. The filtering is O(n) over mutation records — should be negligible.
- **`count` + `querySelectorAll` performance:** Broad selectors (`.item`) on large DOMs could be expensive. This runs at resolution time (on every matching mutation batch), so it's bounded by mutation frequency. Document the performance consideration.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-27-property-primitives-and-stable-requirements.md](docs/brainstorms/2026-03-27-property-primitives-and-stable-requirements.md) — Key decisions: `stable` is its own type with inverted resolution via `invertResolution` property; `count` checks selector matches before per-element modifiers; `disabled` checks native + ARIA only; `checked` is separate from `value-matches`.
- **Gap analysis:** [docs/ideation/2026-03-26-e2e-gap-analysis-ideation.md](docs/ideation/2026-03-26-e2e-gap-analysis-ideation.md) — Ideas #3 (stable) and #4 (property primitives)
- **Pipeline extension patterns:** [docs/solutions/logic-errors/assertion-pipeline-extension-ui-conditional-and-invariant-triggers.md](docs/solutions/logic-errors/assertion-pipeline-extension-ui-conditional-and-invariant-triggers.md) — "Extend the pipeline, don't build alongside it"
- **GC/timeout patterns:** [docs/solutions/logic-errors/gc-timeout-refactor-and-instrumentation-patterns.md](docs/solutions/logic-errors/gc-timeout-refactor-and-instrumentation-patterns.md) — Don't conflate cleanup with SLA; dedup by status only
