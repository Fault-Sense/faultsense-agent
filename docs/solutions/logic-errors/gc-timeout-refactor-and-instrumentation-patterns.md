---
title: "GC Timeout Refactor, sendBeacon Migration, and Instrumentation Gotchas"
category: logic-errors
date: 2026-03-27
tags:
  - gc-sweep
  - sla-timeout
  - sendbeacon
  - page-unload
  - attempt-tracking
  - broad-selectors
  - blur-vs-click
  - dedup-status-reason
  - sibling-retry
  - config-migration
component: "agent/assertion-pipeline (timeout.ts, manager.ts, server.ts, configuration.ts)"
problem_type: "assertion-lifecycle-and-delivery-reliability"
---

# GC Timeout Refactor, sendBeacon Migration, and Instrumentation Gotchas

## Summary

Replaced the global `config.timeout` (1000ms per-assertion timer) with a three-tier cleanup model: natural resolution, opt-in SLA timeouts (`fs-assert-timeout`), and a GC sweep. Migrated from `fetch` to `sendBeacon` for collector delivery. Discovered several instrumentation patterns around list selectors and event ordering.

## Problem 1: False Failures on Slow Devices

### Root Cause

Every assertion got a per-assertion `setTimeout` at 1000ms (from `config.timeout`). On slow 3G connections or low-powered devices, API responses took longer than 1s, causing assertions to fail before the outcome appeared in the DOM. The timeout conflated garbage collection (cleaning up stale assertions) with SLA enforcement (performance contracts).

### Solution

Separated the two concerns:

- **No default per-assertion timer.** Assertions without `fs-assert-timeout` resolve naturally when the DOM changes. No timer involved.
- **GC sweep** (`config.gcInterval`, default 30s): a `setTimeout` scheduled on first assertion enqueue. When it fires, sweeps pending assertions older than `gcInterval`. Reschedules on next enqueue if needed.
- **SLA timeout** (`fs-assert-timeout="2000"`): opt-in per-assertion timer for explicit performance contracts. Behavior unchanged from the old system.
- **Page unload sweep** (`config.unloadGracePeriod`, default 2s): on `pagehide`/`beforeunload`, fail assertions older than the grace period. Silently drop younger ones (user navigated, not a failure).

`config.timeout` removed entirely — breaking change.

## Problem 2: Unreliable Page Unload Delivery

### Root Cause

`sendToServer` used `fetch` for all collector sends. During page unload, `fetch` requests may be cancelled by the browser before completing.

### Solution

Replaced `fetch` with `navigator.sendBeacon` for all collector sends. `sendBeacon` is designed for fire-and-forget — the browser queues the request and guarantees delivery even during page close. Falls back to `fetch` in environments without `sendBeacon`.

**Breaking collector change:** `sendBeacon` cannot set custom HTTP headers. The `X-Faultsense-Api-Key` header was moved to the POST body as `api_key`. Collectors must accept the API key from the body.

## Problem 3: Dedup Filter Allowed Duplicate Failures

### Root Cause

`getAssertionsToSettle` compared both `previousStatus !== status` AND `previousStatusReason !== statusReason`. When a conditional assertion was retried (user clicked again), the failure message changed between retries (different sibling condition keys listed). `failed → failed` with different reasons was treated as a status change and sent twice.

### Solution

Removed `statusReason` from the dedup comparison. Status change alone (`previousStatus !== status`) is sufficient. `failed → failed` is always deduped regardless of message.

## Problem 4: Dismissed Siblings Not Restored on Retry

### Root Cause

When a conditional assertion was retried (user clicked again after a previous resolution), `retryCompletedAssertion` reset the triggered assertion but left dismissed siblings in their dismissed state. The sibling group was broken — only one conditional was active.

### Solution

In `enqueueAssertions`, when retrying a conditional assertion, also retry all siblings via `getSiblingGroup`:

```typescript
for (const sibling of getSiblingGroup(existingAssertion, activeAssertions)) {
  retryCompletedAssertion(sibling, sibling as Assertion);
}
```

The full group is restored for fresh evaluation.

## Problem 5: Broad Selectors in Lists Match Wrong Elements

### Root Cause

In the todo app, `fs-assert-added=".todo-text[text-matches=food]"` resolved against the wrong `.todo-text` element. When React re-renders a list, multiple `.todo-text` elements appear in the mutation batch. The `added` resolver picks the first match — which may not be the edited one.

### Solution

Use `updated` instead of `added` for elements whose content changes in-place. `updated` tracks which specific element (or subtree) was mutated, so it matches the right one. `added` only knows that a matching element appeared somewhere.

**General rule:** In lists with identical selectors, prefer `updated` (tracks specific mutations) or narrow the selector with IDs/data attributes.

## Problem 6: Blur Fires Before Click on Save Buttons

### Root Cause

In the todo edit flow, the save button had `fs-trigger="click"` but the edit input had `onBlur={handleSave}`. When clicking the save button, the input's blur event fires first (blur always precedes click). The blur triggers `handleSave`, which re-renders and removes the save button from the DOM before the click event reaches it. The assertion was never created.

### Solution

Put the assertion on the edit input with `fs-trigger="blur"` instead of on the save button with `fs-trigger="click"`. The blur IS the actual trigger for the save action.

**General rule:** If an element disappears during the action it triggers (common in React with conditional rendering), put the assertion on the element that stays in the DOM or on the element whose event actually triggers the action.

## Re-Trigger Attempt Tracking

Added `attempts?: number[]` to the Assertion interface. When a trigger fires on a pending assertion (NOOP path in `enqueueAssertions`), the timestamp is recorded. The array is included in the collector payload for rage-click detection and interaction cadence analysis. Reset on `retryCompletedAssertion`.

## Prevention Strategies

1. **Don't conflate cleanup with SLA.** If you need a performance contract, use `fs-assert-timeout`. If you just want the assertion to eventually resolve, let the GC handle it.

2. **Use `updated` for list item content changes.** `added` is for new elements that don't exist yet. In a list re-render, the element may be updated in-place rather than re-created.

3. **Check event ordering when instrumenting.** If `onBlur` triggers the action, the assertion trigger should be `blur`, not `click` on a sibling button. Blur always fires before click.

4. **Test on slow connections.** Chrome DevTools → Network → Slow 3G. Assertions without `fs-assert-timeout` should still resolve correctly (just slower). Only SLA timeouts should fail.

5. **Dedup by status only.** Don't compare failure reasons for dedup — reasons can vary between retries without representing a meaningful state change.

## Cross-References

- Previous solution: `docs/solutions/logic-errors/assertion-pipeline-extension-ui-conditional-and-invariant-triggers.md` — covers the conditional + invariant implementation that this builds on
- Brainstorm: `docs/brainstorms/2026-03-27-assertion-gc-and-sla-timeouts-requirements.md`
- Plan: `docs/plans/2026-03-27-001-feat-assertion-gc-and-sla-timeouts-plan.md`
