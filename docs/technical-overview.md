# Faultsense Technical Overview

How the agent works, what we test it against, and what it costs your page.

---

## What Faultsense Does

Faultsense is a browser agent (8.7KB gzipped, zero dependencies) that validates feature correctness in production. You declare assertions directly in your HTML via `fs-*` attributes — the same logic you'd write in a Playwright or Cypress test — and the agent evaluates them against every real user session.

When a user interacts with an instrumented feature, the agent observes the resulting DOM mutations and reports whether the expected outcome occurred. A passed assertion means the feature worked. A failed assertion means it didn't — and the report includes which assertion, which release, and what the DOM looked like.

The agent does not modify your page. It installs a single `MutationObserver` on `document.body`, listens for the trigger events you declare, and reports results to your collector endpoint. No network interception, no DOM modification, no monkey-patching of browser APIs.

## Performance Impact

### Key Findings

- **Zero INP impact** at every scale tested, including 1,000 assertions with 100 background mutations/second on a 4x CPU-throttled device.
- **MutationObserver callback P99 is 2.2ms** in the worst case — 4% of the 50ms long-task threshold. The callback never comes close to blocking the main thread.
- **Heap scales sub-linearly:** +76KB at 50 assertions, +150KB at 200, +140KB at 1,000. The GC sweep keeps the working set bounded.
- **The agent never creates a long task** in any scenario we tested.
- **At idle, the agent's footprint is 1.7KB** — just the observer, listeners, and sweep timer.

### Methodology

We measure performance impact using a Playwright-based benchmark tool that runs paired A/B sessions in real Chromium:

- **Condition A:** Your page loaded normally, without the faultsense agent.
- **Condition B:** Your page loaded with the faultsense agent installed, initialized, and actively resolving assertions during user interactions.

Each demo benchmark run executes 30 paired measurements (first pair discarded as JIT warmup, leaving 29 usable data points), with strict A-B-A-B interleaving to cancel out system noise. Measurements include a 60-second idle soak after page load to capture any ongoing agent work (the internal garbage collection sweep runs every 5 seconds).

Metrics are captured via Chrome DevTools Protocol: heap snapshots (with forced GC before each read), CPU profiling at 100-microsecond sampling, long-task observation, and Core Web Vitals via the `web-vitals` v4 library. Statistical significance is assessed via the Wilcoxon signed-rank test (two-tailed, non-parametric) on paired A-B differences, with 95% confidence intervals via the Hodges-Lehmann estimator.

### Scope and Limitations

The demo benchmark was run against our internal demo application (`examples/todolist-htmx` — an Express + HTMX todo app). The stress benchmark was run against a React 19 harness with configurable assertion density and background DOM churn. Both ran on Apple M4 Pro (48GB RAM), Chromium 147.0.7727.15. Your numbers will differ.

What the benchmarks measure:
- Cold page load with the agent installed and idle (idle soak)
- Page load plus a scripted interaction sequence — login, add 3 todos, toggle 2, delete 1 — with the agent actively resolving ~20 assertions including out-of-band assertion chains (active state)
- Scaling behavior from 50 to 1,000 concurrent assertions with background DOM churn at 100 mutations/second
- Core Web Vitals (LCP, FCP, TTFB, CLS, INP), heap growth, long-task blocking, MutationObserver callback timing, and wall-clock overhead

What the benchmarks do not measure:
- Firefox or Safari (Chromium only)
- Pages behind authentication or bot challenges (when run against external URLs)

The benchmark tool ships with the agent at `tools/benchmark/`. You can run it yourself against your own pages:

```bash
npm run benchmark -- https://your-site.com
```

### Demo Results

Results from our HTMX demo app (~15 instrumented elements, ~20 assertions during the active interaction sequence).

**Idle soak (agent installed, no assertions firing):**

| Metric | Without agent | With agent | Delta |
|---|---|---|---|
| LCP | 40ms | 36ms | -4ms |
| FCP | 40ms | 36ms | -4ms |
| TTFB | 2.2ms | 1.9ms | -0.3ms |
| CLS | 0 | 0 | 0 |
| Heap growth (60s soak) | 14.2KB | 15.8KB | +1.7KB |
| Long tasks | 0 | 0 | 0 |
| Wall clock overhead | — | — | -2ms |

