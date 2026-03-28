---
date: 2026-03-27
topic: property-primitives-and-stable
---

# Property Assertion Primitives & fs-assert-stable

## Problem Frame

Faultsense lacks the three most common e2e assertion primitives — input values, element counts, and disabled state — plus has no way to assert that UI *settled* after an action (no flickering, no re-renders, no rollbacks). These are the highest-value gaps identified in the e2e gap analysis that remain unaddressed.

## Requirements

### Property Assertion Primitives

- R1. **`value-matches` modifier** — New inline modifier that reads the live `el.value` DOM property (not the HTML attribute) and tests it against a regex pattern. Follows the same pattern as `text-matches`. Only meaningful on form controls (`input`, `textarea`, `select`); returns false on elements without a `.value` property.

- R2. **`checked` modifier** — New inline modifier that reads the live `el.checked` DOM property (boolean). Accepts `true` or `false` as the modifier value. Needed because `attrs-match` uses `getAttribute('checked')` which returns the initial HTML attribute, not the live state. Only meaningful on checkboxes and radio buttons.

- R3. **`count` / `count-min` / `count-max` modifiers** — New selector-level modifiers that assert cardinality of `querySelectorAll(selector)` results. `count=N` (exact), `count-min=N` (at least), `count-max=N` (at most). Evaluated before per-element modifiers — count checks the selector match set, then any remaining modifiers run independently per element. Self-referencing with count is nonsensical (count of self is always 1) and should require an explicit selector.

- R4. **`disabled` modifier** — New inline modifier that checks disabled state via two sources: native `.disabled` property (form elements) and `aria-disabled="true"` attribute. Accepts `true` or `false`. Does NOT check `inert`, `pointer-events`, or ancestor state in v1.

### fs-assert-stable

- R5. **`stable` assertion type** — New assertion type that is the temporal inverse of `updated`. Uses the exact same resolver pipeline and mutation matching as `updated`, but with inverted pass/fail semantics. When the `updated` resolver would pass (mutation matches), `stable` fails. When GC/SLA timeout fires (no mutation occurred), `stable` passes instead of failing.

- R6. **Inverted resolution via assertion property** — Assertions for types in a config-level `invertedResolutionTypes` list (e.g., `["stable"]`) get `invertResolution: true` stamped at creation time. `completeAssertion` checks this flag and flips the pass/fail boolean. One line of logic. No changes to resolvers, timeouts, or settlement — the entire `updated` pipeline runs identically, the result is just inverted.

- R7. **Mutation filtering** — The `stable` resolver must ignore Faultsense's own attribute mutations (where `mutation.attributeName` starts with `data-fs-` or `fs-`). All other DOM mutations (childList, attributes, characterData) in the element's subtree cause resolution (which then gets inverted to a failure).

- R8. **Works with any trigger** — `stable` uses the standard trigger model. No special trigger restrictions. Works with event triggers (`click`, `submit`), `mount`, `invariant` (for perpetual "never mutate" monitoring), and OOB. The OOB pattern (trigger stable after an expected mutation passes) is the recommended best practice for post-action stability checks but is not enforced.

## Success Criteria

- All four new modifiers (`value-matches`, `checked`, `count*`, `disabled`) slot into the existing modifier architecture with no changes to the resolver loop structure (except the pre-loop selector-level check for `count`)
- `stable` assertions use the same resolver as `updated` with inverted pass/fail via config-level `invertedResolutionTypes`
- `stable` + `invariant` trigger works as a perpetual stability monitor
- Existing assertion types and modifiers are unaffected

## Scope Boundaries

- No `getComputedStyle` checks for `disabled` (no `pointer-events`, no ancestor `inert`)
- No `checked` inference from `value-matches` — they are separate modifiers for separate properties
- No negation modifier (`[not]`) — `stable` is its own type, not a generic negation mechanism
- `count` does not filter by other modifiers — it counts selector matches only
- No debouncing or settling delay for `stable` — mutations either happen or they don't

## Key Decisions

- **`stable` is its own assertion type**, not a negation modifier or invariant variant. Cleaner semantics and explicit naming.
- **Inverted resolution via `invertResolution` property on assertion**, driven by config-level `invertedResolutionTypes` list. Stamped at creation, flipped in `completeAssertion`. One line of logic, zero resolver changes.
- **`count` checks selector matches before per-element modifiers**. Simpler mental model: count = "how many elements match the CSS selector."
- **`disabled` checks native + ARIA only** in v1. Covers 95% of cases with zero perf risk.
- **`checked` is a separate modifier** from `value-matches`. `el.value` and `el.checked` are different DOM properties; `getAttribute('checked')` doesn't reflect live state.
- **`stable` uses standard trigger model**. No OOB-only restriction. OOB is a best practice, not a requirement.

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Should `count` on a self-referencing assertion (no selector, only modifiers) warn at parse time or silently pass with count=1?
- [Affects R5][Technical] For `stable` + `invariant` combo: invariant re-arms after state transitions. When `stable`'s inverted resolution produces a fail (mutation detected), does invariant's existing re-arm mechanism handle this correctly, or does the inversion confuse the state-transition model?
- [Affects R7][Needs research] Are there other attribute mutations besides `data-fs-*` that Faultsense or common third-party libs inject that should be filtered from `stable` checks?

## Next Steps

→ `/ce:plan` for structured implementation planning
