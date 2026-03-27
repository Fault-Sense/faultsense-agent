---
title: "feat: Replace global timeout with GC sweep and opt-in SLA timeouts"
type: feat
status: completed
date: 2026-03-27
origin: docs/brainstorms/2026-03-27-assertion-gc-and-sla-timeouts-requirements.md
---

# feat: Replace Global Timeout with GC Sweep and Opt-In SLA Timeouts

## Overview

Replace the per-assertion `setTimeout` timer (default 1000ms via `config.timeout`) with a debounced garbage collector and opt-in SLA timeouts. Assertions without `fs-assert-timeout` resolve naturally or are cleaned up by the GC. Page unload uses `sendBeacon` with a grace period. Re-triggers track attempt timestamps.

This eliminates false failures on slow devices/networks while preserving explicit performance contracts for developers who want them. (see origin: `docs/brainstorms/2026-03-27-assertion-gc-and-sla-timeouts-requirements.md`)

## Problem Statement / Motivation

Every assertion gets a per-assertion `setTimeout` (from `fs-assert-timeout` or `config.timeout`, default 1000ms). On slow 3G connections or low-powered devices, 1000ms is too aggressive — assertions fail before the server responds. The timeout conflates garbage collection (cleaning up stale assertions) with SLA enforcement (verifying performance contracts).

## Proposed Solution

### Three-tier assertion cleanup

1. **Natural resolution** — assertions pass/fail when the DOM changes. No timer involved.
2. **SLA timeout** (opt-in) — `fs-assert-timeout="2000"` creates a per-assertion `setTimeout`. Existing behavior, unchanged.
3. **GC sweep** — debounced `setTimeout` fires after `config.gcInterval` ms of assertion inactivity. Sweeps stale pending assertions.

### Page unload sweep

On `pagehide`/`beforeunload`: fail pending assertions older than 2000ms, silently drop younger ones. Use `navigator.sendBeacon` for reliable delivery.

### Re-trigger tracking

When a trigger fires and an assertion is already pending, record the timestamp in an `attempts[]` array. Included in payload for rage-click analysis.

## Technical Considerations

### Files to Change

| File | Change |
|---|---|
| `src/types.ts` | Remove `timeout` from `Configuration`. Add `gcInterval`, `unloadGracePeriod`. Add `attempts?: number[]` to `Assertion`. Add `attempts` to `ApiPayload`. |
| `src/config.ts` | Remove `timeout: 1000` default. Add `gcInterval: 30000`, `unloadGracePeriod: 2000` defaults. |
| `src/assertions/configuration.ts` | Remove `timeout` validation. Add `gcInterval`, `unloadGracePeriod` validation. |
| `src/assertions/timeout.ts` | Update `createAssertionTimeout` to only use `assertion.timeout` (no fallback to `config.timeout`). Only called for assertions WITH `fs-assert-timeout`. Add `createGcTimeout` / `resetGcTimeout` functions. |
| `src/assertions/manager.ts` | Rewrite timeout creation in `enqueueAssertions`: only create per-assertion timer if `assertion.timeout > 0`. Add GC debounce on every enqueue. Track re-trigger attempts. Update `handlePageUnload` with grace period and sendBeacon. |
| `src/assertions/assertion.ts` | Add `attempts` to `retryCompletedAssertion` reset. |
| `src/assertions/server.ts` | Add `sendBeacon` path for page unload. Add `attempts` to `toPayload`. |
| `src/index.ts` | No changes to init (config.timeout already not used there). |
| `src/processors/elements.ts` | No changes (fs-assert-timeout parsing unchanged). |

### GC Implementation

**Simple setTimeout, no debounce.** Set once on first assertion creation. When it fires, sweep stale ones, reschedule if pending assertions remain.

