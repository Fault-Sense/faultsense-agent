---
title: "feat: Add invariant assertions for continuous DOM monitoring"
type: feat
status: completed
date: 2026-03-26
origin: docs/brainstorms/2026-03-26-invariant-assertions-requirements.md
---

# feat: Add Invariant Assertions for Continuous DOM Monitoring

## Overview

Add `fs-trigger="invariant"` — assertions that stay pending indefinitely, evaluated on every MutationObserver cycle. They only report failures (state violated) and recoveries (state restored). No timeout. Auto-passed on page unload for pending (never-violated) invariants.

This closes a fundamental gap: Faultsense currently requires a user event to start monitoring, so failures without a proximate user action (CSS regressions, race conditions, deploy breakage) are invisible. (see origin: `docs/brainstorms/2026-03-26-invariant-assertions-requirements.md`)

## Problem Statement / Motivation

E2e tests routinely check background invariants — no console errors, no broken images, layout intact. Faultsense has a complete blind spot for failures without user interaction. The `mount` trigger settles on first observation and doesn't keep watching.

## Proposed Solution

### Attribute Syntax

```html
<!-- Nav always visible -->
<nav id="main-nav"
  fs-assert="layout/nav-visible"
  fs-trigger="invariant"
  fs-assert-visible="#main-nav">

<!-- Error banner should never appear -->
<div id="error-root"
  fs-assert="app/no-unexpected-errors"
  fs-trigger="invariant"
  fs-assert-hidden=".fatal-error">
```

### Lifecycle Model: Pending Until Violated

1. **Created** → stays pending, no collector traffic
2. **Violated** (check fails) → failure reported, assertion immediately reset to pending for next cycle
3. **Recovered** (check passes after failure) → pass reported (collector infers recovery from `previousStatus: "failed"`), assertion returns to pending
4. **Page unload** → all pending (never-violated) invariants auto-passed, sending the "all clear" signal

The key insight: invariants are never "done." They cycle between pending and reported states using `retryCompletedAssertion` to reset after each report.

### Deferred Questions Resolved

**Q1: How do invariants re-enter the evaluation pipeline after failing?**
After an invariant fails or recovers and is settled, `settle()` immediately calls `retryCompletedAssertion()` to reset it back to pending. This reuses existing machinery — no new lifecycle state needed.

**Q2: What happens when an invariant is in failed state at page unload?**
Do nothing. The failure was already sent. Auto-pass only applies to invariants in pending state (never-violated). The collector already has the failure on record.

**Q3: Recovery vs. passed status?**
Reuse `"passed"` for recovery. The `previousStatus` field (already in dedup logic) distinguishes "recovered" (`previousStatus: "failed"`) from "auto-pass on unload" (`previousStatus: undefined`).

**Q4: Dynamic discovery?**
Add `"invariant"` to init scan and mutation processor triggers, same as `mount`.

**Q5: Invariant element removed from DOM?**
Auto-pass the invariant — the element's lifecycle ended. The invariant held until the component unmounted.

**Q6: Tab backgrounding?**
Skip invariant evaluation when `document.hidden === true`. Add `visibilitychange` listener.

## Technical Considerations

### Invariant Evaluation Hook Point

After the normal resolver pass in `handleMutations`, evaluate all pending invariants using `documentResolver`-style logic. `documentResolver` reports both pass and fail (unlike `immediateResolver` which ignores failures), which is what invariants need.

The flow:
```
MutationObserver fires
  → handleMutations runs normal pipeline (processors, resolvers, settle)
  → After settle: evaluate all pending invariants
    → For each: querySelector + modifiers check
    → If state changed (pending→failed, or failed→passed): settle the result
    → settle() auto-resets invariants to pending via retryCompletedAssertion
```

### Files to Change

| File | Change |
|---|---|
| `src/config.ts` | Add `"invariant"` to `supportedTriggers` |
| `src/index.ts` | Add `"invariant"` to init query selector and `processElements` call. Add `visibilitychange` listener. |
| `src/assertions/manager.ts` | Add `"invariant"` to `createElementProcessor(["mount"])` in `handleMutations`. Add `evaluateInvariants()` after mutation settlement. Skip timeout for invariants in `enqueueAssertions`. Auto-pass pending invariants in `handlePageUnload`. Auto-reset invariants after settle. |
| `src/resolvers/dom.ts` | No changes — `documentResolver` logic reused inline in manager |
| `src/assertions/assertion.ts` | Add `getInvariantAssertions()` filter helper. No lifecycle changes — `retryCompletedAssertion` already handles the reset. |
| `src/assertions/timeout.ts` | No changes (invariants skip timeout creation) |

### Invariant Evaluation Logic (in manager.ts)

```
function evaluateInvariants():
  if document.hidden: return  // Pause when backgrounded (R10)

  invariants = activeAssertions.filter(a => a.trigger === "invariant" && !a.endTime)
  for each invariant:
    element = document.querySelector(invariant.typeValue) or self-reference
    run modifier checks (same as documentResolver)

    if check fails AND invariant has no status (pending):
      completeAssertion(invariant, false, reason) → settle
    if check passes AND invariant.previousStatus === "failed":
      completeAssertion(invariant, true) → settle (recovery)
    // Otherwise: no state change, no report
```

After `settle()` sends the result, it calls `retryCompletedAssertion()` on the invariant to reset it for the next cycle. The `getAssertionsToSettle` dedup filter prevents duplicate reports — if an invariant fails and stays failed across 100 mutation cycles, only the first failure is sent.

