---
date: 2026-03-25
topic: oob-assertions
---

# Out-of-Band (OOB) Assertions

## Problem Frame

Faultsense assertions are tightly coupled to trigger elements. Side effects — count labels, totals, notifications, breadcrumbs — that update as a consequence of an action can only be asserted by the trigger element itself. This forces developers to prop-drill data into unrelated components to compute expected values, creating code smell and fragile coupling that exists solely for monitoring.

## Requirements

- R1. A new trigger mechanism `fs-assert-oob-{type}` that fires when a named parent assertion passes. Syntax: `fs-assert-oob-{type}="key1,key2,..."` where each key is an `fs-assert` key of a parent assertion. When any listed parent passes, the OOB assertion activates.
- R2. OOB assertions only fire when the parent assertion **passes**. If the parent fails or times out, the OOB assertion is not created.
- R3. The OOB element needs `fs-assert` (its own key) and at least one assertion type attribute. The assertion type's selector is optional — if omitted, the element targets itself.
- R4. Multiple parent keys are comma-separated in a single attribute value: `fs-assert-oob-updated="todos/add-item,todos/toggle-complete,todos/remove-item"`.
- R5. OOB assertions are discovered by scanning the DOM when a parent assertion passes. The agent finds elements with `fs-assert-oob-*` attributes whose value contains the passing assertion's key, then creates and enqueues assertions for them.
- R6. OOB assertions follow the same resolution pipeline as regular assertions (timeout, modifiers, DOM resolvers). They are not special-cased after creation.

## Success Criteria

- A count label can assert its text updated correctly after a toggle, add, or delete — without the trigger component knowing about the count label or its expected value.
- The todolist demo uses OOB assertions on `#todo-count` triggered by toggle/add/delete passes.
- No prop drilling or component coupling required for side-effect assertions.

## Scope Boundaries

- OOB assertions fire on parent pass only — no fire-on-fail or fire-on-settle.
- OOB elements are scanned from the DOM at trigger time, not pre-registered. This means they must exist in the DOM when the parent passes.
- No chaining: an OOB assertion passing does not trigger further OOB assertions.

## Key Decisions

- **Selector optional, defaults to self**: If the assertion type value is just modifiers (e.g., `fs-assert-updated="[text-matches=\\d+/\\d+ remaining]"`), the element itself is the target. If a selector is provided, use it.
- **Pass-only trigger**: Simpler mental model. If the action failed, side-effect assertions are irrelevant.
- **Comma-separated multiple parents**: One attribute, multiple triggers. Avoids the HTML duplicate-attribute-name problem.
- **DOM scan at trigger time**: No pre-registration. OOB elements are found via `querySelectorAll('[fs-assert-oob-*]')` when a parent passes. This is simple and handles dynamically rendered OOB elements.

## Example

```html
<!-- Trigger element (in TodoItem component) -->
<input type="checkbox"
  fs-assert="todos/toggle-complete"
  fs-trigger="change"
  fs-assert-updated=".todo-item[classlist=completed:true]" />

<!-- OOB element (in a completely separate component, no prop drilling) -->
<div id="todo-count"
  fs-assert="todos/count-updated"
  fs-assert-oob-updated="todos/toggle-complete,todos/add-item,todos/remove-item"
  fs-assert-updated="[text-matches=\d+/\d+ remaining]">
  2/3 remaining
</div>
```

When `todos/toggle-complete` passes → agent scans DOM for OOB elements referencing that key → finds `#todo-count` → creates an `updated` assertion on it → checks `[text-matches=\d+/\d+ remaining]` → passes or fails independently.

## Outstanding Questions

### Deferred to Planning
- [Affects R5][Technical] Performance of DOM scan on every assertion pass. Should we cache OOB elements, or is `querySelectorAll` fast enough for typical page sizes?
- [Affects R3][Technical] How does self-targeting work with the existing `parseTypeValue` function? The value `"[text-matches=\\d+]"` has no selector prefix — the parser needs to handle empty selector.
- [Affects R5][Technical] The DOM scan query selector for `fs-assert-oob-*` — wildcard attribute name selectors aren't supported in CSS. May need to scan for each known type (`fs-assert-oob-updated`, `fs-assert-oob-added`, etc.) or use a different discovery mechanism.

## Next Steps

→ `/ce:plan` for structured implementation planning