```
let gcTimerId: ReturnType<typeof setTimeout> | null = null;

function scheduleGc() {
  if (gcTimerId) return; // Already scheduled
  gcTimerId = setTimeout(() => {
    gcTimerId = null;
    const now = Date.now();
    const stale = activeAssertions.filter(
      a => !a.endTime && a.trigger !== "invariant" && !a.timeout && (now - a.startTime) > config.gcInterval
    );
    // Fail stale assertions with GC reason
    // Reschedule if more pending assertions remain
    if (activeAssertions.some(a => !a.endTime && a.trigger !== "invariant" && !a.timeout)) {
      scheduleGc();
    }
  }, config.gcInterval);
}
```

Called from `enqueueAssertions` when a new assertion is added. Only creates a timer if one doesn't already exist.

**GC failure for sibling groups:** When GC sweeps a conditional assertion, `settle()` handles sibling dismissal (existing behavior). One group failure is produced.

### Per-Assertion SLA Timer

Only created when `assertion.timeout > 0` (from `fs-assert-timeout` attribute). The fallback `|| config.timeout` is removed from `createAssertionTimeout`.

**SLA covers all assertions on the element:** `fs-assert-timeout` is an element-level attribute. All assertions from that element share the SLA timer — it cannot be scoped to individual conditional siblings. This is the same model as `fs-assert-mpa` and `fs-assert-grouped`.

### Page Unload with sendBeacon

`config.unloadGracePeriod` (default 2000ms) — assertions younger than this are silently dropped on unload (user clicked and immediately navigated, not a failure).

```
handlePageUnload():
  // Invariant auto-pass (existing, visibilityState guard)

  // Non-invariant sweep with grace period
  const now = Date.now()
  const stale = activeAssertions.filter(
    a => !a.endTime && a.trigger !== "invariant" && (now - a.startTime) > config.unloadGracePeriod
  )
  // Fail stale, send via sendBeacon

  // Silently drop assertions < unloadGracePeriod old

  clearGcTimeout()
  clearAllTimeouts()
  saveActiveAssertions() // MPA
```

**Replace `fetch` with `sendBeacon` for all collector sends.** One code path, simpler, guaranteed delivery on unload.

```
export function sendToServer(assertions, config):
  for (const assertion of assertions):
    const payload = toPayload(assertion, config)
    navigator.sendBeacon(
      config.collectorURL,
      new Blob([JSON.stringify(payload)], { type: "application/json" })
    )
```

**API key moves to POST body** — `sendBeacon` can't set custom headers. Add `api_key` to `ApiPayload` and remove the `X-Faultsense-Api-Key` header. The collector backend must accept the API key from the body.

This is a **breaking collector change** — the API key is no longer in the request header.

### Re-Trigger Attempt Tracking

In `enqueueAssertions`, when `findAssertion` finds an existing pending assertion (the NOOP path):

```
// Existing pending assertion found — record the re-trigger attempt
if (existingAssertion && isAssertionPending(existingAssertion)) {
  if (!existingAssertion.attempts) existingAssertion.attempts = [];
  existingAssertion.attempts.push(Date.now());
  return; // NOOP — assertion already pending
}
```

In `retryCompletedAssertion`, reset the attempts array:
```
assertion.attempts = undefined;
```

In `toPayload`, include attempts:
```
attempts: assertion.attempts || [],
```

## Acceptance Criteria

### Functional Requirements

- [ ] Assertions without `fs-assert-timeout` have NO per-assertion `setTimeout` timer
- [ ] `config.gcInterval` (default 30000ms) controls the debounced GC sweep
- [ ] GC sweeps pending assertions older than `gcInterval` ms
- [ ] GC fires only after `gcInterval` ms with no new assertions (debounced)
- [ ] `fs-assert-timeout` assertions get per-assertion SLA timers (unchanged behavior)
- [ ] GC failure reason: "Assertion did not resolve within [gcInterval]ms"
- [ ] SLA failure reason: "Expected [type] within [timeout]ms" (unchanged)
- [ ] Page unload: fail non-invariant assertions older than 2000ms
- [ ] Page unload: silently drop assertions younger than 2000ms
- [ ] Page unload: use `navigator.sendBeacon` for delivery
- [ ] Invariants excluded from GC and page unload sweep
- [ ] `config.timeout` removed — error if provided
- [ ] Re-trigger attempts tracked as timestamp array
- [ ] Attempts array included in payload
- [ ] Attempts array reset on `retryCompletedAssertion`
- [ ] Conditional sibling group GC failure produces one group failure
- [ ] GC timeout cleared on page unload

