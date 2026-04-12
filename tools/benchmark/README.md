# Faultsense Performance Benchmark Tool

Measures the page performance impact of the faultsense agent by running paired A/B sessions (with and without the agent injected) in real Chromium via Playwright.

## Quick Start

```bash
# Benchmark any public URL
npm run benchmark -- https://example.com

# Benchmark our demo app (self-dogfooding)
npm run benchmark:demo
```

## Requirements

- Node.js 18+
- Playwright's Chromium browser (`npx playwright install chromium`)
- Agent build artifact (`npm run build:agent`)

## How It Works

1. Launches headless Chromium via Playwright
2. Runs **10 paired A-B measurements** per throttle profile (first pair discarded as warmup)
3. **Condition A** (baseline): page loaded with shared measurement instruments only
4. **Condition B** (treatment): page loaded with instruments + faultsense agent + `Faultsense.init()`
5. Each measurement: navigate to URL, wait for `load`, idle soak for 60s, collect metrics
6. Produces a Markdown + JSON report with statistics

Both conditions install identical measurement instruments (longtask observer, web-vitals) so paired differential cancels instrument overhead.

## Modes

### URL mode (default)

Point at any public URL:

```bash
npm run benchmark -- https://your-site.com
# or
FS_BENCH_URL=https://your-site.com npm run benchmark
```

Output: `tools/benchmark/results/report.md` and `report.json`.

### Demo mode

Boots `examples/todolist-htmx` locally and benchmarks it:

```bash
npm run benchmark:demo
```

Output: `docs/performance/current.md` and `current.json`.

Demo mode injects an **at-rest scrub** that removes all `fs-*` attributes from the DOM, simulating a page without faultsense instrumentation. This matches what a customer sees on their own pages.

## What's Measured

### Core Web Vitals
- **LCP** (Largest Contentful Paint)
- **CLS** (Cumulative Layout Shift)
- **INP** (Interaction to Next Paint) — lab estimate only
- **FCP** (First Contentful Paint)
- **TTFB** (Time to First Byte)

### Idle Soak Metrics
- **JSHeapUsedSize delta** — heap growth during the 60s soak (after forced GC)
- **DOM node count** — via CDP `Memory.getDOMCounters`
- **Long task count and total ms** — via `PerformanceObserver`

### Throttle Profiles
- **Unthrottled** — no CPU or network throttling
- **Slow 4G** — 562.5ms RTT, 1.4Mbps down, 675Kbps up (Lighthouse-aligned)

## Interpreting Results

Each metric shows:
- **A median** (without agent) and **B median** (with agent)
- **Delta** (B - A)
- **Significance label**: `within noise`, `measurable`, or `significant`

The significance threshold is `max(baseline IQR, 5% of baseline median)`. Deltas below this are noise; between 1x and 2x are measurable; above 2x are significant.

## CI Usage

The tool refuses to run in CI by default — shared-runner numbers are not meaningful for procurement. To override:

```bash
npm run benchmark -- --allow-ci https://example.com
```

Reports generated with `--allow-ci` are tagged with `[SHARED-RUNNER-SMOKE]` in the headline.

## Troubleshooting

### "Agent bundle not found"
Run `npm run build:agent` before benchmarking.

### "Faultsense agent was not detected after injection"
The target page's Content-Security-Policy may be blocking the injected script. Try a different URL without strict CSP, or check the page's CSP headers.

### Noisy results
- Run on a quiet machine (close other apps, disable background sync)
- Ensure the machine is plugged in (battery saver throttles CPU)
- Check the IQR column — high IQR indicates environmental noise

## Privacy Note

When benchmarking a URL you don't own, the JSON output may contain tracker URLs, third-party script URLs, and resolved IP addresses from the profiler output. Review the JSON before publishing.
