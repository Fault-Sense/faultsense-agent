---
title: "feat: Replace fs-assert-grouped with fs-assert-mutex"
type: feat
status: active
date: 2026-03-28
origin: docs/brainstorms/2026-03-28-compound-conditional-outcomes-requirements.md
---

# feat: Replace fs-assert-grouped with fs-assert-mutex

## Overview

Replace `fs-assert-grouped` with `fs-assert-mutex` — a new attribute with three modes for controlling mutual exclusion of conditional assertions. This is a breaking API change (pre-public-release). All references to `grouped` are removed, no deprecation period.

## Modes

| Value | Behavior |
|---|---|
| `"each"` | All conditional assertions race. First to resolve wins, all others dismissed. Replaces `fs-assert-grouped=""`. |
| `"conditions"` | Condition keys compete as outcome groups. First key to resolve wins, all assertions with different keys dismissed. Same-key assertions resolve independently. |
| `"success,error"` | Selective: only listed keys compete. Unlisted keys are invisible to the mutex. |

No empty default. `fs-assert-mutex` requires an explicit value.

## Acceptance Criteria

- [ ] `fs-assert-mutex="each"` behaves identically to current `fs-assert-grouped=""`
- [ ] `fs-assert-mutex="conditions"` dismisses different-key assertions, keeps same-key assertions pending
- [ ] `fs-assert-mutex="success,error"` only creates mutex between listed keys; unlisted keys resolve independently
- [ ] All references to `grouped` removed from source, tests, examples, and docs
- [ ] No empty default — `fs-assert-mutex=""` logs a warning
- [ ] Todo app updated: delete button uses `mutex="each"`, add button uses `mutex="conditions"` with `emitted-success` + `added-success` vs `added-error`
- [ ] Activity log re-added to todo app with `fs-trigger="event:todo:added"`
- [ ] CLAUDE.md and llms-full.txt updated with new `mutex` API, examples, and migration notes
- [ ] All existing conditional/grouped tests pass with `mutex` equivalents

## Step 1: Rename attribute and update types

**Files:** `src/config.ts`, `src/types.ts`

In `supportedAssertions.modifiers` (config.ts), replace `"grouped"` with `"mutex"`.

In `Assertion` interface (types.ts), replace `grouped?: boolean` with:
```ts
mutex?: "each" | "conditions";
mutexKeys?: string[];
```

## Step 2: Update parser

**File:** `src/processors/elements.ts`

In `createAssertions`, replace the `grouped` parsing with `mutex` parsing:
- Value `"each"` → `mutex: "each"`
- Value `"conditions"` → `mutex: "conditions"`
- Comma-separated value (e.g., `"success,error"`) → `mutex: "conditions"`, `mutexKeys: ["success", "error"]`
- Empty value → `console.warn` and ignore

Remove all references to the old `grouped` field.

## Step 3: Update sibling resolution

**File:** `src/assertions/assertion.ts`

Replace `getSiblingGroup` logic. Current:
```ts
(assertion.grouped || a.type === assertion.type) &&
a.conditionKey !== undefined &&
a !== assertion
```

New:
```ts
a.conditionKey !== undefined &&
a !== assertion &&
isMutexSibling(assertion, a)
```

Where `isMutexSibling`:
- No mutex → same-type siblings only (`a.type === assertion.type`)
- `"each"` → all conditionals are siblings (current `grouped` behavior)
- `"conditions"` without `mutexKeys` → different condition key = sibling
- `"conditions"` with `mutexKeys` → both resolved and candidate must have keys in the mutex list, AND different keys

## Step 4: Update timeout handling

**File:** `src/assertions/timeout.ts`

The conditional timeout logic references `grouped`. Update to use `mutex`:
```ts
// Current: !newAssertion.conditionKey || !activeAssertions.some(... a.type === newAssertion.type) && a.conditionKey !== undefined && a.timeoutId !== undefined)
// Change grouped references to mutex
```

**File:** `src/assertions/manager.ts`

In `enqueueAssertions`, the conditional timeout creation checks `newAssertion.grouped`. Update to check `newAssertion.mutex`.

## Step 5: Update collector/panel

**Files:** `src/assertions/server.ts`, `src/collectors/panel.ts`

Replace any `grouped` references in the API payload or panel display with `mutex`.

## Step 6: Update all tests

**Files:**
- `tests/assertions/conditionals/resolution.test.ts` — rename `grouped` → `mutex="each"` in all test HTML
- `tests/assertions/stable.test.ts` — same
- `tests/assertions/oob.test.ts` — same
- `tests/assertions/route.test.ts` — same
- `tests/assertions/online-offline.test.ts` — same

Add new tests for `mutex="conditions"` mode:
- Same-key assertions survive when competing key resolves
- Different-key assertions are dismissed
- Selective mutex only affects listed keys
- Unlisted keys resolve independently

## Step 7: Update todo app

**Files:**
- `examples/todolist-tanstack/src/components/TodoItem.tsx` — replace `fs-assert-grouped=""` with `fs-assert-mutex="each"` on delete button
- `examples/todolist-tanstack/src/routes/login.tsx` — replace `fs-assert-grouped=""` with `fs-assert-mutex="each"`
- `examples/todolist-tanstack/src/components/AddTodo.tsx` — add `fs-assert-mutex="conditions"` with `fs-assert-emitted-success="todo:added"` and `fs-assert-added-error=".add-error"`. Re-add custom event dispatch on success.
- `examples/todolist-tanstack/src/components/ActivityLog.tsx` — re-add activity log component with `fs-trigger="event:todo:added"`
- `examples/todolist-tanstack/src/routes/todos.tsx` — re-add ActivityLog import and usage

## Step 8: Update docs

**Files:** `CLAUDE.md`, `llms-full.txt`

- Replace all `fs-assert-grouped` references with `fs-assert-mutex`
- Document all three modes with examples
- Update quick reference table
- Update key mistakes section
- Add examples showing `conditions` mode with multi-assertion outcomes

## Sources

- Brainstorm: `docs/brainstorms/2026-03-28-compound-conditional-outcomes-requirements.md`
- Current grouped implementation: `src/assertions/assertion.ts:76-88` (getSiblingGroup)
- Conditional parsing: `src/processors/elements.ts:371-375` (grouped field in createAssertions)
- Manager timeout logic: `src/assertions/manager.ts:121-134`
