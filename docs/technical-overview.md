# Faultsense Technical Overview

How the agent works, what we test it against, and what it costs your page.

---

## What Faultsense Does

Faultsense is a browser agent (8.7KB gzipped, zero dependencies) that validates feature correctness in production. You declare assertions directly in your HTML via `fs-*` attributes — the same logic you'd write in a Playwright or Cypress test — and the agent evaluates them against every real user session.

When a user interacts with an instrumented feature, the agent observes the resulting DOM mutations and reports whether the expected outcome occurred. A passed assertion means the feature worked. A failed assertion means it didn't — and the report includes which assertion, which release, and what the DOM looked like.

The agent does not modify your page. It installs a single `MutationObserver` on `document.body`, listens for the trigger events you declare, and reports results to your collector endpoint. No network interception, no DOM modification, no monkey-patching of browser APIs.

## Performance Impact

### Methodology

We measure performance impact using a Playwright-based benchmark tool that runs paired A/B sessions in real Chromium:

- **Condition A:** Your page loaded normally, without the faultsense agent.
- **Condition B:** Your page loaded with the faultsense agent installed, initialized, and actively resolving assertions during user interactions.

Each benchmark run executes 5 paired measurements per throttle profile (first pair discarded as JIT warmup, leaving 4 usable data points), with strict A-B-A-B interleaving to cancel out system noise. Measurements include a 30-second idle soak after page load to capture any ongoing agent work (the internal garbage collection sweep runs every 5 seconds).

Metrics are captured via Chrome DevTools Protocol: heap snapshots (with forced GC before each read), CPU profiling at 100-microsecond sampling, long-task observation, and Core Web Vitals via the `web-vitals` v4 library. Two throttle profiles are tested: unthrottled and Slow 4G (562.5ms RTT, 1.4Mbps down).

### Scope and Limitations

These benchmarks were run against our internal demo application (`examples/todolist-htmx` — an Express + HTMX todo app). The numbers are specific to this application, this hardware (Apple M4 Pro, 48GB RAM), and this version of Chromium (147.0.7727.15). Your numbers will differ.

What the benchmark does measure:
- Cold page load with the agent installed and idle (idle soak)
- Page load plus a scripted interaction sequence — login, add 3 todos, toggle 2, delete 1 — with the agent actively resolving ~20 assertions including out-of-band assertion chains (active state)
- Core Web Vitals (LCP, FCP, TTFB, CLS, INP), heap growth, long-task blocking, and wall-clock overhead

What the benchmark does not measure:
- Pages with hundreds or thousands of `fs-*` attributes (our demo has ~15 instrumented elements)
- Firefox or Safari (Chromium only)
- Scripted user flows beyond basic CRUD
- Pages behind authentication or bot challenges (when run against external URLs)

The benchmark tool ships with the agent at `tools/benchmark/`. You can run it yourself against your own pages:

```bash
npm run benchmark -- https://your-site.com
```

### Results

**Idle soak (agent installed, no assertions firing):**

| Metric | Without agent | With agent | Delta |
|---|---|---|---|
| LCP | 36ms | 40ms | +4ms |
| FCP | 36ms | 40ms | +4ms |
| TTFB | 2.15ms | 2.10ms | -0.05ms |
| CLS | 0 | 0 | 0 |
| Heap growth (30s soak) | 14.2KB | 16.7KB | +2.5KB |
| Long tasks | 0 | 0 | 0 |
| Wall clock overhead | — | — | -1ms |

**Active state (agent resolving ~20 assertions during user interactions):**

| Metric | Without agent | With agent | Delta |
|---|---|---|---|
| LCP | 36ms | 40ms | +4ms |
| FCP | 36ms | 40ms | +4ms |
| TTFB | 2.15ms | 1.50ms | -0.65ms |
| INP | 16ms | 16ms | 0ms |
| CLS | 0 | 0 | 0 |
| Heap growth (30s soak) | 81.8KB | 94.6KB | +12.8KB |
| Long tasks | 0 | 0 | 0 |
| Wall clock overhead | — | — | +9ms |

All values are medians across 4 usable paired measurements, unthrottled profile. Full results including Slow 4G profile and p95/IQR variance are in the [published benchmark report](performance/current.md).

### Interpretation

The agent adds approximately 4ms to first paint (one compositor frame) and 2.5KB of heap when idle. During active assertion resolution — login, CRUD operations, and cascading out-of-band assertions — heap overhead grows to 12.8KB and Interaction to Next Paint (INP) is identical at 16ms. The agent never produces a long task (>50ms main-thread block) in any scenario we tested.

The Slow 4G profile shows similar results: heap delta +6.6KB during active assertion resolution, all Core Web Vitals within run-to-run noise, zero long tasks.

We report these numbers honestly, including the cases where condition B (with agent) is slightly faster than condition A — that's measurement noise, not the agent making your page faster.

## Conformance Testing

Faultsense is framework-agnostic. The agent observes DOM mutations, not framework internals. But frameworks differ in *how* they mutate the DOM — React batches via microtasks, HTMX swaps outerHTML, Livewire morphs in place, Solid updates text nodes directly. The agent must handle all of these correctly.

We validate this through a two-layer conformance strategy.

### Layer 1: DOM Mutation Pattern Suite

**92 tests across 10 named mutation pattern classes**, run via jsdom in the unit test suite (`npm test`).

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

- **Benchmark tool:** `npm run benchmark -- <URL>` (any public URL) or `npm run benchmark:demo` (our demo app)
- **Layer 1 tests:** `npm test` (jsdom, runs in seconds)
- **Layer 2 conformance:** `npm run conformance` (real Chromium, requires Playwright + Docker for polyglot frameworks)
- **Works-with matrix:** `npm run conformance:matrix` (auto-generates from test results)

The benchmark tool, conformance harnesses, and all test results are in the repository. We do not publish numbers from private test runs or curated environments.
