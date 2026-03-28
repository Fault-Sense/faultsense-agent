---
date: 2026-03-28
topic: multi-step-sequential-assertions
---

# Multi-Step Sequential Assertions (`fs-assert-after`)

## Problem Frame

Faultsense can assert that individual user actions produce correct outcomes, but has no way to assert *sequence* — that step B only counts as correct if step A already passed. Multi-step flows (checkout, onboarding, wizards) need this.

## Key Design Decision: Independent Assertion Type, Not a Gate

`fs-assert-after` is a **new assertion type** — like `added`, `visible`, or `route`. It creates its own independent assertion alongside any other assertion types declared on the same element. It does NOT gate or prevent other assertions from being created or resolved.

**Why:** More data points are better. Consider:

```html
<button fs-assert="checkout/place-order" fs-trigger="click"
  fs-assert-after="checkout/submit-payment"
  fs-assert-added=".order-confirmation">Place Order</button>
```

This creates **two independent assertions** when the button is clicked:
1. `after` assertion: did `checkout/submit-payment` pass before this trigger? → pass/fail
2. `added` assertion: did `.order-confirmation` appear? → pass/fail

The collector gets both signals. If the user skipped the payment step (sequence failed) but the order confirmation still appeared (DOM passed), that's a meaningful finding — the UI allowed a flow violation. If the gate approach prevented the DOM assertion from running, that data would be lost.

## Requirements

- R1. **New assertion type `after`** — Added to `allAssertionTypes` alongside `added`, `removed`, etc. The type value is the referenced parent assertion key. `fs-assert-after="checkout/submit-payment"` creates an assertion with `type: "after"`, `typeValue: "checkout/submit-payment"`.

- R2. **Independent resolution** — The `after` assertion resolves on its own, through its own resolver. Other assertion types on the same element (`added`, `visible`, `route`, etc.) create their own assertions and resolve through the normal pipeline. No interaction between them.

- R3. **Resolution logic** — The `after` resolver scans `activeAssertions` for any assertion where `assertionKey === typeValue` and `status === "passed"`. If found → pass. If not found, or found with `status === "failed"` / `"dismissed"` / `undefined` (pending) → fail.

- R4. **Immediate resolution** — `after` assertions should resolve immediately at enqueue time via `checkImmediateResolved`, same as `visible` and `route`. The parent either already passed or it didn't — there's no DOM state to wait for. No timeout needed.

- R5. **Multiple parents** — `fs-assert-after="step/A,step/B"` creates a single `after` assertion with comma-separated keys in `typeValue`. Resolution requires ALL referenced keys to have passed. Consistent with `fs-assert-oob` comma syntax.

- R6. **Chaining** — A → B → C works naturally. B's `after` assertion checks A passed. C's `after` assertion checks B passed. Each is independent. No recursion, no transitive checks.

- R7. **Re-trigger behavior** — When the trigger re-fires, `retryCompletedAssertion` resets the `after` assertion. The resolution check runs again. If the parent has since passed, the `after` assertion now passes. Natural recovery path.

- R8. **Failure reason** — `"Precondition not met: \"step/A\" has not passed."` (using the first unmet key).

## Integration Points

### Types (`src/types.ts`)

- Add `"after"` to the assertion type system. Since `after` is neither a DOM type nor a route type, it needs its own category:

```typescript
export const domAssertionTypes = ["added", "removed", "updated", "visible", "hidden", "loaded", "stable"] as const;
export const routeAssertionTypes = ["route"] as const;
export const sequenceAssertionTypes = ["after"] as const;
export const allAssertionTypes = [...domAssertionTypes, ...routeAssertionTypes, ...sequenceAssertionTypes] as const;
```

### Config (`src/config.ts`)

- Add `sequenceAssertions` array (like `domAssertions` and `routeAssertions`):

```typescript
export const sequenceAssertions: string[] = [...sequenceAssertionTypes];
```

- Add `after` to `supportedModifiersByType` with empty modifiers (no DOM modifiers apply):

```typescript
export const supportedModifiersByType: Record<AssertionType, readonly string[]> = {
  // ... existing entries ...
  after: [],
};
```

### Resolver (`src/resolvers/sequence.ts` — new file)

New resolver, following the pattern of `routeResolver`:

```typescript
export const sequenceResolver: AssertionCollectionResolver = (
  activeAssertions: Assertion[],
  _config
): CompletedAssertion[] => {
  return activeAssertions.reduce((acc, assertion) => {
    if (assertion.type !== "after") return acc;

    const requiredKeys = assertion.typeValue.split(",").map(k => k.trim());
    const allPassed = requiredKeys.every(key =>
      activeAssertions.some(a => a.assertionKey === key && a.status === "passed")
    );

    // After assertions resolve immediately — pass or fail, no waiting
    const completed = completeAssertion(
      assertion,
      allPassed,
      allPassed ? "" : `Precondition not met: "${requiredKeys.find(key =>
        !activeAssertions.some(a => a.assertionKey === key && a.status === "passed")
      )}" has not passed.`
    );

    if (completed) acc.push(completed);
    return acc;
  }, [] as CompletedAssertion[]);
};
```

### Manager (`src/assertions/manager.ts`)

- Import `sequenceResolver`
- Add to `checkImmediateResolved`: handle `after` type alongside `visible`/`hidden`/`route`:

```typescript
if (assertion.type === "after") {
  // Pass the full activeAssertions array so the resolver can look up parent status
  const sequenceResults = sequenceResolver(activeAssertions, config)
    .filter(r => r.assertionKey === assertion.assertionKey && r.type === "after");
  if (sequenceResults.length > 0) {
    deferredResult = sequenceResults[0];
  }
}
```

Note: The `sequenceResolver` needs access to ALL `activeAssertions` (not just pending ones) because it needs to find completed/passed parent assertions. This is different from DOM resolvers which only operate on pending assertions.

### Parser (`src/processors/elements.ts`)

- No special parsing needed. `fs-assert-after="step/A"` is handled by the existing `processTypes` loop which reads `fs-assert-{type}` attributes. Since `after` is in `allAssertionTypes`, it will be parsed as `{ type: "after", value: "step/A" }`.

### DOM resolvers (`src/resolvers/dom.ts`)

- No changes. The `domAssertions.includes(assertion.type)` guard in `elementResolver`, `immediateResolver`, and `documentResolver` will naturally skip `after` assertions since `after` is not in `domAssertions`.

## MPA Support

Works across pages because `activeAssertions` are loaded from localStorage on init. If step A passed on page 1 and was persisted (MPA mode), step B on page 2 can find it. Both parent and child need MPA marking for cross-page sequences.

## OOB Interaction

Orthogonal:
- **OOB** controls *when* an assertion is created (triggered by parent pass/fail)
- **`after`** is an assertion *type* that checks whether a different assertion previously passed

An element can have both: OOB triggers creation, `after` checks sequence. They don't interact.

## Usage Examples

### Multi-Step Checkout

```html
<!-- Step 1: Validate cart -->
<button fs-assert="checkout/validate-cart" fs-trigger="click"
  fs-assert-added=".cart-summary">Validate Cart</button>

<!-- Step 2: Enter payment (sequence check + DOM check) -->
<form fs-assert="checkout/submit-payment" fs-trigger="submit"
  fs-assert-after="checkout/validate-cart"
  fs-assert-added=".payment-confirmation">
</form>

<!-- Step 3: Place order (sequence check + DOM check) -->
<button fs-assert="checkout/place-order" fs-trigger="click"
  fs-assert-after="checkout/submit-payment"
  fs-assert-added=".order-confirmation">Place Order</button>
```

Each step produces 2 assertions. The collector sees:
- Did the user follow the sequence? (`after` pass/fail)
- Did the UI respond correctly? (`added` pass/fail)

### Wizard with Multiple Prerequisites

```html
<!-- Final step requires both profile AND preferences completed -->
<button fs-assert="onboarding/finish" fs-trigger="click"
  fs-assert-after="onboarding/profile,onboarding/preferences"
  fs-assert-added=".dashboard">Finish Setup</button>
```

### Auth Gate

```html
<button fs-assert="settings/update-profile" fs-trigger="click"
  fs-assert-after="auth/login"
  fs-assert-updated=".profile-card">Save</button>
```

## Scope Boundaries

- **Not a flow abstraction.** Each assertion is independent. `after` is an assertion type, not a workflow engine.
- **No transitive checks.** C checks B, not A. If B passed, that's sufficient.
- **No ordering enforcement.** `after` doesn't prevent the trigger from firing or other assertions from resolving. It just reports whether the sequence was followed.
- **No circular dependency detection.** A → B → A is user error. Both `after` assertions will fail (neither parent has passed). No runtime detection needed.
- **No timeout.** `after` resolves immediately. The parent either passed or it didn't.

## Outstanding Questions

- Should the API payload include the parent key(s) and their status at check time? Useful for debugging but adds payload size.
- If a parent assertion is retried and passes after the child's `after` already failed, should there be any auto-re-evaluation? Current design says no — the child's trigger must re-fire. Keeps things simple.

## Next Steps

> `/ce:plan` for structured implementation planning
