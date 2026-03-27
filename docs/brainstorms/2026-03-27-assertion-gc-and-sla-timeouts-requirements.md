---
date: 2026-03-27
topic: assertion-gc-and-sla-timeouts
---

# Assertion GC and SLA Timeouts

## Problem Frame

Today, every assertion gets a per-assertion `setTimeout` timer (from `fs-assert-timeout` or the global `config.timeout`, default 1000ms). On slow devices or networks, 1000ms is too aggressive — assertions fail before the server responds, producing false failures. The timeout mechanism conflates two concerns:

1. **Garbage collection** — cleaning up assertions that will never resolve
2. **SLA enforcement** — verifying that an outcome happened within a performance contract

Separating these makes assertions reliable on any device while preserving the ability to set explicit performance contracts.

## Requirements

- R1. **Remove `config.timeout`.** The global default per-assertion timeout is eliminated. Assertions without `fs-assert-timeout` have no per-assertion timer.

- R2. **Assertions without `fs-assert-timeout` resolve naturally.** They pass or fail when the DOM changes. If they never resolve, the GC cleans them up.

- R3. **Add `config.gcInterval` (configurable, default 30000ms).** A debounced `setTimeout` fires `gcInterval` ms after the last assertion was enqueued. When it fires, sweeps `activeAssertions` for pending assertions older than `gcInterval` ms and fails them with a GC-specific status reason. If more pending assertions remain, reschedules. No interval polling — only fires after a period of assertion inactivity.

- R4. **`fs-assert-timeout` remains as an opt-in SLA.** Assertions with an explicit `fs-assert-timeout` attribute get a per-assertion `setTimeout` timer (existing behavior). The failure reason indicates an SLA violation, distinct from GC cleanup.

- R5. **GC failure reason is distinguishable from SLA failure.** GC: "Assertion did not resolve within [gcInterval]ms." SLA: "Expected [type] within [timeout]ms." Both are `status: "failed"` — the collector distinguishes by message content.

- R6. **Page unload sweep with grace period.** On `pagehide`/`beforeunload`, fail pending non-invariant assertions older than 2000ms (they had enough time to resolve). Assertions younger than 2000ms are silently dropped — the user clicked and immediately navigated, which is not a failure. Use `navigator.sendBeacon` for reliable delivery during page close.

- R7. **Invariants are excluded from GC.** Invariant assertions (`fs-trigger="invariant"`) have no timeout and no GC — they're perpetual by design.

- R8. **Conditional sibling group timeouts follow the same rules.** If any sibling has `fs-assert-timeout`, it gets a per-assertion SLA timer (existing shared-timer behavior). If no sibling has a timeout, the GC handles the group. GC failure produces one group failure (same as today's timeout behavior for groups).

- R9. **Re-trigger tracking via attempt timestamps.** When a trigger fires and an assertion for the same key+type is already pending, record the timestamp in an `attempts` array on the assertion. When a resolved assertion is retried via `retryCompletedAssertion`, the attempts array resets. The `attempts` array is included in the payload, giving the collector full flexibility for rage-click detection, cadence analysis, and time-to-resolution from first trigger.

## Success Criteria

- An assertion on a slow 3G connection (5s API response) passes correctly without false failure
- An assertion on a fast connection that sets `fs-assert-timeout="1000"` still fails at 1s if the outcome didn't happen
- Stale assertions (never resolved) are cleaned up by the GC without leaking memory
- `config.timeout` is no longer accepted (breaking change, clean error)
- Existing `fs-assert-timeout` behavior is unchanged for developers who use it

## Scope Boundaries

- No adaptive GC (no network-speed detection) — fixed configurable interval
- No new status values — same `status: "failed"` with different `statusReason` messages
- New `attempts` array in payload for re-trigger tracking
- No changes to invariant assertion behavior
- No changes to how assertions pass (only how they fail when they don't resolve)

## Key Decisions

- **No default SLA:** Assertions without `fs-assert-timeout` have no per-assertion timer. This is the change that fixes slow devices — the default is "wait until resolved or GC'd."
- **Single GC interval, not per-assertion timers:** One `setInterval` replaces N `setTimeout` calls. Better performance, simpler lifecycle.
- **`config.timeout` removed, not repurposed:** Clean break. `config.gcInterval` is the new concept.
- **Status reason distinguishes GC from SLA:** Same `"failed"` status, different message. Avoids API surface changes.

## Edge Case Analysis

**Cross-contamination (false positive risk):** With a 30s window, a pending assertion could match a DOM change from a different user action. Example: form expects `.success-msg`, API silently fails, 20s later an unrelated action adds `.success-msg` — form assertion falsely passes. **Mitigation:** developers must scope selectors tightly. This is already a requirement for correctness regardless of timeout. Loose selectors are a bug at any timeout duration.

**Retry suppression:** If a user clicks Submit, the API fails silently, and they click again, the second click is a NOOP — the first assertion is still pending. **Accepted behavior:** the assertion question is "did this feature work?" not "did this specific click work?" If the outcome eventually appears from any click, the assertion passes. If it never appears, the GC catches it. Future: re-trigger count could be metadata for rage-click detection.

**Memory accumulation:** With 30s GC, pending assertions accumulate longer. On a busy SPA (10 actions/min, 2 assertions each), ~10 pending at any time. Assertion objects are small — trivial memory cost.

**Re-trigger dedup:** Current behavior already deduplicates — `findAssertion` finds the pending assertion and skips. With GC, the pending window is longer but the dedup logic is unchanged.

## Alternatives Considered

- **No GC, drop on page unload only:** Simplest but assertions leak memory on long-lived SPAs and the collector never sees failures for actions that silently didn't work.
- **Increase default timeout to 10s:** Band-aid. Still fails on very slow connections. Doesn't solve the conceptual conflation.
- **Adaptive GC based on network latency:** Over-engineered. Fixed 30s covers realistic worst cases.
- **Keep per-assertion timeouts, just increase default:** Doesn't separate GC from SLA. Every assertion gets the same treatment regardless of whether the developer intended a performance contract.

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Should the GC interval start on init or on first assertion creation? Starting on init wastes cycles on pages with no assertions.
- [Affects R3][Technical] How should the GC interact with the shared sibling group timeout? If one sibling in a group has `fs-assert-timeout` and another doesn't, does the SLA timer cover the group or only that sibling?
- [Affects R1][Needs research] Audit all usages of `config.timeout` in the codebase to ensure clean removal. Check if `timeout` is used in the config validation, init, collectors, or tests.

## Next Steps

→ `/ce:plan` for structured implementation planning
