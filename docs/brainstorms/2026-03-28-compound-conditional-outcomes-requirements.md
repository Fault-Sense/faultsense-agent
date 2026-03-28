---
date: 2026-03-28
topic: compound-conditional-outcomes
---

# Compound Conditional Outcomes (`fs-assert-mutex`)

## Problem Frame

When `fs-assert-grouped` links conditional assertions across types, the first assertion to resolve dismisses ALL other conditionals — including same-key assertions that belong to the winning outcome.

```html
<button fs-assert="todos/add-item" fs-trigger="click"
  fs-assert-grouped=""
  fs-assert-added-success=".todo-item"
  fs-assert-emitted-success="todo:added"
  fs-assert-added-error=".add-error">Add</button>
```

**Today's behavior:** `added-success` resolves → dismisses `emitted-success` AND `added-error`. Wrong — `emitted-success` is part of the success outcome, not a competitor.

**Desired behavior:** `added-success` resolves → dismisses `added-error` (different key). `emitted-success` stays pending and resolves independently. If `added-error` resolves first → dismisses both `added-success` AND `emitted-success` (different key).

Additionally, `fs-assert-grouped` is a poor name — "grouped" doesn't communicate mutual exclusion. The attribute should be renamed to something precise.

## Proposed API: `fs-assert-mutex`

Replace `fs-assert-grouped` with `fs-assert-mutex`. Three modes:

### Mode 1: `fs-assert-mutex="all"` (replaces `fs-assert-grouped=""`)

All conditional assertions on the element are mutually exclusive. First to resolve wins, everything else dismissed. Identical to current `grouped` behavior.

```html
<button fs-assert="todos/remove-item" fs-trigger="click"
  fs-assert-mutex="all"
  fs-assert-removed-success=".todo-item"
  fs-assert-added-error=".error-msg">Delete</button>
```

### Mode 2: `fs-assert-mutex="conditions"`

Condition keys compete as outcome groups. When one assertion resolves, dismiss all assertions with a **different** condition key. Same-key assertions stay pending and resolve independently.

```html
<button fs-assert="todos/add-item" fs-trigger="click"
  fs-assert-mutex="conditions"
  fs-assert-added-success=".todo-item"
  fs-assert-emitted-success="todo:added"
  fs-assert-added-error=".add-error">Add</button>
```

| What resolves | Dismiss | Keep pending |
|---|---|---|
| `added-success` | `added-error` (different key) | `emitted-success` (same key) |
| `added-error` | `added-success`, `emitted-success` (different key) | — |
| `emitted-success` | `added-error` (different key) | `added-success` (same key) |

### Mode 3: `fs-assert-mutex="success,error"` (selective)

Only listed condition keys compete with each other. Unlisted keys are invisible to the mutex — they don't dismiss others and aren't dismissed by others.

```html
<button fs-assert="checkout/submit" fs-trigger="click"
  fs-assert-mutex="success,error"
  fs-assert-added-success=".confirmation"
  fs-assert-emitted-success="order:placed"
  fs-assert-added-error=".error-msg"
  fs-assert-visible-rate-limited=".rate-limit-banner">Submit</button>
```

| What resolves | Dismiss | Keep pending |
|---|---|---|
| `added-success` | `added-error` (competing listed key) | `emitted-success` (same key), `visible-rate-limited` (not in mutex) |
| `added-error` | `added-success`, `emitted-success` (competing listed key) | `visible-rate-limited` (not in mutex) |
| `visible-rate-limited` | nothing (not in mutex list) | everything else continues |

**Rule:** Only keys in the mutex list compete. Unlisted keys are invisible to the mutex — they don't dismiss others and aren't dismissed by others.

`"conditions"` is sugar for "all condition keys found on this element are in the mutex."

## Implementation

### `getSiblingGroup` changes

Current (assertion.ts:76-88):
```ts
return allAssertions.filter(
  (a) =>
    a.assertionKey === assertion.assertionKey &&
    (assertion.grouped || a.type === assertion.type) &&
    a.conditionKey !== undefined &&
    a !== assertion
);
```

Proposed — the assertion needs a new `mutex` field (parsed from `fs-assert-mutex`):

```ts
return allAssertions.filter(
  (a) =>
    a.assertionKey === assertion.assertionKey &&
    a.conditionKey !== undefined &&
    a !== assertion &&
    isMutexSibling(assertion, a)
);

function isMutexSibling(resolved: Assertion, candidate: Assertion): boolean {
  if (!resolved.mutex) {
    // No mutex — default behavior: same-type siblings only
    return candidate.type === resolved.type;
  }
  if (resolved.mutex === "all") {
    // All conditionals race — current grouped behavior
    return true;
  }
  if (resolved.mutex === "conditions") {
    // Condition keys compete — different key = sibling, same key = co-member
    return candidate.conditionKey !== resolved.conditionKey;
  }
  // Selective: only listed keys compete
  const mutexKeys = resolved.mutexKeys; // parsed comma-separated list
  if (!mutexKeys.includes(resolved.conditionKey!)) return false; // resolver not in mutex
  if (!mutexKeys.includes(candidate.conditionKey!)) return false; // candidate not in mutex
  return candidate.conditionKey !== resolved.conditionKey;
}
```

### Assertion interface changes

Add to `Assertion` type:
```ts
mutex?: "all" | "conditions" | undefined;  // parsed from fs-assert-mutex
mutexKeys?: string[];                       // parsed comma-separated list (selective mode)
```

### Parser changes

In `processModifiers` (elements.ts), `fs-assert-mutex` replaces `fs-assert-grouped`. The value is parsed:
- `""` or `"all"` → `mutex: "all"`, `mutexKeys: undefined`
- `"conditions"` → `mutex: "conditions"`, `mutexKeys: undefined`
- `"success,error"` → `mutex: "conditions"`, `mutexKeys: ["success", "error"]`

### Migration

`fs-assert-grouped=""` → `fs-assert-mutex="all"`. Deprecate `grouped` with a console warning pointing to `mutex`. Support both during a transition period, with `mutex` taking precedence if both are present.

## Backward Compatibility

- `fs-assert-mutex="all"` is identical to current `fs-assert-grouped=""` behavior
- Existing elements using `fs-assert-grouped=""` with single-type conditionals (e.g., `added-success` vs `added-error`) are unaffected — same-type siblings already dismiss by different condition key
- The only behavioral change is for `grouped` + same-key + multiple types, which currently dismisses co-members (wrong)

## Open Questions

1. **Default when value is empty?** `fs-assert-mutex=""` — should this mean `"all"` (backward compat with `grouped=""`) or `"conditions"` (more useful default)?

2. **Timeout semantics:** Keep per-assertion. If `emitted-success` times out but `added-success` passed, both results reported independently. Collector sees "success outcome: DOM passed, event timed out."

3. **Co-member disagreement:** `added-success` passes, `emitted-success` fails (modifier mismatch). Competing outcome already dismissed. Both results reported. Correct — collector sees partial success.

4. **Collector impact:** None. Each assertion reports individually with its condition key. Collector can group by key to reconstruct outcomes.
