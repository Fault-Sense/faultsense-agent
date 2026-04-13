# Faultsense Stress Benchmark Report

**faultsense 0.4.0** stress scaling curve. 13 configurations, 2 pairs each.

## Environment

| Field | Value |
|---|---|
| Machine | gendry.local |
| OS | Darwin 25.3.0 (arm64) |
| CPU | Apple M4 Pro (14 cores) |
| RAM | 48GB |
| Chromium | 147.0.7727.15 |
| Agent version | 0.4.0 |
| Agent commit | 1569318 |
| Timestamp (UTC) | 2026-04-13T17:42:17.459Z |
| Pairs (including 1 warmup) | 2 |
| Soak duration | 1s |

## Scaling Curve

| Assertions | Churn (mut/s) | Profile | MO P50 | MO P95 | MO P99 | INP Δ | Heap Δ | Long Tasks Δ | p-value (heap) |
|---|---|---|---|---|---|---|---|---|---|
| 50 | 0 | unthrottled | 0ms | 0.3ms | 0.5ms | +0ms | +76.3KB | +0 | <0.001 |
| 50 | 0 | cpu4x | 0ms | 0.7ms | 1.1ms | +0ms | +69.4KB | +0 | <0.001 |
| 50 | 100 | unthrottled | 0ms | 0.1ms | 0.3ms | +0ms | +92.4KB | +0 | <0.001 |
| 50 | 100 | cpu4x | 0ms | 0.7ms | 1ms | +0ms | +82.4KB | +0 | <0.001 |
| 200 | 0 | unthrottled | 0ms | 0.3ms | 0.5ms | +0ms | +114.5KB | +0 | <0.001 |
| 200 | 0 | cpu4x | 0ms | 0.7ms | 1.1ms | +0ms | +119.8KB | +0 | <0.001 |
| 200 | 100 | unthrottled | 0ms | 0.1ms | 0.3ms | +0ms | +149.5KB | +0 | <0.001 |
| 200 | 100 | cpu4x | 0ms | 0.7ms | 0.9ms | +0ms | +152.2KB | +0 | <0.001 |
| 1000 | 0 | unthrottled | 0.1ms | 0.6ms | 0.8ms | +0ms | +116.4KB | +0 | 0.001 |
| 1000 | 0 | cpu4x | 0.3ms | 1.1ms | 2.2ms | +0ms | +116.7KB | -1 | <0.001 |
| 1000 | 100 | unthrottled | 0.1ms | 0.2ms | 0.6ms | +0ms | +140.4KB | +0 | <0.001 |
| 1000 | 100 | cpu4x | 0.4ms | 1ms | 1.4ms | +0ms | +101.5KB | +0 | <0.001 |

## Baseline: A-vs-A Baseline (50 assertions, 0 churn/s) — Unthrottled

| Metric | A1 | A2 | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 68ms | 68ms | +0ms | [-6ms, +4ms] | 0.351 | within noise |
| CLS | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| INP | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| FCP | 68ms | 68ms | +0ms | [-6ms, +4ms] | 0.351 | within noise |
| TTFB | 2.45ms | 2.1ms | -0.35ms | [-0.5ms, -0.2ms] | 0.002 | significant |
| JSHeapUsedSize delta | 185.2KB | 185.2KB | +16B | [-23.8KB, +36.2KB] | 0.875 | within noise |
| DOM node delta | 203nodes | 203nodes | +0nodes | n/a | n/a | within noise |
| Long task count | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| Long task total ms | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| Wall clock delta | 31610ms | 31607.5ms | -2.5ms | [-6.5ms, -1ms] | 0.011 | measurable |

## 50 assertions, 0 churn/s — Unthrottled

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 76ms | 70ms | -6ms | [-8ms, +0ms] | 0.025 | measurable |
| CLS | 0.071 | 0.071 | +0.000 | n/a | n/a | within noise |
| INP | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| FCP | 76ms | 70ms | -6ms | [-8ms, +0ms] | 0.025 | measurable |
| TTFB | 2.2ms | 1.8ms | -0.4ms | [-0.7ms, -0.4ms] | 0.016 | measurable |
| JSHeapUsedSize delta | 546.4KB | 622.7KB | +76.3KB | [+70.4KB, +83.0KB] | <0.001 | significant |
| DOM node delta | 301nodes | 526nodes | +225nodes | [+225nodes, +225nodes] | <0.001 | significant |
| Long task count | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| Long task total ms | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| Wall clock delta | 35146ms | 35152ms | +6ms | [+2ms, +9.5ms] | 0.007 | significant |

