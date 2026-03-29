---
title: "refactor: Remove statusReason, add errorContext"
type: refactor
status: completed
date: 2026-03-28
origin: docs/brainstorms/2026-03-28-status-reason-removal-requirements.md
---

# refactor: Remove statusReason, add errorContext

## Overview

Remove the `statusReason` field from the Assertion interface and collector payload. All failure message generation code is deleted — the collector derives human-readable messages from assertion metadata. Add a new `errorContext` field populated only when an uncaught JS exception occurs during the assertion's lifetime. Change the global error resolver from "blanket-fail all pending assertions" to "tag pending assertions with error context and let them resolve naturally."

## Problem Statement / Motivation

`statusReason` messages like "Expected .panel to be added within 2000ms" are entirely derivable from assertion metadata (`type`, `typeValue`, `timeout`). Maintaining these messages across two `getFailureReasonForAssertion` functions creates busywork — every new assertion type or modifier needs a failure string added. The "Unknown assertion type" bug with `emitted` demonstrated this. Meanwhile, the one genuinely useful signal — uncaught JS exceptions — is captured by the error interceptor but only the `message` string survives; `stack`, `source`, `lineno`, `colno` are discarded (see origin: `docs/brainstorms/2026-03-28-status-reason-removal-requirements.md`).

## Proposed Solution

### Step 1: Remove `statusReason` from Assertion interface and payload

**Files:** `src/types.ts`, `src/assertions/server.ts`

Remove from `Assertion` interface:
- `statusReason?: string` (line 91)
- `previousStatusReason?: string` (line 97)

Remove from `ApiPayload` interface:
- `status_reason: string` (line 118)

Remove from `toPayload()`:
- `status_reason: assertion.statusReason || ""` mapping (server.ts line 12)

### Step 2: Delete all failure message generation code

**Files:** `src/resolvers/dom.ts`, `src/assertions/timeout.ts`

Delete `getFailureReasonForAssertion` in `dom.ts` (lines 15-48). Update all callers in `dom.ts` (`handleAssertion`, `immediateResolver`, `documentResolver`) to pass empty string or no failure reason to `completeAssertion`.

Delete `getFailureReasonForAssertion` in `timeout.ts` (lines 9-48). Update `createAssertionTimeout` and GC sweep to pass no failure reason.

### Step 3: Remove `statusReason` from all assertion lifecycle code

**Files:** `src/assertions/assertion.ts`, `src/processors/elements.ts`, `src/assertions/manager.ts`

In `assertion.ts`:
- `completeAssertion`: remove `failureReason` parameter. Set no statusReason on the result (field no longer exists).
- `retryCompletedAssertion`: remove `previousStatusReason` copy (line 52) and `statusReason` reset (line 59).
- `dismissAssertion`: remove `statusReason: ""` from the assigned object.

In `elements.ts`:
- Remove `statusReason: ""` from assertion creation (line 426).

In `manager.ts`:
- Page unload invariant auto-pass: remove `statusReason: ""` (line 421).
- Page unload stale assertion fail: remove `statusReason` generation and assignment (lines 438-444).
- All `completeAssertion` call sites: remove the third argument (failure reason string).

In `resolvers/sequence.ts`:
- Remove the `Precondition not met: ...` string from the `completeAssertion` call (line 29).

In `resolvers/emitted.ts`:
- Remove the empty string from `completeAssertion(assertion, true, "")`.

### Step 4: Add `errorContext` field

**File:** `src/types.ts`

Add to `Assertion` interface:
```typescript
errorContext?: ErrorInfo;
```

The existing `ErrorInfo` interface (types.ts lines 39-45) already has the right shape: `{ message, stack?, source?, lineno?, colno? }`. Reuse it directly.

Add to `ApiPayload`:
```typescript
error_context?: {
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
};
```

Update `toPayload()` in `server.ts` to conditionally include `error_context` when present.

### Step 5: Change global error resolver from blanket-fail to tag-only

**File:** `src/resolvers/error.ts`

Current behavior: `globalErrorResolver` calls `completeAssertion(assertion, false, errorInfo.message)` on ALL pending assertions, failing them immediately.

New behavior: `globalErrorResolver` attaches `errorContext` to all pending assertions but does NOT fail them. The assertions continue pending and resolve via their normal path (DOM mutation, timeout, GC, unload). If they pass, the `errorContext` rides along — telling the collector "this passed but there was a JS error in the session." If they fail via timeout/GC, the `errorContext` tells the collector "this failed and here's the error that might explain why."

```typescript
export const globalErrorResolver: GlobalErrorResolver = (errorInfo, assertions) => {
  for (const assertion of assertions) {
    if (!assertion.endTime) {
      assertion.errorContext = errorInfo;
    }
  }
  return []; // No longer fails assertions
};
```

The `GlobalErrorResolver` return type changes from `CompletedAssertion[]` to `void` (or keep returning empty array for compatibility). The manager's `handleGlobalError` no longer calls `settle()` with the results.

**Rationale (see origin doc R4):** The error may come from an unrelated module (analytics, third-party script). Tagging lets the assertion resolve naturally — a pass with errorContext is more useful than a false failure.

### Step 6: Update collectors

**File:** `src/collectors/panel.ts`

