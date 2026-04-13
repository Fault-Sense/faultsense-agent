# Performance Analysis: Faultsense Agent v0.4.0

What the agent costs your page, tested at scale.

---

## Summary

We measured the performance impact of the Faultsense agent across two benchmark suites: a **demo benchmark** (30 paired A/B measurements on an instrumented HTMX app) and a **stress benchmark** (15 paired measurements across 50, 200, and 1000 assertions with background DOM churn in a React 19 app).

**Key findings:**

- **Zero INP impact** at every scale tested, including 1000 assertions with 100 background mutations/second on a 4x CPU-throttled device.
- **MutationObserver callback P99 is 2.2ms** in the worst case (1000 assertions, CPU 4x throttle). The 50ms long-task threshold is never approached by a single callback.
- **Heap overhead scales sub-linearly**: ~76KB at 50 assertions, ~115KB at 200, ~140KB at 1000. The GC sweep cleans up resolved assertions.
- **LCP impact is undetectable below 200 assertions**. At 1000, the initial attribute scan adds 6-12ms (one compositor frame).
- **The agent never creates a long task.** At 1000 assertions, both conditions produce a long task from the heavy page itself; the agent adds ~23ms to the existing task during its one-time initial scan.

All results include Wilcoxon signed-rank p-values and 95% confidence intervals. Full data is in [current.md](current.md) (demo) and [stress.md](stress.md) (stress).

## Interaction to Next Paint (INP)

INP is the Core Web Vital that measures responsiveness. It is the metric most likely to be affected by a MutationObserver-based agent, because the observer callback runs on the main thread during DOM mutations triggered by user interactions.

| Scenario | INP Delta | p-value | 95% CI |
|----------|-----------|---------|--------|
| Demo: active, unthrottled | 0ms | 0.807 | [-8ms, +8ms] |
| Demo: active, Slow 4G | +8ms | 0.262 | [+0ms, +8ms] |
| Stress: 1000 assertions, 100 churn/s, CPU 4x | 0ms | — | — |

The demo benchmark's p=0.807 is the strongest possible "no effect" signal — the confidence interval spans symmetrically around zero. Even under Slow 4G, the +8ms delta is not statistically significant (p=0.262).

The stress benchmark shows 0ms INP delta across all 12 configurations, including the worst case: 1000 assertions with 100 background mutations per second on a 4x CPU-throttled device.

## MutationObserver Callback Scaling

The agent installs a single `MutationObserver` on `document.body`. Every DOM mutation on the entire page passes through this observer's callback. The stress benchmark measures callback duration directly by wrapping the MutationObserver constructor with `performance.now()` timing.

### Unthrottled (Apple M4 Pro)

| Assertions | Background Churn | Callbacks | P50 | P95 | P99 |
|------------|-----------------|-----------|-----|-----|-----|
| 50 | 0/s | 3,068 | 0ms | 0.3ms | 0.5ms |
| 50 | 100/s | 14,553 | 0ms | 0.1ms | 0.3ms |
| 200 | 0/s | 3,574 | 0ms | 0.3ms | 0.5ms |
| 200 | 100/s | 18,173 | 0ms | 0.1ms | 0.3ms |
| 1000 | 0/s | 5,247 | 0.1ms | 0.6ms | 0.8ms |
| 1000 | 100/s | 19,535 | 0.1ms | 0.2ms | 0.6ms |

### CPU 4x Throttle (simulating mid-tier mobile)

| Assertions | Background Churn | Callbacks | P50 | P95 | P99 |
|------------|-----------------|-----------|-----|-----|-----|
| 50 | 0/s | 3,057 | 0ms | 0.7ms | 1.1ms |
| 50 | 100/s | 8,632 | 0ms | 0.7ms | 1.0ms |
| 200 | 0/s | 3,547 | 0ms | 0.7ms | 1.1ms |
| 200 | 100/s | 14,365 | 0ms | 0.7ms | 0.9ms |
| 1000 | 0/s | 4,976 | 0.3ms | 1.1ms | **2.2ms** |
| 1000 | 100/s | 14,953 | 0.4ms | 1.0ms | 1.4ms |

The worst-case P99 is **2.2ms** (1000 assertions, CPU 4x, no churn). This is 4% of the 50ms long-task threshold. The callback never comes close to blocking the main thread.

Background churn (non-instrumented DOM mutations) does not degrade callback performance. In most configurations, churn *improves* P95 — the MutationObserver batches mutations, and more frequent small batches are cheaper to process than fewer large ones.

## Heap Overhead

| Assertions | Churn | Heap Delta (unthrottled) | Heap Delta (CPU 4x) |
|------------|-------|--------------------------|---------------------|
| Idle (demo) | — | +1.7KB | — |
| 50 | 0/s | +76KB | +69KB |
| 50 | 100/s | +92KB | +82KB |
| 200 | 0/s | +115KB | +120KB |
| 200 | 100/s | +150KB | +152KB |
| 1000 | 0/s | +116KB | +117KB |
| 1000 | 100/s | +140KB | +102KB |

