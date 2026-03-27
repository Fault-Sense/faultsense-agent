---
title: "UI-Conditional and Invariant Assertions: Pipeline Integration Patterns"
category: logic-errors
date: 2026-03-26
tags:
  - assertion-lifecycle
  - sibling-dismissal
  - invariant-assertions
  - ui-conditional-assertions
  - resolver-pipeline
  - settle-side-effects
  - vitest-mock-references
  - oob-stale-objects
  - dedup-status-tracking
  - react-boolean-attributes
component: "agent/assertion-pipeline (manager.ts, assertion.ts, elements.ts, dom.ts)"
problem_type: "mutable-state-and-lifecycle-ordering in assertion resolution pipeline"
---

# UI-Conditional and Invariant Assertions: Pipeline Integration Patterns

## Summary

Two features were added to the Faultsense agent in a single session: UI-conditional assertions (replacing the HTTP-coupled network-conditional system) and invariant assertions (continuous DOM monitoring). Multiple implementation bugs were discovered and fixed along the way. The key architectural lesson: **extend the existing pipeline rather than building parallel evaluation paths.**

## Problem 1: UI-Conditional Assertions

### Symptoms

The network-conditional system (`fs-assert-added-200`, `fs-resp-for`) required server-side cooperation, broke with frameworks returning 200 for all responses, and contradicted the "UI is the signal" philosophy.

### Root Cause

Architectural mismatch — gating assertions on HTTP responses required server integration (`fs-resp-for` header), which was the single biggest adoption friction. Frameworks like Next.js, GraphQL, and tRPC always return HTTP 200, making status-code conditions useless.

### Solution

Replaced with `fs-assert-{type}-{conditionKey}={selector}` where condition keys are freeform strings. Multiple conditionals on the same element and type form a **sibling group** — first to resolve wins, others dismissed.

**Key patterns:**
- `conditionKey?: string` on the `Assertion` interface
- `getSiblingGroup()` finds siblings by `assertionKey` + `type` (or just `assertionKey` when `grouped=true`)
- `dismissSiblings()` called in `settle()` when any conditional resolves
- Shared timeout: only the first sibling gets a timer; when it fires, `settle()` dismisses the rest
- `fs-assert-grouped=""` links conditionals across different base types (e.g., `removed-success` + `added-error`)

### What Was Removed

The entire network-conditional system: `fs-resp-for` header linking, `httpPending` gating, HTTP response resolver, network interceptor import. Files kept in repo but not imported (zero bundle impact).

---

## Problem 2: Invariant Assertions

### Symptoms

Faultsense had a blind spot for failures without user action — CSS regressions, race conditions, deploy breakage. Every assertion required a trigger event.

### Root Cause

No mechanism for continuous monitoring. The `mount` trigger settles on first observation and doesn't keep watching.

### What Was Tried That Didn't Work

A dedicated `evaluateInvariants()` function that manually ran `querySelector` + modifier checks on every mutation cycle. This duplicated resolver logic, created a parallel evaluation path, and violated the principle: "New features should fit into the existing pipeline, not bolt on alongside it." (auto memory [claude])

### Working Solution

`fs-trigger="invariant"` creates perpetual assertions that flow through the **existing resolver pipeline** with minimal special-casing:

1. **Discovery** — same as `mount`/`load`: at init and via MutationObserver
2. **Reset loop** — in `handleMutations`, before the resolver pass, completed invariants are reset to pending via `retryCompletedAssertion`. This puts them back into `getPendingDomAssertions()` so resolvers evaluate them naturally. Skipped when `document.hidden`.
3. **No timeout** — `createAssertionTimeout` skipped for invariants
4. **No immediate check** — `checkImmediateResolved` skipped (invariants stay pending until violated)
5. **Settle filtering** — `settle()` filters out invariant passes that aren't recoveries: `!(trigger === "invariant" && status === "passed" && previousStatus !== "failed")`
6. **Page unload auto-pass** — pending (never-violated) invariants are passed directly to collector in `handlePageUnload`, bypassing settle's invariant filter
7. **Element removal auto-pass** — if host element is gone, auto-pass (scope ended cleanly)

**Total new lines in manager.ts for invariants: ~25.** The rest is existing machinery.

---

## Implementation Bugs Fixed

### OOB Stale Object Resolution

After `enqueueAssertions(oobAssertions)`, `immediateResolver` was called on the original OOB objects. But `enqueueAssertions` may have discarded them in favor of retrying existing assertions. Fix: look up actual pending assertions from `activeAssertions` by key match.

### Dismissed Status in Dedup

`retryCompletedAssertion` copied "dismissed" into `previousStatus`. A conditional going `passed→dismissed→passed` looked like a status change. Fix: skip updating `previousStatus` when current status is "dismissed" — dismissed is an internal state never sent to the collector.

### React Boolean Attributes

`fs-assert-grouped` (bare JSX) = `true`, which React doesn't render to DOM for custom attributes. Fix: use `fs-assert-grouped=""` explicitly. Documented as a known gotcha.

### Mock Reference Mutation

Vitest mocks store object references, not deep copies. `retryCompletedAssertion` in `settle()` mutated assertion objects after they were passed to mocked `sendToCollector`. Tests saw `undefined` status. Fix: move invariant reset to `handleMutations` (before resolver pass), not `settle()` (after collector call).

---

## Prevention Strategies

1. **Extend the pipeline, don't build alongside it.** The invariant implementation shrunk from ~60 lines of custom evaluation to ~25 lines of pipeline integration when we stopped trying to build a parallel path.

2. **Mock reference awareness.** When testing with Vitest (or Jest), any function that mutates objects after passing them to a mock will corrupt the mock's recorded arguments. Either: deep-clone before mutating, or ensure mutations happen before the mock call.

3. **"Dismissed" is never a real status.** It's an internal state. Any logic that uses `previousStatus` for dedup must skip dismissed transitions.

4. **React + custom boolean attributes.** Always use `attribute=""` not bare `attribute` in JSX for non-standard attributes. This applies to all `fs-*` attributes used as flags.

5. **OOB assertions must resolve actual activeAssertions, not freshly-created objects.** `enqueueAssertions` may match new objects to existing ones via `retryCompletedAssertion`. Always look up from `activeAssertions` after enqueue.
