# Faultsense Performance Benchmark Report

**faultsense 0.4.0** on http://localhost:3099/login (unthrottled, 5 pairs): LCP delta +4ms (significant), heap delta +2.5KB (significant).

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
| Agent commit | cfb3f61 |
| Agent bundle SHA-256 | `c7f5972268af818fd37c8416c995db3f4163770cde6faa8c52a3dc6b4b73ed51` |
| Target URL | http://localhost:3099/login |
| Resolved IP | 127.0.0.1 |
| Timestamp (UTC) | 2026-04-12T18:23:44.352Z |
| Pairs (including 1 warmup) | 5 |
| Soak duration | 30s |

## Results: Unthrottled (idle soak)

| Metric | A (without agent) | B (with agent) | Delta | Significance |
|---|---|---|---|---|
| LCP | 36ms (p95: 36ms, IQR: 0ms) | 40ms (p95: 44ms, IQR: 4ms) | +4ms | significant |
| CLS | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | within noise |
| INP | n/a (no interactions) | n/a | n/a | n/a |
| FCP | 36ms (p95: 36ms, IQR: 0ms) | 40ms (p95: 44ms, IQR: 4ms) | +4ms | significant |
| TTFB | 2.15ms (p95: 2.3ms, IQR: 0.2ms) | 2.1ms (p95: 2.3ms, IQR: 0.2ms) | -0.05ms | within noise |
| JSHeapUsedSize delta | 14.2KB (p95: 14.2KB, IQR: 0B) | 16.7KB (p95: 16.7KB, IQR: 0B) | +2.5KB | significant |
| DOM node delta | 102nodes (p95: 102nodes, IQR: 0nodes) | 102nodes (p95: 102nodes, IQR: 0nodes) | +0nodes | within noise |
| Long task count | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | within noise |
| Long task total ms | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| Wall clock delta | 31568ms (p95: 31570ms, IQR: 4ms) | 31567ms (p95: 31571ms, IQR: 5ms) | -1ms | within noise |

## Results: Slow 4G (562.5ms RTT, 1.4Mbps down) (idle soak)

| Metric | A (without agent) | B (with agent) | Delta | Significance |
|---|---|---|---|---|
| LCP | 38ms (p95: 40ms, IQR: 4ms) | 38ms (p95: 40ms, IQR: 4ms) | +0ms | within noise |
| CLS | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | within noise |
| INP | n/a (no interactions) | n/a | n/a | n/a |
| FCP | 38ms (p95: 40ms, IQR: 4ms) | 38ms (p95: 40ms, IQR: 4ms) | +0ms | within noise |
| TTFB | 2.3ms (p95: 2.5ms, IQR: 0.2ms) | 2ms (p95: 2.8ms, IQR: 1ms) | -0.3ms | measurable |
| JSHeapUsedSize delta | 14.2KB (p95: 32.3KB, IQR: 18.1KB) | 16.7KB (p95: 16.7KB, IQR: 0B) | +2.5KB | within noise |
| DOM node delta | 102nodes (p95: 102nodes, IQR: 0nodes) | 102nodes (p95: 102nodes, IQR: 0nodes) | +0nodes | within noise |
| Long task count | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | within noise |
| Long task total ms | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| Wall clock delta | 31572ms (p95: 31603ms, IQR: 33ms) | 31580ms (p95: 31586ms, IQR: 9ms) | +8ms | within noise |

## Results: Unthrottled (active)

