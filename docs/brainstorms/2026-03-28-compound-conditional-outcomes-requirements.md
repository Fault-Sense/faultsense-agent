---
date: 2026-03-28
topic: compound-conditional-outcomes
---

# Compound Conditional Outcomes

## Problem Frame

The current conditional assertion system uses first-match-wins semantics within sibling groups. When a conditional resolves, all other siblings are dismissed. This works well for mutually exclusive outcomes of the same type (`added-success` vs `added-error`), and `fs-assert-grouped` extends it across types (`removed-success` vs `added-error`).

But there's a class of assertions where a single outcome requires **multiple checks to pass together**:

```html
<button fs-assert="todos/add-item" fs-trigger="click"
  fs-assert-grouped=""
  fs-assert-added-success=".todo-item"
  fs-assert-emitted-success="todo:added"
  fs-assert-added-error=".add-error">Add</button>
```

The intent: on success, BOTH `added-success` and `emitted-success` must pass. On error, only `added-error` resolves and the success assertions are dismissed.

Today's `grouped` flag makes all three siblings. First to resolve dismisses the other two. This creates two problems:

1. **AND within an outcome is impossible.** If `added-success` resolves first, `emitted-success` is dismissed — we never verify the custom event was dispatched.
2. **If `emitted-success` resolves first** (custom event fires before DOM update), `added-success` is dismissed — we never verify the DOM outcome.

The fundamental gap: conditions today are individual assertions competing in a race. There's no way to express "these assertions belong to the same outcome and must ALL pass for that outcome to succeed."

## Use Cases

### 1. DOM change + custom event (original trigger)
Success = new `.todo-item` appears AND `todo:added` event dispatched. Error = `.add-error` appears.

### 2. DOM change + route change
Login success = dashboard visible AND route is `/dashboard`. Error = error message visible.

```html
<button fs-assert="auth/login" fs-trigger="click"
  fs-assert-visible-success=".dashboard"
  fs-assert-route-success="/dashboard"
  fs-assert-added-error=".error-msg">Login</button>
```

### 3. Multiple DOM changes (same outcome)
Checkout success = order confirmation appears AND cart is emptied. Error = error message.

```html
<button fs-assert="checkout/submit" fs-trigger="click"
  fs-assert-added-success=".confirmation"
  fs-assert-removed-success=".cart-items"
  fs-assert-added-error=".checkout-error">Submit</button>
```

### 4. DOM change + sequence validation
Step 2 success = next step visible AND previous step was completed. Error = validation message.

## Design Constraints

- Must be purely declarative (HTML attributes only, no JS)
- Must be backward-compatible — existing single-conditional and grouped assertions must work unchanged
- Should not require inventing a new grouping DSL
- The collector receives individual assertion results — compound logic is agent-side only
- Must work with the existing resolve → dismiss → settle pipeline

## Possible Approaches

### A. Implicit AND within same condition key

All assertions sharing the same condition key AND assertion key are treated as a compound group. The outcome succeeds only when ALL members pass. If any member fails or times out, the entire outcome fails. When one outcome's member resolves, check if all members of that outcome have resolved — if so, dismiss the competing outcome.

**Semantics:**
- `added-success` + `emitted-success` → same outcome (`success`). Both must pass.
- `added-error` → different outcome (`error`). Competes with `success` group.
- First *complete outcome* (all members passed) wins. Competing outcome's members are dismissed.

**Pros:** No new attributes. Condition keys already exist. Reuses `fs-assert-grouped` to opt into cross-type grouping.
**Cons:** Changes the meaning of condition keys from "individual competitors" to "outcome members." This is a breaking semantic change if anyone has two same-key conditionals that they expect to race independently (unlikely but technically breaking).

**Migration risk:** Low. The only scenario where this changes behavior is when the same condition key appears on multiple types WITH `fs-assert-grouped`. Without `grouped`, same-key different-type conditionals are already independent (not siblings). The change only affects the `grouped` + same-key + multiple-types combination, which is currently broken anyway (first wins, others dismissed).

### B. Explicit compound attribute (`fs-assert-compound="outcome-name"`)

A new attribute that explicitly groups assertions into compound outcomes:

```html
<button fs-assert="todos/add-item" fs-trigger="click"
  fs-assert-compound="success"
  fs-assert-added-success=".todo-item"
  fs-assert-emitted-success="todo:added"
  fs-assert-added-error=".add-error">Add</button>
```

**Pros:** Explicit, no semantic change to existing behavior.
**Cons:** Another attribute to learn. Overlaps with `fs-assert-grouped` in confusing ways. What does `compound` mean without `grouped`?

### C. Condition key groups with `/` separator

Use the condition key itself to express AND: `success/dom` and `success/event` share the `success` prefix and form a compound. `error` stands alone.

```html
fs-assert-added-success-dom=".todo-item"
fs-assert-emitted-success-event="todo:added"
fs-assert-added-error=".add-error"
```

**Pros:** No new attributes. Hierarchical keys are already a Faultsense pattern (assertion keys use `/`).
**Cons:** Condition key parsing gets complex. The `-` separator between type and condition key is already used — adding sub-keys within condition keys creates ambiguity (`success-dom` could be condition key `success-dom` or compound group `success` member `dom`).

### D. OOB-based workaround (no new feature)

Use OOB to chain the secondary check off the primary:

```html
<!-- Primary: conditional -->
<button fs-assert="todos/add-item" fs-trigger="click"
  fs-assert-added-success=".todo-item"
  fs-assert-added-error=".add-error">Add</button>

<!-- Secondary: OOB fires when add-item passes, checks custom event -->
<div fs-assert="todos/add-event-check"
  fs-assert-oob="todos/add-item"
  fs-assert-emitted="todo:added"
  style="display:none"></div>
```

**Pros:** Works today, no changes needed.
**Cons:** Splits the assertion across two elements. The OOB element is invisible boilerplate. The `emitted` assertion on the OOB element creates a timing issue — the custom event may have already fired before the OOB assertion is created. (Same synchronous dispatch limitation.)

## Recommendation

**Approach A** (implicit AND within same condition key) is the cleanest if the semantic change is acceptable. It requires no new attributes and aligns with the intuition that `success` means "the success outcome" not "one specific success check."

**Approach D** (OOB workaround) works today for DOM-only compound checks but has timing issues with `emitted`.

**Suggested next step:** Validate Approach A by implementing a prototype and running it against the existing conditional test suite to identify any behavioral changes. If the test suite passes unchanged (because no existing tests use same-key + grouped + multiple-types), the semantic change is safe.

## Open Questions

1. What happens when one member of a compound outcome fails (modifier mismatch) but another passes? Does the outcome fail immediately, or wait for the timeout?
2. Should the collector receive individual member results or a single compound result?
3. How does SLA timeout work — per member or per outcome?
4. Can different members of the same compound outcome have different timeouts?
