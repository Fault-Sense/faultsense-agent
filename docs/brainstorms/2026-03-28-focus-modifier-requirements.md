---
date: 2026-03-28
topic: focus-modifier
---

# Focus Modifiers (`focused`, `focused-within`)

## Problem Frame

Faultsense cannot assert focus state. Focus management is a core correctness concern for accessibility (modal focus traps, error field focus, skip-to-content links, dialog return focus) and is one of the most common e2e test assertions. Without `focused` and `focused-within` modifiers, these assertions require custom instrumentation outside the declarative model.

## Requirements

### focused modifier

- R1. **`[focused=true]` modifier** — New inline modifier that checks `document.activeElement === el`. Accepts `true` or `false`. `[focused=true]` passes when the element has focus; `[focused=false]` passes when it does not. Follows the same `(el, modValue) => [boolean, FailureReasonCode]` pattern as `checked`.

- R2. **Implementation in `modifiersMap`** — Drop-in entry:
  ```
  focused: (el, modValue) => [
    (document.activeElement === el) === (modValue === "true"),
    "focused"
  ]
  ```

### focused-within modifier

- R3. **`[focused-within=true]` modifier** — New inline modifier that checks `el.matches(':focus-within')`. Accepts `true` or `false`. Useful for asserting that focus is somewhere inside a container (e.g., a modal, a form section) without specifying the exact focused element.

- R4. **Implementation in `modifiersMap`** — Drop-in entry:
  ```
  "focused-within": (el, modValue) => [
    el.matches(":focus-within") === (modValue === "true"),
    "focused-within"
  ]
  ```

### Registration

- R5. **Type registration** — Add `"focused"` and `"focused-within"` to:
  - `domModifiers` const array in `src/types.ts` (line 67)
  - `inlineModifiers` array in `src/config.ts` (line 49)

- R6. **Failure messages** — Add cases to `getFailureReasonForAssertion` in `src/resolvers/dom.ts`:
  - `focused`: `Expected focused=${expected.modifiers["focused"]}`
  - `focused-within`: `Expected focused-within=${expected.modifiers["focused-within"]}`

### MutationObserver limitation

- R7. **Focus changes do not trigger MutationObserver.** Like `value-matches`, the `focused` and `focused-within` modifiers only evaluate reliably when resolution is driven by an event trigger (`click`, `blur`, `submit`, `focus` if added) or by a collection resolver (GC sweep, immediate resolver, document resolver). DOM mutation-driven resolution will not fire on focus changes alone. This must be documented clearly — same caveat as `value-matches` and `checked`.

### Interaction with future `focus` trigger

- R8. **`fs-trigger="focus"` enablement** — The `focus` event is currently commented out in `supportedEvents` (`src/config.ts`, line 74). If the expanded trigger set adds `focus`, then `[focused=true]` becomes fully reliable as a focus-trigger-driven check. Example: `fs-trigger="focus" fs-assert-visible="#help-panel[focused-within=true]"`. This feature does not depend on `focus` trigger support but is significantly more useful with it.

## Usage Examples

### Modal focus trap
After opening a modal, assert the first focusable element receives focus:
```html
<button fs-assert="dialog/open-modal" fs-trigger="click"
  fs-assert-visible="#modal .close-btn[focused=true]"
  fs-assert-timeout="500">Open Modal</button>
```

### Form validation error focus
After submitting a form with errors, assert the first error field gets focus:
```html
<form fs-assert="form/submit-validation" fs-trigger="submit"
  fs-assert-visible=".field-error:first-of-type input[focused=true]">
```

### Skip-to-content link
After clicking skip link, main content area receives focus:
```html
<a href="#main" fs-assert="a11y/skip-to-content" fs-trigger="click"
  fs-assert-visible="#main[focused=true]"
  fs-assert-timeout="300">Skip to content</a>
```

### Dialog close — return focus to trigger
After closing a dialog, assert the original trigger element regains focus (OOB pattern):
```html
<button id="open-settings"
  fs-assert="dialog/return-focus"
  fs-assert-oob="dialog/close-settings"
  fs-assert-visible="[focused=true]">Settings</button>
```

### Focus within a container
Assert that focus is somewhere inside a form section after tab navigation:
```html
<fieldset id="billing"
  fs-assert="checkout/billing-focused"
  fs-assert-oob="checkout/shipping-complete"
  fs-assert-visible="[focused-within=true]">
```

## Edge Cases

- **Non-focusable elements**: `[focused=true]` on a `<div>` without `tabindex` will always fail (it can never receive focus). This is correct behavior — it surfaces a real bug (missing `tabindex`). No special handling needed.
- **`[focused=false]` on non-focusable elements**: Always passes. Correct and unsurprising.
- **Shadow DOM**: `document.activeElement` returns the shadow host, not the focused element inside the shadow tree. `[focused=true]` on a shadow host passes when anything inside it is focused. `el.matches(':focus-within')` also works across shadow boundaries. No special handling needed — the behavior is correct for the common case. Deep shadow DOM focus inspection is out of scope.
- **`focused` with `removed` type**: Nonsensical — a removed element cannot have focus. No guard needed; it will simply never pass, which is correct.
- **`focused` with `invariant` trigger**: Valid pattern for "this element should always have focus" (rare but legal). Same MutationObserver limitation applies — invariant resolution is GC-driven, so focus loss is detected on the next GC sweep, not instantly.
- **iframe focus**: `document.activeElement` returns the `<iframe>` element when focus is inside the iframe. `[focused=true]` on an iframe correctly detects this. Cross-origin iframe internals are inaccessible, which is a browser security boundary, not a Faultsense limitation.

## Success Criteria

- Both modifiers slot into the existing modifier architecture with no changes to the resolver loop structure
- Inline bracket syntax works: `fs-assert-visible="#modal .close-btn[focused=true]"`
- Self-referencing works: `fs-assert-visible="[focused=true]"` checks the target element itself
- Existing modifiers are unaffected
- Failure messages are clear and actionable

## Scope Boundaries

- No `focus` trigger enablement in this feature — that is a separate trigger expansion
- No `:focus-visible` modifier — CSS pseudo-class matching via `el.matches(':focus-visible')` is possible but deferred until there is a concrete use case
- No deep shadow DOM focus traversal via `shadowRoot.activeElement` chaining
- No automatic focus event listener injection — modifiers are passive checks, not event sources

## Key Decisions

- **Two separate modifiers** (`focused` and `focused-within`) rather than one with sub-options. Different DOM APIs (`document.activeElement` vs `:focus-within`), different semantics (exact element vs container), clean separation.
- **Same MutationObserver caveat as `value-matches`** — documented, not worked around. The modifier evaluates correctly when resolution fires; the limitation is on what triggers resolution.
- **No special handling for non-focusable elements** — failing `[focused=true]` on a non-focusable element is the correct signal. It means the developer's assumption about focusability is wrong.

## Outstanding Questions

### Deferred to Planning

- [Affects R8][Dependency] Should `focus` trigger enablement be bundled with this feature or remain a separate work item? The modifiers are useful without it (event-triggered and OOB patterns), but the `focus` trigger makes them significantly more ergonomic.
- [Affects R7][Documentation] Should the MutationObserver limitation be surfaced as a parse-time warning (like `count` on self-referencing) when `focused` is used with mutation-only assertion types (`added`, `updated`), or is documentation sufficient?

## Next Steps

-> `/ce:plan` for structured implementation planning