| Metric | A (without agent) | B (with agent) | Delta | Significance |
|---|---|---|---|---|
| LCP | 36ms (p95: 44ms, IQR: 8ms) | 40ms (p95: 40ms, IQR: 0ms) | +4ms | within noise |
| CLS | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | within noise |
| INP | 16ms (p95: 24ms, IQR: 8ms) | 16ms (p95: 24ms, IQR: 8ms) | +0ms | within noise |
| FCP | 36ms (p95: 44ms, IQR: 8ms) | 40ms (p95: 40ms, IQR: 0ms) | +4ms | within noise |
| TTFB | 2.15ms (p95: 2.7ms, IQR: 0.9ms) | 1.5ms (p95: 1.8ms, IQR: 0.4ms) | -0.65ms | within noise |
| JSHeapUsedSize delta | 81.8KB (p95: 81.8KB, IQR: 0B) | 94.6KB (p95: 95.0KB, IQR: 732B) | +12.8KB | significant |
| DOM node delta | 1096nodes (p95: 1096nodes, IQR: 0nodes) | 1096nodes (p95: 1096nodes, IQR: 0nodes) | +0nodes | within noise |
| Long task count | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | within noise |
| Long task total ms | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| Wall clock delta | 34224ms (p95: 34260ms, IQR: 37ms) | 34233ms (p95: 34240ms, IQR: 14ms) | +9ms | within noise |

## Results: Slow 4G (562.5ms RTT, 1.4Mbps down) (active)

| Metric | A (without agent) | B (with agent) | Delta | Significance |
|---|---|---|---|---|
| LCP | 36ms (p95: 40ms, IQR: 4ms) | 36ms (p95: 36ms, IQR: 0ms) | +0ms | within noise |
| CLS | 0.060 (p95: 0.060, IQR: 0.001) | 0.060 (p95: 0.060, IQR: 0.000) | +0.001 | within noise |
| INP | 24ms (p95: 24ms, IQR: 0ms) | 24ms (p95: 24ms, IQR: 0ms) | +0ms | within noise |
| FCP | 36ms (p95: 40ms, IQR: 4ms) | 36ms (p95: 36ms, IQR: 0ms) | +0ms | within noise |
| TTFB | 1.75ms (p95: 2.6ms, IQR: 0.9ms) | 1.65ms (p95: 2ms, IQR: 0.5ms) | -0.1ms | within noise |
| JSHeapUsedSize delta | 81.9KB (p95: 81.9KB, IQR: 0B) | 88.5KB (p95: 88.5KB, IQR: 0B) | +6.6KB | measurable |
| DOM node delta | 1105nodes (p95: 1105nodes, IQR: 0nodes) | 1105nodes (p95: 1105nodes, IQR: 0nodes) | +0nodes | within noise |
| Long task count | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | within noise |
| Long task total ms | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| Wall clock delta | 38063.5ms (p95: 38096ms, IQR: 45ms) | 38037.5ms (p95: 38072ms, IQR: 35ms) | -26ms | within noise |

## Methodology

Each benchmark run launches a fresh Chromium instance per pair of measurements. Within each pair, condition A (page without faultsense) and condition B (page with faultsense) share the same browser process so V8 isolate noise cancels out in the differential.

Runs are strict A-B-A-B interleaved. The first pair is discarded as JIT warmup, leaving 4 usable pairs. Each measurement navigates to the target URL, waits for `load`, then sits idle for 30s (the "soak" window).

During the soak, the faultsense agent's internal 5s GC sweep runs ~6 times. This is legitimate agent work — the sweep checks for stale assertions and cleans up. It is not hidden or suppressed.

Heap measurements use `Performance.getMetrics` (not `performance.memory` which would pollute the target isolate). Two forced GCs (`HeapProfiler.collectGarbage`) run before each heap read to promote young-gen survivors. CPU profiler sampling interval is set to 100µs (default 1ms rounds microsecond-scale agent work to zero).

Web Vitals (LCP, CLS, INP, FCP, TTFB) are captured via the `web-vitals` v4 library injected alongside the instruments. Finalization is triggered explicitly via a synthetic `visibilitychange` event, not a magic sleep.

Network throttling is applied before navigation; CPU throttling is applied after navigation (following the Lighthouse convention).

## Caveats

- This report measures **cold load + idle soak** only. Scripted user interactions are not included.
- INP is a lab estimate in headless Chromium. Real-user INP requires actual interaction.
- Results are Chromium-only. Firefox and Safari are not tested.
- Pages behind authentication, bot challenges, or login redirects are not supported.
- Numbers are hardware-dependent. Compare against the disclosed environment, or run the tool yourself on comparable hardware.

## Raw Data

Full per-run measurements are available in the companion JSON file.