### Page Unload Auto-Pass

In `handlePageUnload`, before clearing timeouts and saving MPA assertions:
```
pendingInvariants = activeAssertions.filter(a =>
  a.trigger === "invariant" && !a.endTime && !a.status
)
for each: completeAssertion(invariant, true, "")
settle(completed)
```

Only pending (never-violated) invariants are auto-passed. Failed invariants keep their last-reported failure status.

### Element Removal Handling

When the DOM element hosting an invariant is removed (component unmount), the invariant's selector will no longer match. For `visible` type, `querySelector` returns null, which means the visible check fails. This would report a failure — but the element being gone is not the invariant breaking, it's the invariant's scope ending.

Solution: in `evaluateInvariants`, if the element no longer exists AND the invariant was in pending state (never violated), auto-pass it. If it was previously failed, leave it failed.

### OOB Interaction

Invariant failures and recoveries flow through `settle()`, which triggers OOB for passed assertions. Recovery (pass) would trigger OOB listeners. Auto-pass on unload would also trigger OOB. This is fine — OOB assertions are independent and decide for themselves whether the parent's pass is relevant.

### What NOT to Change

- `resolvers/dom.ts` — invariant evaluation reuses the same querySelector + modifier pattern but is called from the manager, not from the resolver pipeline
- `types.ts` — no new fields needed. `trigger: "invariant"` is sufficient to identify invariants
- `processors/elements.ts` — no changes, `isProcessableElement` works generically with any trigger string

## Acceptance Criteria

### Functional Requirements

- [ ] `fs-trigger="invariant"` creates assertions that stay pending indefinitely
- [ ] No timeout created for invariant assertions
- [ ] Invariant failure reported when state check fails (e.g., element becomes hidden)
- [ ] Invariant recovery reported when state check passes after a previous failure
- [ ] Invariant returns to pending after both failure and recovery reports
- [ ] No collector traffic while invariant state is stable (pending or repeated same-status)
- [ ] On page unload, pending (never-violated) invariants are auto-passed
- [ ] Failed invariants are NOT auto-passed on unload — their failure stands
- [ ] Element removal auto-passes pending invariants
- [ ] Invariants discovered at init and via MutationObserver for dynamic elements
- [ ] Evaluation pauses when `document.hidden === true`
- [ ] Debug warning when `updated` or `loaded` types used with invariant trigger
- [ ] No conditional keys on invariants (condition keys ignored if present)
- [ ] `fs-assert-mpa` ignored on invariants with debug warning
- [ ] CLAUDE.md and llms-full.txt updated with invariant documentation

### Testing Requirements

- [ ] Invariant stays pending when condition holds — no collector calls
- [ ] Invariant failure reported when condition violated
- [ ] Invariant recovery reported after failure, then returns to pending
- [ ] Multiple violation/recovery cycles — each state change reported once
- [ ] Page unload auto-passes pending invariants
- [ ] Page unload does NOT auto-pass failed invariants
- [ ] Element removal auto-passes pending invariant
- [ ] No timeout fires for invariants
- [ ] Dynamic invariant element discovered via MutationObserver
- [ ] Debug warning for `updated`/`loaded` with invariant trigger

## Implementation Phases

### Phase 1: Discovery + Lifecycle (Foundation)

1. Add `"invariant"` to `supportedTriggers` in `config.ts`
2. Add `"invariant"` to init scan in `index.ts` (alongside `mount`/`load`)
3. Add `"invariant"` to `createElementProcessor(["mount"])` in `handleMutations`
4. Skip `createAssertionTimeout` for `trigger === "invariant"` in `enqueueAssertions`
5. Add `evaluateInvariants()` function in manager — called after mutation settlement
6. In `settle()`, auto-reset invariant assertions to pending via `retryCompletedAssertion`

### Phase 2: Page Lifecycle + Guards

1. Auto-pass pending invariants in `handlePageUnload`
2. Add `visibilitychange` listener in `index.ts` — set a flag to skip invariant evaluation
3. Element removal detection — auto-pass when host element no longer in DOM
4. Debug warnings: event-based types (`updated`, `loaded`), MPA mode on invariants
5. Skip conditional key processing for invariant-triggered assertions

### Phase 3: Tests + Documentation

1. Write invariant test suite (lifecycle, recovery, unload, element removal, dynamic discovery)
2. Update CLAUDE.md with invariant documentation
3. Update llms-full.txt and llms.txt
4. Add invariant examples to todo app if applicable

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-26-invariant-assertions-requirements.md](docs/brainstorms/2026-03-26-invariant-assertions-requirements.md) — Key decisions: pending-until-violated model, no timeout, auto-pass on unload, all types allowed with event-type warnings, no conditionals

### Internal References

- Mutation pipeline: `src/assertions/manager.ts:130-160` (handleMutations)
- Assertion lifecycle: `src/assertions/assertion.ts:38-62` (retryCompletedAssertion)
- DOM state checking: `src/resolvers/dom.ts:274-322` (documentResolver pattern)
- Page unload: `src/assertions/manager.ts:265-276` (handlePageUnload)
- Init discovery: `src/index.ts:68-80`
- Dedup filter: `src/assertions/assertion.ts:60-70` (getAssertionsToSettle)
- Ideation deep dive: `docs/ideation/2026-03-26-e2e-gap-analysis-ideation.md` (idea #1)