**Active state (agent resolving ~20 assertions during user interactions):**

| Metric | Without agent | With agent | Delta |
|---|---|---|---|
| LCP | 40ms | 36ms | -4ms |
| FCP | 40ms | 36ms | -4ms |
| TTFB | 2.1ms | 1.7ms | -0.4ms |
| INP | 24ms | 24ms | 0ms |
| CLS | 0 | 0 | 0 |
| Heap growth (60s soak) | 81.8KB | 74.9KB | -6.9KB |
| Long tasks | 0 | 0 | 0 |
| Wall clock overhead | — | — | 0ms |

All values are medians across 29 usable paired measurements, unthrottled profile. Negative deltas on LCP, heap, and wall clock are measurement noise — the agent does not make your page faster. Full results including Slow 4G profile, p-values, and 95% confidence intervals are in the [published benchmark report](performance/current.md).

### Stress Testing

The demo benchmark shows the agent is undetectable in a typical application. The stress benchmark answers the scaling question: what happens at 50x the instrumentation density, with continuous background DOM churn, on a throttled CPU?

A React 19 stress harness generates 50, 200, or 1,000 concurrent assertions across 8 resolver archetypes (click→updated, click→added, click→removed, input→visible, submit→conditional, mount→visible, invariant→stable, click→OOB chain), with optional background DOM churn at 100 mutations/second simulating third-party widgets and animations.

**Scaling curve (unthrottled, Apple M4 Pro):**

| Assertions | Churn | MO Callback P50 | MO Callback P95 | MO Callback P99 | INP Delta | Heap Delta | Long Tasks Delta |
|---|---|---|---|---|---|---|---|
| 50 | 0/s | 0ms | 0.3ms | 0.5ms | 0ms | +76KB | 0 |
| 50 | 100/s | 0ms | 0.1ms | 0.3ms | 0ms | +92KB | 0 |
| 200 | 0/s | 0ms | 0.3ms | 0.5ms | 0ms | +115KB | 0 |
| 200 | 100/s | 0ms | 0.1ms | 0.3ms | 0ms | +150KB | 0 |
| 1000 | 0/s | 0.1ms | 0.6ms | 0.8ms | 0ms | +116KB | 0 |
| 1000 | 100/s | 0.1ms | 0.2ms | 0.6ms | 0ms | +140KB | 0 |

**Under 4x CPU throttle (simulating mid-tier mobile):**

| Assertions | Churn | MO Callback P50 | MO Callback P95 | MO Callback P99 | INP Delta | Heap Delta | Long Tasks Delta |
|---|---|---|---|---|---|---|---|
| 50 | 0/s | 0ms | 0.7ms | 1.1ms | 0ms | +69KB | 0 |
| 50 | 100/s | 0ms | 0.7ms | 1.0ms | 0ms | +82KB | 0 |
| 200 | 0/s | 0ms | 0.7ms | 1.1ms | 0ms | +120KB | 0 |
| 200 | 100/s | 0ms | 0.7ms | 0.9ms | 0ms | +152KB | 0 |
| 1000 | 0/s | 0.3ms | 1.1ms | **2.2ms** | 0ms | +117KB | 0 |
| 1000 | 100/s | 0.4ms | 1.0ms | 1.4ms | 0ms | +102KB | 0 |

MutationObserver callback timing is captured by wrapping the observer constructor with `performance.now()` instrumentation before agent load (<0.01ms overhead per callback). Full per-configuration breakdowns with CWV data, p-values, and confidence intervals are in the [stress report](performance/stress.md).

### Interpretation

The agent has **zero measurable impact on Interaction to Next Paint (INP)** — the Core Web Vital that measures responsiveness — across every configuration tested. This holds from a 15-element demo app through 1,000 concurrent assertions with 100 background DOM mutations per second on a 4x CPU-throttled device.

The MutationObserver callback — the agent's hot path where every DOM mutation on the page is evaluated against every pending assertion — completes in **under 1ms at P95** in all configurations. The worst-case P99 is **2.2ms** (1,000 assertions, CPU 4x throttle), which is 4% of the 50ms long-task threshold.

