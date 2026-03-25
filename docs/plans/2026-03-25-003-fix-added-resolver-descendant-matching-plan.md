---
title: "fix: Added resolver should match descendants of added subtrees"
type: fix
status: completed
date: 2026-03-25
---

# fix: Added resolver should match descendants of added subtrees

## Problem

`mutations.ts:14-17` pushes only direct `addedNodes` from the MutationObserver into the `addedElements` list. When a framework adds a wrapper element containing the target (e.g., React conditional rendering swaps a subtree), the target element is a descendant of the added node — not in `addedNodes` itself.

**Reproduction:**
```html
<!-- React component with conditional rendering -->
{isEditing ? (
  <div class="edit-row">           <!-- THIS is the addedNode -->
    <input class="todo-edit-input"> <!-- THIS is the target — a descendant -->
  </div>
) : (
  <span class="todo-text">...</span>
)}
```

```html
<button fs-assert="todos/edit-item" fs-trigger="click"
  fs-assert-added=".todo-edit-input">Edit</button>
```

Clicking Edit adds `<div class="edit-row">` as a direct child of `.todo-item`. The `<input class="todo-edit-input">` is inside it. The `added` resolver checks `addedElements` for `.todo-edit-input` — not found. Assertion times out.

## Fix

Two options for where to flatten:

### Option A: Flatten in `mutations.ts` (affects all resolvers)

```typescript
// mutations.ts:14-17
mutation.addedNodes.forEach((node) => {
  if ((node as HTMLElement).getAttribute) {
    addedElements.push(node as HTMLElement);
    // Also include descendants so `added` resolver can match nested targets
    const descendants = (node as HTMLElement).querySelectorAll?.('*');
    if (descendants) {
      addedElements.push(...Array.from(descendants) as HTMLElement[]);
    }
  }
});
```

Same pattern for `removedNodes` — a removed wrapper means its descendants were also removed.

**Pro:** Simple, uniform — every resolver that processes `addedElements` or `removedElements` benefits.
**Con:** Increases the size of the element lists. For a wrapper with 50 children, all 50 are added to the list. The `handleAssertion` loop iterates more elements.

### Option B: Flatten in the resolver matcher (affects only `added`/`removed`)

Change the `_default` matcher in `dom.ts` to also check descendants:

```typescript
_default: (assertion: Assertion) => (el: HTMLElement) =>
  el.matches(assertion.typeValue) ||
  el.querySelector?.(assertion.typeValue) !== null,
```

**Pro:** No change to mutation processing. Matcher is lazy — only checks descendants when the element itself doesn't match.
**Con:** `querySelector` runs on each element during matching, potentially slower for large subtrees.

### Recommendation: Option A

Flattening in `mutations.ts` is simpler, matches how `updatedElements` already works (the mutation target + implicit subtree), and benefits both `added` and `removed` types. The performance concern is negligible — MutationObserver batches mutations, and typical framework subtree swaps involve a handful of elements, not thousands.

## Scope

- `src/processors/mutations.ts:14-17` (addedNodes) and `19-22` (removedNodes) — flatten to include descendants
- `tests/assertions/added.test.ts` — add test for nested target inside added wrapper
- Optionally restore `fs-assert-added=".todo-edit-input"` in the demo once fixed

## Acceptance Criteria

- [ ] Added subtree descendants are included in `addedElements`
- [ ] Removed subtree descendants are included in `removedElements`
- [ ] `fs-assert-added=".todo-edit-input"` passes when the input is inside an added wrapper div
- [ ] Existing `added` and `removed` tests still pass
- [ ] New test: target element is a descendant of added node → assertion passes
- [ ] New test: target element is a descendant of removed node → assertion passes

## Context

- `src/processors/mutations.ts:14-17` — where `addedNodes` are collected
- `src/resolvers/dom.ts:191-192` — where `addedElements` are passed to the resolver
- `src/resolvers/dom.ts:39-40` — `_default` matcher used by `added` type
- `tests/assertions/added.test.ts` — existing test (2 tests: pass + fail)
- `tests/assertions/removed.test.ts` — existing test (2 tests: pass + fail)
- Related: `docs/plans/2026-03-25-002-fix-updated-resolver-multi-element-matching-plan.md` — sibling fix for `updated` type