**MutationObserver callback timing** (3068 callbacks): P50 0ms, P95 0.3ms, P99 0.5ms

## 50 assertions, 0 churn/s — CPU 4x throttle

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 72ms | 72ms | +0ms | [-4ms, +8ms] | 0.415 | within noise |
| CLS | 0.071 | 0.071 | +0.000 | n/a | n/a | within noise |
| INP | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| FCP | 72ms | 72ms | +0ms | [-4ms, +8ms] | 0.415 | within noise |
| TTFB | 2.2ms | 1.8ms | -0.4ms | [-0.55ms, +0ms] | 0.036 | measurable |
| JSHeapUsedSize delta | 550.9KB | 620.3KB | +69.4KB | [+67.3KB, +74.5KB] | <0.001 | significant |
| DOM node delta | 301nodes | 526nodes | +225nodes | [+225nodes, +225nodes] | <0.001 | significant |
| Long task count | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| Long task total ms | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| Wall clock delta | 35222ms | 35229.5ms | +7.5ms | [+3.5ms, +12ms] | 0.002 | significant |

**MutationObserver callback timing** (3057 callbacks): P50 0ms, P95 0.7ms, P99 1.1ms

## 50 assertions, 100 churn/s — Unthrottled

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 80ms | 78ms | -2ms | [-8ms, +0ms] | 0.099 | within noise |
| CLS | 0.071 | 0.071 | +0.000 | n/a | n/a | within noise |
| INP | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| FCP | 80ms | 78ms | -2ms | [-8ms, +0ms] | 0.099 | within noise |
| TTFB | 2.2ms | 1.85ms | -0.35ms | [-0.5ms, -0.25ms] | 0.001 | significant |
| JSHeapUsedSize delta | 1.4MB | 1.5MB | +92.4KB | [+89.4KB, +104.7KB] | <0.001 | significant |
| DOM node delta | 1802nodes | 2027nodes | +225nodes | [+225nodes, +225nodes] | <0.001 | significant |
| Long task count | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| Long task total ms | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| Wall clock delta | 35159.5ms | 35174ms | +14.5ms | [+11ms, +18.5ms] | <0.001 | significant |

**MutationObserver callback timing** (14553 callbacks): P50 0ms, P95 0.1ms, P99 0.3ms

## 50 assertions, 100 churn/s — CPU 4x throttle

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 96ms | 80ms | -16ms | [-20ms, -4ms] | 0.005 | significant |
| CLS | 0.071 | 0.071 | +0.000 | n/a | n/a | within noise |
| INP | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| FCP | 96ms | 80ms | -16ms | [-20ms, -4ms] | 0.005 | significant |
| TTFB | 2.4ms | 1.7ms | -0.7ms | [-0.9ms, -0.45ms] | 0.001 | significant |
| JSHeapUsedSize delta | 1.4MB | 1.5MB | +82.4KB | [+76.1KB, +87.9KB] | <0.001 | significant |
| DOM node delta | 1810nodes | 2035nodes | +225nodes | [+224nodes, +227nodes] | <0.001 | significant |
| Long task count | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| Long task total ms | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| Wall clock delta | 35265ms | 35278ms | +13ms | [+5.5ms, +16ms] | 0.003 | significant |

**MutationObserver callback timing** (8632 callbacks): P50 0ms, P95 0.7ms, P99 1ms

## 200 assertions, 0 churn/s — Unthrottled

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 88ms | 84ms | -4ms | [-8ms, -4ms] | 0.008 | significant |
| CLS | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| INP | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| FCP | 88ms | 84ms | -4ms | [-8ms, -4ms] | 0.008 | significant |
| TTFB | 2.1ms | 1.8ms | -0.3ms | [-0.6ms, -0.15ms] | 0.005 | significant |
| JSHeapUsedSize delta | 789.0KB | 903.5KB | +114.5KB | [+111.4KB, +122.3KB] | <0.001 | significant |
| DOM node delta | 816nodes | 1706nodes | +890nodes | [+890nodes, +890nodes] | <0.001 | significant |
| Long task count | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| Long task total ms | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| Wall clock delta | 35174ms | 35181ms | +7ms | [+1ms, +11ms] | 0.022 | measurable |

