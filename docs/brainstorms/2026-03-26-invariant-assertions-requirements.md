---
date: 2026-03-26
topic: invariant-assertions
---

# Invariant Assertions

## Problem Frame

Faultsense assertions require a user event to trigger. This creates a blind spot for failures that occur without user action — CSS regressions hiding the nav, race conditions flashing error banners, deploys removing critical elements. E2e tests routinely check background invariants; Faultsense has no equivalent. The `mount` trigger partially addresses this but settles on first observation and doesn't keep watching.

## Requirements

- R1. `fs-trigger="invariant"` creates assertions that stay pending indefinitely — evaluated on every MutationObserver cycle. They do not pass on their own; they only report failures.
- R2. **Pending until violated:** Invariants are created like `mount`/`load` assertions (discovered at init or via MutationObserver). They stay pending and produce no collector traffic while the invariant holds.
- R3. **Failure reporting:** When an invariant check fails (state violated), the failure is reported to the collector.
- R4. **Recovery reporting:** When a previously-failed invariant passes again (state recovered), the recovery is reported. The assertion then returns to pending, watching for the next violation.
- R5. **No timeout.** Invariants are perpetual — they remain active for the lifetime of the page. Skip `createAssertionTimeout` entirely.
- R6. **Page unload auto-pass:** On page unload (`beforeunload`/`pagehide`), all pending invariants are auto-passed and sent to the collector. This tells the backend the invariant was healthy for the session. Delivery should use the same unload lifecycle as MPA assertion persistence (`handlePageUnload`).
- R7. All assertion types are allowed on invariants. Warn in debug mode when event-based types (`updated`, `loaded`) are used, since they're semantically odd for invariants (state types `visible`/`hidden` are the natural fit).
- R8. No conditional keys on invariants. Invariants are simple always-on contracts.
- R9. Invariant assertions are discovered at init (alongside `mount`/`load`) for elements already in the DOM, and via MutationObserver for elements added later.
- R10. Invariants should pause evaluation when `document.hidden === true` (tab backgrounded) to avoid spurious reports.
- R11. Invariant assertions do NOT persist across page navigations (no MPA mode). Each page declares its own invariants.

## Success Criteria

- A `fs-trigger="invariant"` assertion with `fs-assert-visible="#main-nav"` produces no collector traffic while the nav is visible
- If the nav becomes hidden, a failure is reported
- If the nav becomes visible again, a recovery (pass) is reported, then the invariant returns to pending
- On page unload, all pending (healthy) invariants are auto-passed and sent to the collector
- Existing event-triggered assertions are unaffected

## Scope Boundaries

- No conditional keys on invariants
- No MPA persistence for invariants
- No debouncing in v1 (add if profiling shows a problem)
- `fs-assert-grouped` does not apply to invariants (no conditionals to group)

## Key Decisions

- **Pending-until-violated model:** Invariants don't pass on creation. They stay pending, only reporting failures and recoveries. The page unload auto-pass is the "all clear" signal to the collector.
- **All types allowed, warn on event types:** Don't restrict — developers may find creative uses. But warn because `updated` and `loaded` are semantically "did something change" not "is something true."
- **No timeout:** Invariants are perpetual. Skip `createAssertionTimeout` entirely.
- **Auto-pass on unload:** Pending invariants are passed in `handlePageUnload` before MPA save. This ensures the collector knows every invariant's final state rather than seeing stale pending assertions.
- **Pause on hidden:** Avoid false failures from browser deprioritizing off-screen rendering.

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] Should invariant evaluation happen inside `handleMutations` after the resolver pass, or as a separate step called from the MutationObserver callback?
- [Affects R2][Technical] Does the current `retryCompletedAssertion` + `getAssertionsToSettle` pipeline handle the perpetual cycle correctly, or does it need adaptation for the dismissed-status dedup fix?
- [Affects R7][Needs research] How does `document.hidden` interact with MutationObserver timing? Does the observer still fire when the tab is backgrounded?

## Next Steps

→ `/ce:plan` for structured implementation planning
