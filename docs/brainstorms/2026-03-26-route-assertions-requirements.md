---
date: 2026-03-26
topic: route-assertions
---

# Route Assertions

## Problem Frame

Navigation correctness is asserted in virtually every e2e test (`expect(page.url()).toContain('/dashboard')`) but Faultsense has zero URL coverage. Navigation fails silently — `router.push` swallowed by an error boundary, redirect dropping query params, OAuth callback landing on the wrong page. Route assertions fill this gap using the same declarative HTML attribute model.

## Requirements

- R1. `fs-assert-route="/pattern"` is a new assertion type where `typeValue` is an anchored regex matched against `location.pathname`. The agent wraps the pattern as `^pattern$` internally, so `/dashboard` matches exactly and `/users/\d+` matches dynamic segments. The assertion passes when the URL matches, fails on timeout if it never matches.
- R2. Route assertions support condition keys: `fs-assert-route-success="/dashboard"` and `fs-assert-route-error="/login"` create sibling groups with the same semantics as DOM conditionals.
- R3. Route assertions work with `fs-assert-grouped=""` to form cross-type sibling groups with DOM assertions. Example: `fs-assert-route-success="/dashboard"` + `fs-assert-added-error=".error-msg"` on the same element.
- R4. SPA navigation detection via History API interception: monkey-patch `history.pushState` and `history.replaceState`, listen for `popstate`. The interceptor is always-on from init (mirrors MutationObserver). When a navigation is detected, pending route assertions are evaluated.
- R5. MPA navigation: route assertions with `fs-assert-mpa="true"` persist to localStorage and are evaluated against `window.location.pathname` on the next page load (via `checkAssertions`).
- R6. URL matching targets `location.pathname` only. Optional modifiers `[search=pattern]` and `[hash=pattern]` match against `location.search` and `location.hash` respectively.
- R7. Route is NOT added to `domAssertions` — DOM resolvers ignore it by design. Route has its own resolver.
- R8. Route assertions use the standard timeout system. If the URL doesn't match within the timeout, the assertion fails.
- R9. DOM modifiers (`text-matches`, `classlist`, attribute checks) do not apply to route assertions. If present, a console warning is emitted to flag the instrumentation mistake. Only URL-specific modifiers (`search`, `hash`) are valid.
- R10. `"route"` must be added to `conditionKeyReservedWords` so it cannot be used as a condition key on DOM assertions (e.g., `fs-assert-added-route` would be ambiguous).

## Success Criteria

- A login form with `fs-assert-route-success="/dashboard"` and `fs-assert-added-error=".error-msg"` (grouped) correctly reports the success or error outcome without any server-side integration
- SPA navigation via `pushState` resolves pending route assertions
- MPA navigation with `fs-assert-mpa="true"` resolves on the next page load
- Route assertions with `[search=code=]` match OAuth callback URLs
- DOM modifiers on route assertions produce a console warning

## Scope Boundaries

- No `popstate` as a trigger type (separate future feature)
- No URL negation (`fs-assert-route-not`) in v1
- No route invariants in v1 (could combine with invariant assertions later)
- Hash and search matching are opt-in modifiers, not part of the default regex target

## Key Decisions

- **Anchored regex against pathname only:** Pattern is auto-wrapped as `^pattern$` for exact matching. Users get regex power for dynamic segments (`/users/\d+`) without accidental partial matches (`/dash` won't match `/dashboard`). Search and hash are opt-in via modifiers.
- **Condition keys supported:** Route assertions are first-class participants in the conditional system. They can be siblings with other route conditionals (same type) or with DOM conditionals (via `fs-assert-grouped`).
- **New interceptor file:** `src/interceptors/navigation.ts` follows the same pattern as the existing error interceptor. Patches `pushState`/`replaceState`, listens for `popstate`.
- **Not in `domAssertions`:** Route assertions have their own resolver. The `domAssertions` gate in DOM resolvers automatically excludes them.
- **Always-on interceptor:** Navigation interceptor initializes at agent startup, consistent with MutationObserver. No lazy initialization — avoids race conditions and complexity.
- **Warn on invalid modifiers:** Console warning when DOM modifiers are used on route assertions, helping developers catch instrumentation mistakes.

## Dependencies / Assumptions

- Depends on the conditional assertions system (condition keys, sibling groups, `fs-assert-grouped`) — already shipped
- Depends on invariant assertions — already shipped (commit 9720aa1)
- The `parseDynamicTypes` function needs to recognize `route` as a valid type for condition key parsing

## Outstanding Questions

### Deferred to Planning
- [Affects R4][Technical] Should the navigation interceptor call the route resolver directly, or should it feed into the manager like `handleEvent`/`handleMutations`?
- [Affects R1][Technical] How should the route resolver handle self-referencing selectors (empty typeValue)? Route assertions always need a pattern — should empty typeValue be a parse error?
- [Affects R6][Needs research] Should `[search=pattern]` match the full search string including `?`, or just the value portion? Same question for `[hash=pattern]` and `#`.

## Next Steps

→ `/ce:plan` for structured implementation planning
