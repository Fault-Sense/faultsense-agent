# Faultsense Performance Benchmark Report

**faultsense 0.4.0** on http://localhost:3099/login (unthrottled, 30 pairs): LCP delta -4ms (measurable), heap delta +1.7KB (measurable).

## Environment

| Field | Value |
|---|---|
| Machine | gendry.local |
| OS | Darwin 25.3.0 (arm64) |
| CPU | Apple M4 Pro (14 cores) |
| RAM | 48GB |
| Node | v22.21.0 |
| Playwright | 1.59.1 |
| Chromium | 147.0.7727.15 |
| Agent version | 0.4.0 |
| Agent commit | 1569318 |
| Agent bundle SHA-256 | `c7f5972268af818fd37c8416c995db3f4163770cde6faa8c52a3dc6b4b73ed51` |
| Target URL | http://localhost:3099/login |
| Resolved IP | 127.0.0.1 |
| Timestamp (UTC) | 2026-04-13T13:52:21.962Z |
| Pairs (including 1 warmup) | 30 |
| Soak duration | 60s |

## Results: Unthrottled (idle soak)

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 40ms (p95: 44ms, IQR: 4ms) | 36ms (p95: 40ms, IQR: 4ms) | -4ms | [-6ms, +0ms] | 0.033 | measurable |
| CLS | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | n/a | n/a | within noise |
| INP | n/a (no interactions) | n/a | n/a | n/a | n/a | n/a |
| FCP | 40ms (p95: 44ms, IQR: 4ms) | 36ms (p95: 40ms, IQR: 4ms) | -4ms | [-6ms, +0ms] | 0.033 | measurable |
| TTFB | 2.2ms (p95: 2.6ms, IQR: 0.3ms) | 1.9ms (p95: 2.5ms, IQR: 0.5ms) | -0.3ms | [-0.55ms, -0.2ms] | <0.001 | significant |
| JSHeapUsedSize delta | 14.2KB (p95: 60.7KB, IQR: 0B) | 15.8KB (p95: 15.8KB, IQR: 0B) | +1.7KB | [+1.5KB, +1.7KB] | 0.021 | measurable |
| DOM node delta | 102nodes (p95: 102nodes, IQR: 0nodes) | 102nodes (p95: 102nodes, IQR: 0nodes) | +0nodes | n/a | n/a | within noise |
| Long task count | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | n/a | n/a | within noise |
| Long task total ms | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | n/a | n/a | within noise |
| Wall clock delta | 61580ms (p95: 61584ms, IQR: 3ms) | 61578ms (p95: 61583ms, IQR: 3ms) | -2ms | [-3ms, -1.5ms] | 0.001 | significant |

## Results: Slow 4G (562.5ms RTT, 1.4Mbps down) (idle soak)

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 40ms (p95: 48ms, IQR: 4ms) | 36ms (p95: 40ms, IQR: 8ms) | -4ms | [-8ms, -2ms] | 0.007 | significant |
| CLS | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | n/a | n/a | within noise |
| INP | n/a (no interactions) | n/a | n/a | n/a | n/a | n/a |
| FCP | 40ms (p95: 48ms, IQR: 4ms) | 36ms (p95: 40ms, IQR: 8ms) | -4ms | [-8ms, -2ms] | 0.007 | significant |
| TTFB | 2.2ms (p95: 2.7ms, IQR: 0.5ms) | 1.8ms (p95: 2.4ms, IQR: 0.3ms) | -0.4ms | [-0.55ms, -0.2ms] | <0.001 | significant |
| JSHeapUsedSize delta | 14.2KB (p95: 14.2KB, IQR: 0B) | 15.8KB (p95: 15.8KB, IQR: 0B) | +1.7KB | [+1.7KB, +1.7KB] | <0.001 | significant |
| DOM node delta | 102nodes (p95: 102nodes, IQR: 0nodes) | 102nodes (p95: 102nodes, IQR: 0nodes) | +0nodes | n/a | n/a | within noise |
| Long task count | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | n/a | n/a | within noise |
| Long task total ms | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | n/a | n/a | within noise |
| Wall clock delta | 61581ms (p95: 61585ms, IQR: 4ms) | 61579ms (p95: 61583ms, IQR: 3ms) | -2ms | [-4ms, -0.5ms] | 0.030 | measurable |