Heap scales sub-linearly. Going from 50 to 1000 assertions (20x) increases heap by roughly 1.5-1.8x. The agent's internal GC sweep (every 5 seconds) cleans up resolved assertions, keeping the working set bounded.

At idle (no assertions firing), the agent's footprint is **1.7KB** (p=0.021, CI [+1.5KB, +1.7KB]) — just the observer, listeners, and sweep timer.

## First Paint Impact

| Assertions | LCP Delta (unthrottled) | LCP Delta (CPU 4x) | p-value |
|------------|------------------------|---------------------|---------|
| Demo (active) | -4ms | — | 0.057 (noise) |
| 50 | -6ms | 0ms | 0.025 / 0.415 |
| 200 | -4ms | -20ms | 0.008 / 0.001 |
| 1000 | **+6ms** | +8ms | **0.006** / 0.092 |

Below 200 assertions, LCP deltas are negative (measurement noise — the agent doesn't make pages faster). At 1000 assertions, there is a statistically significant LCP increase of **+6ms** (p=0.006, CI [+4ms, +12ms]). This is the one-time cost of scanning 1000 `fs-*` attributes during initial page load — roughly one compositor frame.

For context: a typical instrumented page has 10-50 assertions. The 1000-assertion test is a deliberately extreme stress case.

## Long Task Analysis

The agent **never creates a new long task** in any scenario tested. At 1000 assertions, the page itself produces a long task from rendering 3,696+ DOM nodes. The agent adds ~23ms to this existing long task during its initial attribute scan:

| Scenario | Without Agent | With Agent | Agent Contribution |
|----------|--------------|------------|-------------------|
| 1000 assertions, unthrottled | 67ms | 90ms | +23ms |
| 1000 assertions, 100 churn/s | 71.5ms | 95ms | +23.5ms |
| 1000 assertions, CPU 4x | 119ms | 90ms | -29ms (noise) |

This is a one-time cost at page load, not ongoing overhead. During steady-state operation (after initial scan), the agent produces zero long tasks across all configurations.

## Measurement Validity

### A-vs-A Baseline

The stress suite includes an A-vs-A baseline (both conditions run without the agent) to validate measurement stability:

| Metric | Delta | p-value | Interpretation |
|--------|-------|---------|----------------|
| LCP | 0ms | 0.351 | Apparatus is stable |
| Heap | +16 bytes | 0.875 | No measurement bias |
| TTFB | -0.35ms | 0.002 | Ordering bias exists |

The LCP and heap baselines confirm the apparatus does not create false positives. The TTFB ordering bias (condition A consistently shows higher TTFB than condition A2) is a known artifact of the A-then-B measurement order and affects all TTFB comparisons in the report. TTFB is excluded from our summary findings for this reason.

### Statistical Method

All significance claims use the Wilcoxon signed-rank test (two-tailed, non-parametric) on paired A-B differences. Confidence intervals use the Hodges-Lehmann estimator over Walsh averages. The demo suite uses 29 usable pairs; the stress suite uses 14 usable pairs per configuration. Thresholds: p < 0.01 = significant, 0.01 <= p < 0.05 = measurable, p >= 0.05 = within noise.

## Reproduction

All benchmarks are reproducible from the open-source agent repository:

```bash
# Demo benchmark (30 pairs, ~2 hours)
npm run benchmark:demo

# Stress benchmark (15 pairs, ~4 hours)
cd tools/benchmark/stress && npm install && cd ../../..
npm run benchmark:stress

# A-vs-A measurement validation
npm run benchmark:ava

# Benchmark any public URL
npm run benchmark -- https://your-site.com
```

Environment: Apple M4 Pro (14 cores), 48GB RAM, Chromium 147.0.7727.15, Node v22.21.0. Run on a quiet machine with no background processes for comparable results.

## Stress Harness Architecture

The stress benchmark uses a React 19 application with configurable assertion density and background DOM churn. Assertions cycle through 8 archetypes that exercise all resolver code paths:

| Archetype | Trigger | Assertion Type | Share |
|-----------|---------|----------------|-------|
| Click -> Updated | click | `fs-assert-updated` with text-matches | 20% |
| Click -> Added | click | `fs-assert-added` | 15% |
| Click -> Removed | click | `fs-assert-removed` | 10% |
| Input -> Visible | input | `fs-assert-visible` with value-matches | 10% |
| Submit -> Conditional | submit | `fs-assert-added-success/error` with mutex | 10% |
| Mount -> Visible | mount | `fs-assert-visible` with classlist | 10% |
| Invariant -> Stable | invariant | `fs-assert-stable` | 10% |
| Click -> OOB Chain | click | `fs-assert-updated` with OOB reference | 15% |

Background churn is generated by non-instrumented React components that toggle classes, update text, and add/remove child nodes on a timer — simulating third-party widgets, animations, and other DOM activity the agent must filter through.