### Testing Requirements

- [ ] Assertion without `fs-assert-timeout` does NOT fail at 1000ms
- [ ] Assertion without `fs-assert-timeout` is GC'd after `gcInterval` ms of inactivity
- [ ] Assertion with `fs-assert-timeout="2000"` fails at 2000ms (SLA)
- [ ] GC debounce: adding new assertions resets the GC timer
- [ ] Page unload fails stale assertions (> 2s) and drops fresh ones (< 2s)
- [ ] Invariants survive GC sweep
- [ ] Re-trigger on pending assertion records timestamp in attempts array
- [ ] Retry clears attempts array
- [ ] Conditional group: GC produces one failure, siblings dismissed
- [ ] sendBeacon used on page unload (mock navigator.sendBeacon)
- [ ] Remove all tests that depend on `config.timeout` default behavior

## Implementation Phases

### Phase 1: Remove config.timeout and add gcInterval

1. Remove `timeout` from `Configuration` interface and `defaultConfiguration`
2. Add `gcInterval: 30000` to `Configuration` and defaults
3. Update `configuration.ts` validation
4. Update `createAssertionTimeout` to only use `assertion.timeout` (remove `|| config.timeout` fallback)
5. In `enqueueAssertions`: only create per-assertion timer if `assertion.timeout > 0`
6. Update existing tests that rely on `config.timeout`

### Phase 2: Implement GC sweep

1. Add `resetGcTimeout` function in `timeout.ts`
2. Call `resetGcTimeout` from `enqueueAssertions` on every new assertion
3. GC callback: sweep stale assertions, fail them, settle, reschedule if needed
4. Clear GC timeout in `handlePageUnload` and cleanup
5. Write GC tests

### Phase 3: Page unload with sendBeacon and grace period

1. Update `handlePageUnload` with 2000ms grace period
2. Add `sendViaBeacon` in `server.ts`
3. Route page unload delivery through sendBeacon
4. Write page unload tests

### Phase 4: Re-trigger attempt tracking

1. Add `attempts?: number[]` to `Assertion` interface
2. Track timestamps in `enqueueAssertions` NOOP path
3. Reset in `retryCompletedAssertion`
4. Add to `ApiPayload` and `toPayload`
5. Write attempt tracking tests

### Phase 5: Documentation

1. Update CLAUDE.md — new timeout model, gcInterval, SLA vs GC
2. Update llms.txt and llms-full.txt
3. Update AGENT_PAYLOAD_SPEC.md — attempts field, gcInterval config
4. Update faultsense-plugin skill docs

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-27-assertion-gc-and-sla-timeouts-requirements.md](docs/brainstorms/2026-03-27-assertion-gc-and-sla-timeouts-requirements.md) — Key decisions: no default SLA, debounced GC, config.timeout removed, sendBeacon on unload, attempt timestamp tracking

### Internal References

- Timeout system: `src/assertions/timeout.ts` (complete implementation)
- Timeout creation: `src/assertions/manager.ts:90-113` (enqueueAssertions)
- Page unload: `src/assertions/manager.ts:280-305` (handlePageUnload)
- Assertion identity: `src/assertions/assertion.ts:4-15` (findAssertion — NOOP path for re-triggers)
- Config validation: `src/assertions/configuration.ts:19` (timeout validator)
- Collector delivery: `src/assertions/server.ts:48-69` (sendToServer uses fetch, not sendBeacon)
- Pipeline extension patterns: `docs/solutions/logic-errors/assertion-pipeline-extension-ui-conditional-and-invariant-triggers.md`
