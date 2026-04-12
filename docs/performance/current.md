# Faultsense Performance Benchmark Report

**faultsense 0.4.0** on http://localhost:3099/login (unthrottled, 5 pairs): LCP delta +0ms (within noise), heap delta +2.5KB (significant).

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
| Agent commit | e1f7ce6 |
| Agent bundle SHA-256 | `c7f5972268af818fd37c8416c995db3f4163770cde6faa8c52a3dc6b4b73ed51` |
| Target URL | http://localhost:3099/login |
| Resolved IP | 127.0.0.1 |
| Timestamp (UTC) | 2026-04-12T15:50:55.927Z |
| Pairs (including 1 warmup) | 5 |
| Soak duration | 30s |

## Results: Unthrottled

| Metric | A (without agent) | B (with agent) | Delta | Significance |
|---|---|---|---|---|
| LCP | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| CLS | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | within noise |
| INP | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| FCP | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| TTFB | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| JSHeapUsedSize delta | 5.2KB (p95: 5.2KB, IQR: 0B) | 7.7KB (p95: 7.7KB, IQR: 0B) | +2.5KB | significant |
| DOM node delta | 102nodes (p95: 102nodes, IQR: 0nodes) | 102nodes (p95: 102nodes, IQR: 0nodes) | +0nodes | within noise |
| Long task count | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | within noise |
| Long task total ms | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| Wall clock delta | 30551ms (p95: 30553ms, IQR: 3ms) | 30554.5ms (p95: 30558ms, IQR: 4ms) | +3.5ms | within noise |

## Results: Slow 4G (562.5ms RTT, 1.4Mbps down)

| Metric | A (without agent) | B (with agent) | Delta | Significance |
|---|---|---|---|---|
| LCP | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| CLS | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | within noise |
| INP | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| FCP | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| TTFB | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| JSHeapUsedSize delta | 5.2KB (p95: 5.2KB, IQR: 0B) | 7.7KB (p95: 7.7KB, IQR: 0B) | +2.5KB | significant |
| DOM node delta | 102nodes (p95: 102nodes, IQR: 0nodes) | 102nodes (p95: 102nodes, IQR: 0nodes) | +0nodes | within noise |
| Long task count | 0.000 (p95: 0.000, IQR: 0.000) | 0.000 (p95: 0.000, IQR: 0.000) | +0.000 | within noise |
| Long task total ms | 0ms (p95: 0ms, IQR: 0ms) | 0ms (p95: 0ms, IQR: 0ms) | +0ms | within noise |
| Wall clock delta | 32296ms (p95: 32301ms, IQR: 6ms) | 32295.5ms (p95: 32300ms, IQR: 7ms) | -0.5ms | within noise |

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
