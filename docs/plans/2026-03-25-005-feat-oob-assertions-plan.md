---
title: "feat: Out-of-band (OOB) assertions triggered by parent assertion pass"
type: feat
status: completed
date: 2026-03-25
origin: docs/brainstorms/2026-03-25-oob-assertions-requirements.md
---

# feat: Out-of-band (OOB) assertions triggered by parent assertion pass

## Overview

Add `fs-assert-oob-{type}` — a new trigger mechanism where an element declares "when assertion key X passes, check this assertion on me." This decouples side-effect validations (count labels, totals, notifications) from trigger elements, eliminating prop drilling. (see origin)

## Problem Statement

Assertions are coupled to trigger elements. To validate a count label updates after a toggle, you must prop-drill count data into the toggle component to compute expected text. OOB assertions let the count label declare its own assertion, triggered by a parent assertion's success.

## Proposed Solution

```html
<!-- Trigger element (TodoItem) -->
<input type="checkbox"
  fs-assert="todos/toggle-complete"
  fs-trigger="change"
  fs-assert-updated=".todo-item[classlist=completed:true]" />

<!-- OOB element (completely separate component, no prop drilling) -->
<div id="todo-count"
  fs-assert="todos/count-updated"
  fs-assert-oob-updated="todos/toggle-complete,todos/add-item,todos/remove-item"
  fs-assert-updated="[text-matches=\d+/\d+ remaining]">
  2/3 remaining
</div>
```

When `todos/toggle-complete` passes → agent scans DOM → finds `#todo-count` with matching OOB attribute → creates `updated` assertion → resolves via normal pipeline.

## Technical Approach

### Changes by file

#### 1. `src/config.ts` — Add OOB attribute prefix

```typescript
export const oobPrefix = `${assertionPrefix.types}oob-`;
// Produces: "fs-assert-oob-"
```

#### 2. `src/assertions/manager.ts:settle()` — Hook OOB triggering after assertion passes

The `settle` function already processes completed assertions and sends them to collectors. After sending, scan for OOB elements triggered by any passing assertion:

```typescript
const settle = (completeAssertions: CompletedAssertion[]): void => {
  const toSettle = getAssertionsToSettle(completeAssertions);

  // ... existing cleanup and send logic ...

  // Trigger OOB assertions for any that passed
  const passed = toSettle.filter(a => a.status === "passed");
  if (passed.length > 0) {
    const oobAssertions = findAndCreateOobAssertions(passed);
    enqueueAssertions(oobAssertions); // reuse existing enqueue path
  }
};
```

#### 3. `src/processors/oob.ts` — New file: OOB discovery and assertion creation

```typescript
export function findAndCreateOobAssertions(
  passedAssertions: CompletedAssertion[]
): Assertion[]
```

For each passed assertion key:
1. Build a compound CSS selector from `domAssertions`: `[fs-assert-oob-added],[fs-assert-oob-removed],[fs-assert-oob-updated],[fs-assert-oob-visible],[fs-assert-oob-hidden],[fs-assert-oob-loaded]`
2. `document.querySelectorAll(selector)` — find all OOB elements
3. For each OOB element, check if its `fs-assert-oob-{type}` attribute value (comma-separated) contains the passed assertion's key
4. If matched, parse the element's assertion type attribute to get selector + modifiers
5. Handle self-targeting: if the parsed selector is empty, use the OOB element itself as the target (the element's own selector, e.g., `#todo-count`)
6. Create and return the assertion object (same shape as regular assertions, no `httpPending`, standard timeout)
7. Mark created assertions to prevent OOB chaining (see scope boundary)

#### 4. `src/processors/elements.ts:parseTypeValue()` — Handle empty selector

Currently returns `{ selector: raw, modifiers: {} }` when no bracket is found. When the value starts with `[`, `selector` is already `""` (empty string). No change needed — the caller in `oob.ts` checks for empty selector and substitutes self.

#### 5. `src/assertions/manager.ts:enqueueAssertions()` — Extract from existing flow

The existing `enqueueNewAssertions` function in the manager handles dedup, timeout setup, and adding to `activeAssertions`. Extract or expose it so `settle` can call it for OOB assertions. The OOB assertions enter the same pipeline — they get timeouts, go through DOM resolvers on next mutation, and settle normally.

#### 6. Anti-chaining guard

OOB assertions that pass should NOT trigger further OOB scans. Add a flag `oob: true` on OOB-created assertions. In `settle`, filter out OOB assertions before scanning for new OOB triggers:

```typescript
const passed = toSettle.filter(a => a.status === "passed" && !a.oob);
```

### Demo update

Update `examples/todolist-tanstack/src/routes/index.tsx` — add OOB attributes to `#todo-count`:

```html
<div id="todo-count"
  fs-assert="todos/count-updated"
  fs-assert-oob-updated="todos/toggle-complete,todos/add-item,todos/remove-item"
  fs-assert-updated="[text-matches=\d+/\d+ remaining]">
  {uncompleted}/{todos.length} remaining
</div>
```

No prop drilling. No changes to TodoItem, TodoList, or AddTodo.

## Acceptance Criteria

- [ ] `fs-assert-oob-{type}="key1,key2"` triggers an assertion when any listed parent key passes
- [ ] OOB assertions do NOT fire when parent fails or times out
- [ ] Self-targeting works: empty selector in assertion type means check the OOB element itself
- [ ] Explicit selector works: OOB can target a different element if a selector is provided
- [ ] Multiple parent keys (comma-separated) all trigger the same OOB assertion independently
- [ ] OOB assertions follow normal resolution pipeline (timeout, modifiers, DOM resolvers)
- [ ] No OOB chaining: an OOB assertion passing does not trigger further OOB assertions
- [ ] Todolist demo `#todo-count` uses OOB assertions without prop drilling
- [ ] Existing tests unaffected
- [ ] New tests: OOB fires on parent pass, OOB skipped on parent fail, multiple parents, self-targeting, anti-chaining

## Deferred Question Resolutions

- **DOM scan performance**: `querySelectorAll` with compound attribute selector is fast for typical pages. No caching for v1.
- **Self-targeting**: `parseTypeValue("[text-matches=\\d+]")` returns `selector: ""`. The OOB processor substitutes the element's own identity.
- **Wildcard attribute scan**: Build compound selector from `domAssertions` array: `[fs-assert-oob-added],[fs-assert-oob-removed],...`

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-25-oob-assertions-requirements.md](docs/brainstorms/2026-03-25-oob-assertions-requirements.md) — Key decisions: pass-only trigger, selector optional defaults to self, comma-separated multiple parents, DOM scan at trigger time, no chaining.

### Internal References

- `src/assertions/manager.ts:190-207` — `settle()` function where OOB hook goes
- `src/assertions/manager.ts:77-107` — `enqueueNewAssertions` logic to reuse
- `src/processors/elements.ts:43-80` — `parseTypeValue` (handles empty selector already)
- `src/config.ts` — prefix constants
- `src/types.ts` — `Assertion` interface (needs `oob?: boolean` flag)