**MutationObserver callback timing** (3574 callbacks): P50 0ms, P95 0.3ms, P99 0.5ms

## 200 assertions, 0 churn/s — CPU 4x throttle

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 108ms | 88ms | -20ms | [-24ms, -14ms] | 0.001 | significant |
| CLS | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| INP | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| FCP | 108ms | 88ms | -20ms | [-24ms, -14ms] | 0.001 | significant |
| TTFB | 2.1ms | 1.6ms | -0.5ms | [-0.7ms, -0.4ms] | 0.001 | significant |
| JSHeapUsedSize delta | 787.3KB | 907.1KB | +119.8KB | [+95.8KB, +120.8KB] | <0.001 | significant |
| DOM node delta | 816nodes | 1706nodes | +890nodes | [+890nodes, +890nodes] | <0.001 | significant |
| Long task count | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| Long task total ms | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| Wall clock delta | 35261.5ms | 35267ms | +5.5ms | [+3ms, +11.5ms] | 0.003 | significant |

**MutationObserver callback timing** (3547 callbacks): P50 0ms, P95 0.7ms, P99 1.1ms

## 200 assertions, 100 churn/s — Unthrottled

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 88ms | 92ms | +4ms | [-2ms, +6ms] | 0.139 | within noise |
| CLS | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| INP | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| FCP | 88ms | 92ms | +4ms | [-2ms, +6ms] | 0.139 | within noise |
| TTFB | 2.1ms | 1.8ms | -0.3ms | [-0.6ms, +0.1ms] | 0.117 | within noise |
| JSHeapUsedSize delta | 1.6MB | 1.7MB | +149.5KB | [+148.6KB, +157.8KB] | <0.001 | significant |
| DOM node delta | 2317nodes | 3207nodes | +890nodes | [+890nodes, +890nodes] | <0.001 | significant |
| Long task count | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| Long task total ms | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| Wall clock delta | 35187.5ms | 35207.5ms | +20ms | [+17ms, +21ms] | <0.001 | significant |

**MutationObserver callback timing** (18173 callbacks): P50 0ms, P95 0.1ms, P99 0.3ms

## 200 assertions, 100 churn/s — CPU 4x throttle

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 90ms | 92ms | +2ms | [-4ms, +6ms] | 0.650 | within noise |
| CLS | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| INP | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| FCP | 90ms | 92ms | +2ms | [-4ms, +6ms] | 0.650 | within noise |
| TTFB | 2.3ms | 1.8ms | -0.5ms | [-0.7ms, -0.05ms] | 0.045 | measurable |
| JSHeapUsedSize delta | 1.6MB | 1.7MB | +152.2KB | [+142.6KB, +163.4KB] | <0.001 | significant |
| DOM node delta | 2317nodes | 3207nodes | +890nodes | [+890nodes, +890nodes] | <0.001 | significant |
| Long task count | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| Long task total ms | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| Wall clock delta | 35304.5ms | 35329ms | +24.5ms | [+16ms, +27ms] | <0.001 | significant |

**MutationObserver callback timing** (14365 callbacks): P50 0ms, P95 0.7ms, P99 0.9ms

## 1000 assertions, 0 churn/s — Unthrottled

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 142ms | 148ms | +6ms | [+4ms, +12ms] | 0.006 | significant |
| CLS | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| INP | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| FCP | 142ms | 148ms | +6ms | [+4ms, +12ms] | 0.006 | significant |
| TTFB | 2.3ms | 1.85ms | -0.45ms | [-0.6ms, -0.05ms] | 0.025 | measurable |
| JSHeapUsedSize delta | 859.6KB | 976.0KB | +116.4KB | [+114.3KB, +124.7KB] | 0.001 | significant |
| DOM node delta | 3696nodes | 6546nodes | +2850nodes | [+2850nodes, +2850nodes] | <0.001 | significant |
| Long task count | 1.000 | 1.000 | +0.000 | n/a | n/a | within noise |
| Long task total ms | 67ms | 90ms | +23ms | [+22ms, +23.5ms] | <0.001 | significant |
| Wall clock delta | 35270.5ms | 35285.5ms | +15ms | [+11.5ms, +21ms] | <0.001 | significant |

**MutationObserver callback timing** (5247 callbacks): P50 0.1ms, P95 0.6ms, P99 0.8ms

