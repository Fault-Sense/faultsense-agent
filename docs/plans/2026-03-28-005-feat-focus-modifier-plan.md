---
title: "feat: Focus Modifier"
type: feat
status: completed
date: 2026-03-28
origin: docs/brainstorms/2026-03-28-focus-modifier-requirements.md
---

# feat: Focus Modifier ([focused], [focused-within])

Two new inline modifiers for asserting focus state. `[focused=true/false]` checks `document.activeElement === el`. `[focused-within=true/false]` checks `el.matches(':focus-within')`. Drop-in additions to the existing modifier architecture with no structural changes.

## Acceptance Criteria

- `[focused=true]` passes when `document.activeElement === el`; `[focused=false]` passes when it does not
- `[focused-within=true]` passes when `el.matches(':focus-within')`; `[focused-within=false]` passes when it does not
- Inline bracket syntax works: `fs-assert-visible="#modal .close-btn[focused=true]"`
- Self-referencing works: `fs-assert-visible="[focused=true]"`
- Failure messages are clear: `Expected focused=true`, `Expected focused-within=true`
- Existing modifiers unaffected
- Same MutationObserver limitation as `value-matches` and `checked` (documented, not worked around)

## Context

Focus management is a core accessibility correctness concern (modal focus traps, error field focus, skip-to-content, dialog return focus) and one of the most common e2e test assertions. Without these modifiers, focus assertions require custom instrumentation outside the declarative model.

The `focus` event trigger is currently commented out in `supportedEvents` (config.ts:74). These modifiers do not depend on it but become more ergonomic if it is enabled later (separate work item).

## MVP

Four files changed. No new files.

### 1. `src/types.ts` line 67 — add to `domModifiers`

```ts
export const domModifiers = ["text-matches", "classlist", "attrs-match", "value-matches", "checked", "disabled", "count", "count-min", "count-max", "focused", "focused-within"] as const;
```

### 2. `src/config.ts` line 49 — add to `inlineModifiers`

```ts
export const inlineModifiers = ["text-matches", "classlist", "value-matches", "checked", "disabled", "count", "count-min", "count-max", "focused", "focused-within"];
```

### 3. `src/resolvers/dom.ts` — add to `modifiersMap` (after `disabled` entry)

```ts
focused: (el: HTMLElement, modValue: string) => [
  (document.activeElement === el) === (modValue === "true"),
  "focused",
],
"focused-within": (el: HTMLElement, modValue: string) => [
  el.matches(":focus-within") === (modValue === "true"),
  "focused-within",
],
```

### 4. `src/resolvers/dom.ts` — add to `getFailureReasonForAssertion` switch (before `default`)

```ts
case "focused":
  return `Expected focused=${expected.modifiers["focused"]}`;
case "focused-within":
  return `Expected focused-within=${expected.modifiers["focused-within"]}`;
```

### 5. Tests

Add tests in the existing resolver test file covering:
- `[focused=true]` on focused element passes
- `[focused=true]` on non-focused element fails with correct message
- `[focused=false]` on non-focused element passes
- `[focused-within=true]` on container with focused descendant passes
- `[focused-within=false]` on container without focused descendant passes
- Self-referencing syntax: `fs-assert-visible="[focused=true]"`
- Combined with other modifiers: `[focused=true][text-matches=Submit]`

## Sources

- Brainstorm: `docs/brainstorms/2026-03-28-focus-modifier-requirements.md`
- Modifier pattern: `src/resolvers/dom.ts` (`checked` and `disabled` entries in `modifiersMap`)
- Type registration: `src/types.ts:67` (`domModifiers`), `src/config.ts:49` (`inlineModifiers`)