## Results: Unthrottled (active)

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 40ms (p95: 48ms, IQR: 4ms) | 36ms (p95: 44ms, IQR: 4ms) | -4ms | [-6ms, +0ms] | 0.057 | within noise |
| CLS | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | n/a | n/a | within noise |
| INP | 24ms (p95: 24ms, IQR: 8ms) | 24ms (p95: 24ms, IQR: 8ms) | +0ms | [-8ms, +8ms] | 0.807 | within noise |
| FCP | 40ms (p95: 48ms, IQR: 4ms) | 36ms (p95: 44ms, IQR: 4ms) | -4ms | [-6ms, +0ms] | 0.057 | within noise |
| TTFB | 2.1ms (p95: 2.9ms, IQR: 0.3ms) | 1.7ms (p95: 2.8ms, IQR: 0.4ms) | -0.4ms | [-0.6ms, -0.25ms] | <0.001 | significant |
| JSHeapUsedSize delta | 81.8KB (p95: 81.8KB, IQR: 0B) | 74.9KB (p95: 74.9KB, IQR: 0B) | -6.9KB | [-6.9KB, -6.9KB] | <0.001 | significant |
| DOM node delta | 1096nodes (p95: 1096nodes, IQR: 0nodes) | 1096nodes (p95: 1096nodes, IQR: 0nodes) | +0nodes | n/a | n/a | within noise |
| Long task count | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | n/a | n/a | within noise |
| Long task total ms | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | n/a | n/a | within noise |
| Wall clock delta | 64265ms (p95: 64298ms, IQR: 25ms) | 64265ms (p95: 64289ms, IQR: 19ms) | +0ms | [-5ms, +11ms] | 0.350 | within noise |

## Results: Slow 4G (562.5ms RTT, 1.4Mbps down) (active)

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 40ms (p95: 56ms, IQR: 8ms) | 40ms (p95: 40ms, IQR: 4ms) | +0ms | [-8ms, +0ms] | 0.024 | measurable |
| CLS | 0.060 (p95: 0.060, IQR: 0.001) | 0.060 (p95: 0.060, IQR: 0.001) | +0.000 | [-0.001, +0.000] | 0.496 | within noise |
| INP | 16ms (p95: 24ms, IQR: 8ms) | 24ms (p95: 24ms, IQR: 8ms) | +8ms | [+0ms, +8ms] | 0.262 | within noise |
| FCP | 40ms (p95: 56ms, IQR: 8ms) | 40ms (p95: 40ms, IQR: 4ms) | +0ms | [-8ms, +0ms] | 0.024 | measurable |
| TTFB | 2ms (p95: 2.6ms, IQR: 0.5ms) | 1.7ms (p95: 2.2ms, IQR: 0.3ms) | -0.3ms | [-0.5ms, -0.2ms] | <0.001 | significant |
| JSHeapUsedSize delta | 81.9KB (p95: 81.9KB, IQR: 0B) | 74.0KB (p95: 74.0KB, IQR: 0B) | -7.9KB | [-7.9KB, -7.9KB] | <0.001 | significant |
| DOM node delta | 1105nodes (p95: 1105nodes, IQR: 0nodes) | 1105nodes (p95: 1105nodes, IQR: 0nodes) | +0nodes | n/a | n/a | within noise |
| Long task count | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | n/a | n/a | within noise |
| Long task total ms | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | n/a | n/a | within noise |
| Wall clock delta | 68053ms (p95: 68115ms, IQR: 34ms) | 68066ms (p95: 68128ms, IQR: 47ms) | +13ms | [-6ms, +24ms] | 0.320 | within noise |

## Methodology

Each benchmark run launches a fresh Chromium instance per pair of measurements. Within each pair, condition A (page without faultsense) and condition B (page with faultsense) share the same browser process so V8 isolate noise cancels out in the differential.

Runs are strict A-B-A-B interleaved. The first pair is discarded as JIT warmup, leaving 29 usable pairs. Each measurement navigates to the target URL, waits for `load`, then sits idle for 60s (the "soak" window).

During the soak, the faultsense agent's internal 5s GC sweep runs ~12 times. This is legitimate agent work — the sweep checks for stale assertions and cleans up. It is not hidden or suppressed.

Heap measurements use `Performance.getMetrics` (not `performance.memory` which would pollute the target isolate). Two forced GCs (`HeapProfiler.collectGarbage`) run before each heap read to promote young-gen survivors. CPU profiler sampling interval is set to 100µs (default 1ms rounds microsecond-scale agent work to zero).

Web Vitals (LCP, CLS, INP, FCP, TTFB) are captured via the `web-vitals` v4 library injected alongside the instruments. Finalization is triggered explicitly via a synthetic `visibilitychange` event, not a magic sleep.

Network throttling is applied before navigation; CPU throttling is applied after navigation (following the Lighthouse convention).

Statistical significance is assessed via the Wilcoxon signed-rank test (two-tailed, non-parametric) on paired A-B differences. The 95% confidence interval is the Hodges-Lehmann estimator over Walsh averages. p < 0.01 = significant, 0.01 ≤ p < 0.05 = measurable, p ≥ 0.05 = within noise.

## Caveats

- This report measures **cold load + idle soak** and **scripted active-state interactions**.
- INP is a lab estimate in headless Chromium. Real-user INP requires actual interaction.
- Results are Chromium-only. Firefox and Safari are not tested.
- Pages behind authentication, bot challenges, or login redirects are not supported.
- Numbers are hardware-dependent. Compare against the disclosed environment, or run the tool yourself on comparable hardware.

## Raw Data

Full per-run measurements are available in the companion JSON file.