## 1000 assertions, 0 churn/s — CPU 4x throttle

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 144ms | 152ms | +8ms | [-4ms, +12ms] | 0.092 | within noise |
| CLS | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| INP | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| FCP | 144ms | 152ms | +8ms | [-4ms, +12ms] | 0.092 | within noise |
| TTFB | 2.05ms | 1.7ms | -0.35ms | [-0.7ms, -0.4ms] | 0.001 | significant |
| JSHeapUsedSize delta | 859.8KB | 976.6KB | +116.7KB | [+115.2KB, +121.6KB] | <0.001 | significant |
| DOM node delta | 3694nodes | 6539nodes | +2845nodes | [+2845nodes, +2845nodes] | <0.001 | significant |
| Long task count | 2.000 | 1.000 | -1.000 | [-1.000, -1.000] | 0.002 | significant |
| Long task total ms | 119ms | 90ms | -29ms | [-30ms, -4ms] | 0.002 | significant |
| Wall clock delta | 35466.5ms | 35485ms | +18.5ms | [+15ms, +27ms] | <0.001 | significant |

**MutationObserver callback timing** (4976 callbacks): P50 0.3ms, P95 1.1ms, P99 2.2ms

## 1000 assertions, 100 churn/s — Unthrottled

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 144ms | 154ms | +10ms | [+6ms, +14ms] | 0.007 | significant |
| CLS | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| INP | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| FCP | 144ms | 154ms | +10ms | [+6ms, +14ms] | 0.007 | significant |
| TTFB | 2.1ms | 1.7ms | -0.4ms | [-0.7ms, -0.2ms] | 0.005 | significant |
| JSHeapUsedSize delta | 1.6MB | 1.8MB | +140.4KB | [+137.3KB, +142.8KB] | <0.001 | significant |
| DOM node delta | 5197nodes | 8047nodes | +2850nodes | [+2850nodes, +2850nodes] | <0.001 | significant |
| Long task count | 1.000 | 1.000 | +0.000 | n/a | n/a | within noise |
| Long task total ms | 71.5ms | 95ms | +23.5ms | [+23ms, +25ms] | <0.001 | significant |
| Wall clock delta | 35281.5ms | 35298.5ms | +17ms | [+14ms, +25.5ms] | 0.002 | significant |

**MutationObserver callback timing** (19535 callbacks): P50 0.1ms, P95 0.2ms, P99 0.6ms

## 1000 assertions, 100 churn/s — CPU 4x throttle

| Metric | A (without agent) | B (with agent) | Delta | 95% CI | p-value | Significance |
|---|---|---|---|---|---|---|
| LCP | 148ms | 160ms | +12ms | [+8ms, +16ms] | 0.016 | measurable |
| CLS | 0.000 | 0.000 | +0.000 | n/a | n/a | within noise |
| INP | 0ms | 0ms | +0ms | n/a | n/a | within noise |
| FCP | 148ms | 160ms | +12ms | [+8ms, +16ms] | 0.016 | measurable |
| TTFB | 2.1ms | 1.6ms | -0.5ms | [-0.7ms, -0.1ms] | 0.035 | measurable |
| JSHeapUsedSize delta | 1.6MB | 1.7MB | +101.5KB | [+78.3KB, +113.7KB] | <0.001 | significant |
| DOM node delta | 5168nodes | 7896.5nodes | +2728.5nodes | [+2719nodes, +2739nodes] | <0.001 | significant |
| Long task count | 2.000 | 2.000 | +0.000 | n/a | n/a | within noise |
| Long task total ms | 129ms | 151ms | +22ms | [+20.5ms, +23.5ms] | <0.001 | significant |
| Wall clock delta | 35510.5ms | 35549ms | +38.5ms | [+35ms, +54ms] | <0.001 | significant |

**MutationObserver callback timing** (14953 callbacks): P50 0.4ms, P95 1ms, P99 1.4ms

## Methodology

Each configuration runs a React 19 stress harness with configurable assertion density and background DOM churn. Assertions cycle through 8 archetypes (click→updated, click→added, click→removed, input→visible, submit→conditional, mount→visible, invariant→stable, click→OOB chain) to exercise all resolver code paths.

MutationObserver callback timing is captured by wrapping the MutationObserver constructor before agent load, adding performance.mark/measure around each callback invocation. The wrapper adds <0.01ms overhead per callback.