Remove the `.fs-reason` rendering block (lines 293-298) and CSS (lines 140-145) that displayed `status_reason`. Add rendering for `error_context` when present — show the error message in a distinct style (e.g., red text with error icon) to flag JS error correlation.

**File:** `src/collectors/console.ts`

Remove the `Reason:` log line (lines 38-39). Add logging for `error_context` when present.

### Step 7: Update tests

**Files:** All test files that reference `statusReason` or `status_reason`

- Remove all `statusReason` expectations from test assertions (at least 35 test files)
- Update `tests/assertions/error.test.ts` — change from asserting `status: "failed"` with `statusReason: "TestError"` to asserting `errorContext` is attached and the assertion is still pending (or resolves via its normal path)
- Add new tests for:
  - errorContext is `undefined` on non-error assertion pass/fail
  - errorContext is populated when JS error fires while assertion is pending
  - errorContext survives in payload for both passed and failed assertions
  - Multiple errors: first error wins (errorContext is not overwritten)
  - errorContext serializes to/from localStorage for MPA persistence

### Step 8: Update docs

**Files:** `CLAUDE.md`, `llms-full.txt`

- Remove all references to `statusReason` and `status_reason`
- Update the Event Payload section: remove `status_reason`, add `error_context`
- Document that failure reasons are derivable from assertion metadata (type, typeValue, modifiers, timeout)
- Document errorContext behavior: attached on JS error, survives on both pass and fail, first error wins

## Technical Considerations

### Error tagging preserves assertion resolution timing

With tag-only errors (Step 5), the assertion lifecycle is unchanged — no new failure path, no new timeout behavior. The only addition is an optional field on the assertion object. This means all existing resolver paths (DOM, route, sequence, emitted, timeout, GC, unload) work unchanged.

### Multiple errors: first error wins

If multiple JS errors fire while an assertion is pending, only the first sets `errorContext`. Rationale: the first error is typically the root cause; subsequent errors are often cascading failures. The check is simple: `if (!assertion.errorContext) assertion.errorContext = errorInfo`.

### MPA persistence

`errorContext` contains JSON-safe primitives (`string`, `number`, `undefined`). It serializes naturally via `storeAssertions` and deserializes via `loadAssertions`. No special handling needed.

### No `previousErrorContext`

The dedup logic (`getAssertionsToSettle`) checks `previousStatus !== status` only — it never checked `statusReason` (that was a deliberate fix; see `docs/solutions/logic-errors/gc-timeout-refactor-and-instrumentation-patterns.md`). So `errorContext` doesn't need a `previous` counterpart. Invariant auto-retry clears errorContext via `retryCompletedAssertion` — if a new error occurs on the next iteration, it gets a fresh `errorContext`.

### Bundle size impact

Removing two `getFailureReasonForAssertion` functions (~80 lines of switch/case with string templates) and the `getSlaFailureMessage` function saves ~1KB of minified string literals. The `errorContext` addition is ~200 bytes. Net savings: ~800 bytes.

## Acceptance Criteria

- [ ] `statusReason` and `previousStatusReason` removed from `Assertion` interface
- [ ] `status_reason` removed from `ApiPayload` and collector payload
- [ ] Both `getFailureReasonForAssertion` functions deleted
- [ ] All inline failure message strings deleted (GC, unload, sequence, etc.)
- [ ] `errorContext` field added to `Assertion` (type: `ErrorInfo`)
- [ ] `error_context` field added to `ApiPayload` (optional, omitted when no error)
- [ ] Global error resolver tags pending assertions with errorContext, does NOT fail them
- [ ] First error wins: subsequent errors don't overwrite `errorContext`
- [ ] errorContext survives MPA persistence (localStorage round-trip)
- [ ] Panel collector shows error context when present, removes reason display
- [ ] Console collector logs error context when present, removes reason logging
- [ ] All existing tests updated, new tests for errorContext behavior
- [ ] CLAUDE.md and llms-full.txt updated

## Dependencies & Risks

- **Collector backend impact:** The hosted collector must be updated to handle the absence of `status_reason` and the presence of `error_context`. Coordinate with the collector repo.
- **Low risk:** The change is largely subtractive. Removing `statusReason` simplifies the assertion pipeline. The error tagging behavior is a strict improvement over blanket-failing.
- **Learnings note:** Dedup logic already ignores `statusReason` (see `docs/solutions/logic-errors/gc-timeout-refactor-and-instrumentation-patterns.md`), so removal is safe from the pipeline perspective.

## Sources & References

- **Origin document:** `docs/brainstorms/2026-03-28-status-reason-removal-requirements.md` — key decisions: remove statusReason (not repurpose), add errorContext as separate field, collector derives human-readable messages
- statusReason lifecycle: `src/assertions/assertion.ts:52,59,127-131,158-162`
- Failure message generators: `src/resolvers/dom.ts:15-48`, `src/assertions/timeout.ts:9-48`
- Global error interceptor: `src/interceptors/error.ts` (captures ErrorInfo with stack/source/line/col)
- Global error resolver: `src/resolvers/error.ts` (currently discards everything except message)
- Collector payload: `src/assertions/server.ts:12`, `src/types.ts:108-122`
- Panel display: `src/collectors/panel.ts:140-145,293-298`
- Dedup safety: `docs/solutions/logic-errors/gc-timeout-refactor-and-instrumentation-patterns.md`