Heap overhead scales sub-linearly: **+76KB at 50 assertions, +150KB at 200, +140KB at 1,000**. Going from 50 to 1,000 assertions (20x) increases heap by roughly 1.8x. The agent's internal GC sweep (every 5 seconds) cleans up resolved assertions, keeping the working set bounded. At idle — agent installed, no assertions firing — the footprint is **1.7KB**.

The agent **never creates a long task** in any demo-scale scenario. At 1,000 assertions, the stress harness page itself produces a long task from rendering 3,696+ DOM nodes; the agent adds ~23ms to that existing task during its one-time initial attribute scan — a page-load cost, not ongoing overhead. For context: a typical instrumented page has 10–50 assertions. The 1,000-assertion test is a deliberately extreme stress case.

Background DOM churn (non-instrumented mutations from third-party widgets, animations, and framework reconciliation) does not degrade callback performance. In most configurations, churn actually *improves* P95 — the MutationObserver batches mutations, and more frequent small batches are cheaper to process than fewer large ones.

We report all numbers honestly, including cases where condition B (with agent) appears faster than condition A — that's measurement noise, not the agent improving your page. Full methodology, A-vs-A measurement validation, and statistical details are in the [performance analysis](performance/analysis.md).

## Conformance Testing

Faultsense is framework-agnostic. The agent observes DOM mutations, not framework internals. But frameworks differ in *how* they mutate the DOM — React batches via microtasks, HTMX swaps outerHTML, Livewire morphs in place, Solid updates text nodes directly. The agent must handle all of these correctly.

We validate this through a two-layer conformance strategy.

### Layer 1: DOM Mutation Pattern Suite

**25 tests across 10 named mutation pattern classes**, run via jsdom in the unit test suite (`npm test`).

Each pattern class represents a distinct way frameworks mutate the DOM:

| Pattern | What it tests | Frameworks that produce it |
|---|---|---|
| **PAT-01** Pre-existing target | Element already in DOM when trigger fires — must not false-pass | Any SSR framework, server-rendered lists |
| **PAT-02** Delayed-commit mutation | Transient DOM states (loading spinners, CSS transitions) between trigger and outcome | HTMX swap classes, React Suspense, Svelte transitions |
| **PAT-03** outerHTML replacement | Entire node swapped (old removed, new added) | HTMX `outerHTML`, Turbo Stream `replace` |
| **PAT-04** morphdom preserved-identity | Node stays in DOM, attributes/children patched in place | Livewire, Turbo 8 morph, Alpine morph |
| **PAT-05** Detach-reattach | Node briefly leaves and re-enters the DOM | React keyed reorder, React StrictMode double-mount |
| **PAT-06** Text-only mutation | Only `textContent` or `characterData` changes, no structural mutation | Solid signals, Svelte reactive bindings, Vue 3 text interpolation |
| **PAT-07** Microtask batching | Multiple mutations arrive in a single MutationObserver callback | React 18 automatic batching, Vue `nextTick` |
| **PAT-08** Cascading mutations | One trigger causes mutations across multiple unrelated subtrees | Redux multi-slice updates, HTMX `hx-swap-oob` |
| **PAT-09** Hydration upgrade | SSR-rendered nodes gain attributes/listeners during client hydration | Next.js, Astro, SvelteKit, Nuxt |
| **PAT-10** Shadow DOM traversal | Target inside a shadow root | Lit, Stencil, Salesforce LWC |

PAT-10 (Shadow DOM) is a documented gap. The agent's `MutationObserver` does not cross shadow root boundaries. Shadow DOM support is planned but not yet implemented. The test exists as an expected-failure regression lock.

Layer 1 is the source of truth. When a framework produces a mutation shape that matches a cataloged pattern, the agent handles it correctly by construction — the pattern's regression test guarantees it.

### Layer 2: Real-Browser Framework Harnesses

**92 passing tests across 10 frameworks**, run in real Chromium via Playwright (`npm run conformance`).

Each framework has a purpose-built minimal harness exercising the same scenario set:

| Framework | Stack | Scenarios |
|---|---|---|
| React 19 | Vite + hooks + StrictMode | 10/10 |
| Vue 3 | Vite + Composition API | 10/10 |
| Svelte 5 | Runes mode | 10/10 |
| Solid | Fine-grained signals | 10/10 |
| Alpine.js 3 | Directive-only, CDN | 10/10 |
| Astro 6 | SSR + React island hydration | 11/11 |
| HTMX 2 | Express + EJS, server-rendered fragments | 7/7 |
| Hotwire | Rails 8 + Turbo 8 (Docker) | 8/8 |
| Livewire 3 | Laravel 11 + Livewire 3 (Docker) | 8/8 |
| Phoenix LiveView 1.0 | Phoenix 1.7 + OTP (Docker) | 8/8 |

Layer 2 does not define correctness — Layer 1 does. Layer 2 provides empirical confirmation that real frameworks produce the mutation shapes Layer 1 locks in, and catches integration issues that synthetic tests can't anticipate.

**The discovery loop:** When a Layer 2 harness exposes a bug, we don't fix it in the harness. We name the mutation pattern, add it to the Layer 1 catalog with a regression test, fix the agent, and verify both layers green. This means every bug found through framework testing becomes a permanent regression lock that applies across all frameworks — not just the one that found it.

### Known Integration Considerations

Framework-specific findings from building the conformance harnesses are documented in our [framework integration notes](framework-integration-notes.md). For example:

- **React controlled checkboxes** should use `fs-trigger="click"` instead of `"change"` because React re-renders the input synchronously during the native event dispatch, before the agent's capture-phase listener runs.
- **Vue 3 template literals** emit quoted attribute values (`[data-id='1']`) which required a parser fix (`stripOuterQuotes` in `parseTypeValue`) — now covered by three unit tests and a Vue 3 harness regression.
- **Morphdom-based frameworks** (Livewire, Turbo 8 morph, LiveView) preserve element identity during updates, which means `fs-assert-updated` is the correct assertion type, not `fs-assert-added` — the element was patched, not replaced.

These are not bugs in the agent. They are instrumentation guidance — the same kind of "how do I write this assertion correctly" knowledge that any testing tool requires.

## What Faultsense Does Not Do

To set expectations clearly:

- **No synthetic monitoring.** The agent runs in real user sessions, not scripted bots. It cannot tell you about pages users haven't visited.
- **No error tracking.** The agent does not catch thrown exceptions. It detects silent failures — features that don't error but don't produce the correct outcome. JS errors are tagged as context on pending assertions, not reported independently.
- **No performance monitoring.** The agent does not measure Core Web Vitals, load times, or resource timing. It measures correctness.
- **No automatic instrumentation.** The agent does not infer what "correct" means. A developer must declare assertions via `fs-*` attributes. This is deliberate — the value is proportional to the instrumentation effort, because it requires thinking about what correct behavior actually looks like.
- **No shadow DOM support (yet).** Assertions targeting elements inside shadow roots will not resolve. This is a known gap (PAT-10) with a planned fix.
- **No Firefox or Safari conformance testing (yet).** The conformance suite runs Chromium only. The agent uses standard Web APIs (`MutationObserver`, `querySelector`, `addEventListener`) and is expected to work across modern browsers, but we have not validated this empirically.

## Reproducibility

Everything described in this document is reproducible from the open-source agent repository:

- **Demo benchmark:** `npm run benchmark:demo` (30 paired A/B measurements, ~2 hours)
- **Stress benchmark:** `npm run benchmark:stress` (scaling curve across 50–1,000 assertions, ~4 hours)
- **Benchmark any URL:** `npm run benchmark -- <URL>` (any public URL)
- **A-vs-A validation:** `npm run benchmark:ava` (measurement apparatus self-check)
- **Layer 1 tests:** `npm test` (jsdom, runs in seconds)
- **Layer 2 conformance:** `npm run conformance` (real Chromium, requires Playwright + Docker for polyglot frameworks)
- **Works-with matrix:** `npm run conformance:matrix` (auto-generates from test results)

The benchmark tool, stress harness, conformance harnesses, and all test results are in the repository. We do not publish numbers from private test runs or curated environments.
