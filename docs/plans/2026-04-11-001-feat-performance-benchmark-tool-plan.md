---
title: feat — Customer-runnable performance benchmark tool (lean)
type: feat
status: completed
date: 2026-04-11
origin: docs/brainstorms/2026-04-11-performance-benchmarks-requirements.md
---

# feat: Customer-runnable performance benchmark tool (lean)

## Overview

Ship a small Playwright-based benchmark tool under `tools/benchmark/` that produces credible evidence the faultsense agent has negligible page performance impact — suitable for customer procurement and security review. Two invocation modes:

1. `npm run benchmark -- <URL>` — point at any public URL, runs paired A/B sessions with/without `dist/faultsense-agent.min.js` injected, outputs a Markdown + JSON report.
2. `npm run benchmark:demo` — boots one of our demo apps via Playwright `webServer`, runs the same pipeline, writes to `docs/performance/current.md`.

The target audience is external: security review, procurement, platform engineering. The strongest answer to "prove it doesn't hurt my site" is "don't trust us, run it yourself."

This is a lean MVP. An earlier draft of this plan was much broader; a deepening review round surfaced real correctness bugs (kept) alongside a lot of speculative hardening (cut). The reasoning for the cuts is preserved at the bottom of this document so future work doesn't re-derive the same list.

## Problem Statement

Faultsense's conformance layer proves the agent is *correct*. Nothing currently proves it is *cheap*. Customer procurement and security review ask "what does this cost my page?" and today the only answer is intuition. Without a reproducible number, adoption stalls at the security-review gate.

The deliverable is not just a tool — it's the tool plus a first self-dogfooded report proving we believe our own claim.

## Proposed Solution

A Playwright-test-runner-based tool at `tools/benchmark/`, authored in TypeScript, mirroring the existing `conformance/` idiom. Invocation wraps the test runner in two npm scripts:

```jsonc
// package.json additions
"benchmark":      "FS_BENCH_MODE=url  playwright test --config=tools/benchmark/playwright.config.ts",
"benchmark:demo": "FS_BENCH_MODE=demo playwright test --config=tools/benchmark/playwright.config.ts"
```

One config, two modes. `url` mode reads `FS_BENCH_URL` from env, no `webServer`. `demo` mode adds a `webServer` entry for one demo app and writes to `docs/performance/current.md`.

The tool launches Chromium, injects the agent via `page.addInitScript`, runs **10 paired A-B-A-B measurements** (first pair discarded as warmup) across **two throttle profiles** (unthrottled + Slow 4G), collects Core Web Vitals via `web-vitals` v4 and idle-soak metrics via CDP, and emits a Markdown + JSON report readable by a non-technical reviewer.

## Technical Approach

### File layout

```
tools/
  benchmark/
    README.md                 # User-facing docs: how to run, how to interpret
    playwright.config.ts      # One config, FS_BENCH_MODE toggles webServer + projects
    benchmark.spec.ts         # Thin harness: calls lib/measure, writes report
    tsconfig.json             # Extends root; includes tools/benchmark/**
    lib/
      types.ts                # Measurement, ScenarioConfig, THROTTLE_PROFILES, Window augmentation
      measure.ts              # Injection pipeline, CDP metrics, pair loop, orchestration
      report.ts               # Inline stats (median/p95/IQR), HTML-escaped Markdown, JSON
      injection/
        longtask-observer.js  # Raw JS, loaded via addInitScript (not TS — addInitScript needs file path)
        web-vitals-collector.js
        init-wrapper.js
```

Three `.ts` files under `lib/`, plus three raw `.js` files under `lib/injection/` that Playwright's `addInitScript({ path })` loads directly. Total Phase 1 surface: ~800 lines of TypeScript + ~100 lines of injection glue.

### Injection pipeline (both A and B conditions)

`addInitScript` calls run on every document creation, in registration order, before page scripts. Both conditions install the same measurement instruments so paired differential cancels instrument overhead:

1. **Pre-init namespace** — sets `window.__fsBench = { longtasks: [], webVitals: {}, finalized: false }`.
2. **Longtask observer** — `new PerformanceObserver({ buffered: true }).observe({ type: 'longtask' })`, pushes entries into `window.__fsBench.longtasks` from inside the callback (don't rely on the PO internal buffer — Blink caps it).
3. **`web-vitals` v4** — pinned, injected from `node_modules/web-vitals/dist/web-vitals.iife.js`.
4. **web-vitals collector** — wires `onLCP`, `onCLS`, `onFCP`, `onTTFB`, `onINP` callbacks into `window.__fsBench.webVitals`. Sets `window.__fsBench.finalized = true` when LCP + CLS have fired finalization (on `pagehide`).

**Condition B only** additionally injects:

5. **Agent bundle** (`dist/faultsense-agent.min.js`) — IIFE, installs `window.Faultsense`.
6. **Init wrapper** (`lib/injection/init-wrapper.js`) — calls `Faultsense.init({ releaseLabel: 'benchmark', collectorURL: () => {} })`. Guards with `if (typeof window.Faultsense?.init !== 'function') return;` — cheap insurance.

Without step 6 the agent is inert (no observer, no listeners, no GC sweep) and the idle-soak measurement is meaningless. This is load-bearing.

### Measurement sequence (per pair)

```typescript
// tools/benchmark/lib/measure.ts — pseudocode, not final
async function runPair(config: ScenarioConfig, pairIndex: number): Promise<[Measurement, Measurement]> {
  const browser = await chromium.launch({ headless: 'new' })
  try {
    const a = await runMeasurement(browser, config, 'A')
    const b = await runMeasurement(browser, config, 'B')
    return [a, b]
  } finally {
    await browser.close().catch(() => {})  // swallow "Target closed" on SIGINT
  }
}

async function runMeasurement(browser, config, condition): Promise<Measurement> {
  const context = await browser.newContext()
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)

  await cdp.send('Performance.enable')
  await cdp.send('HeapProfiler.enable')
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 })  // 100μs — 1ms default is too coarse

  if (config.throttle.network) {
    await cdp.send('Network.emulateNetworkConditions', config.throttle.network)
  }

  // Install instruments (both conditions)
  await page.addInitScript({ path: 'lib/injection/longtask-observer.js' })
  await page.addInitScript({ path: 'node_modules/web-vitals/dist/web-vitals.iife.js' })
  await page.addInitScript({ path: 'lib/injection/web-vitals-collector.js' })

  if (condition === 'B') {
    await page.addInitScript({ path: 'dist/faultsense-agent.min.js' })
    await page.addInitScript({ path: 'lib/injection/init-wrapper.js' })
  }

  const navStart = Date.now()
  await page.goto(config.url, { waitUntil: 'load' })

  // CPU throttle applies AFTER navigation per Lighthouse convention (network throttling applies before)
  if (config.throttle.cpu > 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: config.throttle.cpu })
  }

  // Baseline heap — two GCs back-to-back, V8 young-gen survivors need two passes
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  const heapStart = await readJSHeapUsedSize(cdp)

  await cdp.send('Profiler.start')
  await page.waitForTimeout(config.soakMs)                                   // 60s default
  const { profile } = await cdp.send('Profiler.stop').catch(() => ({ profile: null }))

  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  const heapEnd = await readJSHeapUsedSize(cdp)
  const domCounters = await cdp.send('Memory.getDOMCounters')

  const longtasks = await page.evaluate(() => window.__fsBench.longtasks)

  // Force web-vitals finalization via explicit signal — NOT a magic sleep
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForFunction(() => window.__fsBench.finalized === true, { timeout: 3000 })
    .catch(() => { /* timeout → mark this measurement degraded */ })
  const webVitals = await page.evaluate(() => window.__fsBench.webVitals)

  await page.close({ runBeforeUnload: true })
  await context.close()

  return { condition, heapStart, heapEnd, domCounters, longtasks, webVitals, profile, wallClockMs: Date.now() - navStart }
}
```

Notes on the critical details (these were blockers in the deepening review — see "Correctness fixes" below):

- **Launch once per pair, not per measurement.** Fresh browser process per pair → A+B share a V8 isolate within the pair (paired-differential heap math benefits from common-mode noise cancellation), fresh between pairs (isolation). Halves launch overhead.
- **Two `collectGarbage` calls back-to-back.** Single GC leaves young-gen survivors; two promotes and sweeps them.
- **`JSHeapUsedSize` via `Performance.getMetrics`, not `page.evaluate(() => performance.memory.*)`.** The `page.evaluate` path allocates in the target isolate — polluting what we're measuring.
- **Web-vitals finalization via `window.__fsBench.finalized` promise**, not a magic 500ms sleep. The 500ms sleep was an asymmetric race — B has more unload work (agent's own `beforeunload` + `sendBeacon`), so LCP/CLS would be systematically under-reported for B in the direction that flatters the agent.
- **Profiler sampling rate set to 100μs.** Default ~1ms rounds microsecond-scale agent work to 0.
- **CPU throttle applied after `page.goto`, network throttle before** (Lighthouse convention; otherwise navigation itself is affected differently).

### CPU attribution

Phase 1 task: **empirically verify the script URL** that `addInitScript`-injected bundles get in `profile.nodes[*].callFrame.url`. Playwright injects via `Page.addScriptToEvaluateOnNewDocument`, which typically assigns a synthetic URL like `pwscript://...` — **not** `faultsense-agent.min.js`. A naive `url.endsWith('faultsense-agent.min.js')` filter matches zero frames and ships `agent CPU: 0ms` regardless of actual cost.

Two paths forward once the real URL is known:

1. **Filter on the observed URL** and attribute correctly.
2. **Skip agent-attributed CPU entirely** in the headline — report it as "below sampling resolution" or omit, and let heap delta + long-task counts tell the overhead story. This is simpler and arguably more honest: a 25KB agent doing microsecond work is genuinely below the noise floor of any reasonable sampling profiler.

Decide in Phase 1 based on what the empirical URL dump shows. Either way, include a smoke test that fails loudly if the filter is supposed to match but matches zero frames when the agent is present.

### Throttle profiles

```typescript
// tools/benchmark/lib/types.ts
export type ThrottleProfileName = 'unthrottled' | 'slow4g'

export const THROTTLE_PROFILES = {
  unthrottled: { cpu: 1, network: null },
  slow4g: {
    cpu: 1,  // Slow 4G is a network profile; pair with unthrottled CPU in MVP
    network: {
      offline: false,
      latency: 562.5,             // ms RTT
      downloadThroughput: 180_000, // bytes/sec — 1.6 Mbps × 0.9, Lighthouse-aligned
      uploadThroughput: 84_375,    // bytes/sec — 750 Kbps × 0.9
    },
  },
} as const satisfies Record<ThrottleProfileName, ThrottleProfile>
```

Two profiles, not three. `cpu4x` is deferred — it's a weird middle ground between the two real cases, and dropping it halves the run time. Add later if a real reviewer asks.

### Statistical protocol

- **10 paired runs** per scenario, strict A-B-A-B interleaving, first pair discarded as JIT warmup → 9 usable pairs.
- **Report median, p95, and IQR** for every metric, plus the raw per-run array in the JSON output. No bootstrap CI, no parametric tests. Inline arithmetic in `report.ts`, ~30 lines, no separate stats module.
- **Plain-English significance label** per delta: `within noise` if `|delta| < max(baseline IQR, 5% × baseline median)`, `measurable` between that and 2× that, `significant` above.

### Report shape

Markdown output sections (in order):

1. **Headline summary** — one sentence: "faultsense 0.4.0 on https://example.com (unthrottled, 10 pairs): LCP Δ +3ms (within noise), heap Δ +180KB (measurable)." Everything below substantiates this.
2. **Environment** — machine, OS, CPU, RAM, Node, Playwright, Chromium revision, agent version + commit SHA + bundle SHA-256, target URL + resolved IP, UTC timestamp, throttle profile numeric constants (verbatim), pairs count, soak duration. Every field R10 from the brainstorm asks for.
3. **Headline table** — rows are metrics (LCP, CLS, INP, FCP, TTFB, JSHeapUsedSize delta, DOM node delta, long task count, long task total ms, bundle bytes added, network bytes added, wall clock delta), columns are the two profiles. Each cell: `A median → B median (delta, significance label)`.
4. **Methodology** — plain English: what was measured, how many runs, what a pair is, what the 60s soak is for, what the agent's internal 5s GC sweep looks like during the soak and why it's not hidden, sampling rate, CPU/network throttle application order.
5. **Caveats** — what this report does *not* measure (auth pages, scripted interactions, Firefox/Safari, active-state assertions except in demo mode). Explicit "INP is a lab estimate in headless" qualifier.
6. **Raw data** — link to the JSON sibling file.

**HTML escape every user-derived field** in the Markdown renderer (target URL, hostname, resolved IP, any error message strings). GitHub-flavored Markdown renders inline HTML by default; an unescaped target URL containing `<script>` is a security incident. Vitest unit test verifies `<`, `>`, backticks, pipes, and triple-backticks round-trip as literal text.

### Pre-flight validation

Minimal set. Run once at tool start, not per measurement:

1. **URL scheme allowlist** — parse with `new URL()`, require `http:` or `https:`, reject `file:`, `javascript:`, `data:`, `chrome:`, `about:`. Trivial, 5 lines.
2. **CI refusal** — if `process.env.CI` or `process.env.GITHUB_ACTIONS` is set, exit with a clear message unless `--allow-ci` is passed. Reports generated with `--allow-ci` include a `[SHARED-RUNNER-SMOKE]` prefix in the headline summary so shared-runner numbers can't be confused with real ones.
3. **Build artifact present** — if `dist/faultsense-agent.min.js` is missing, exit with "run `npm run build:agent` first." Don't auto-build; hiding the failure mode is worse.
4. **Post-navigation sanity** — after the first B-condition measurement, check `window.Faultsense === undefined`. If undefined, the injection failed (likely CSP, possibly bundle error). Abort the whole run with a clear message pointing at the scope boundaries.

That's it. No bot-challenge vendor signatures, no login redirect detection, no COOP/COEP handling, no Docker/battery/load-avg/App Nap/disk gates, no parity check. Reasoning in "Deliberately out of scope" below.

### SIGINT handling

- Wrap every `cdp.send` call in a try/catch that specifically swallows "Target closed" errors.
- On SIGINT: set an AbortController signal, let the orchestrator bail at the next await point, call `browser.close()` (don't call `cdp.detach()` explicitly — it races the close).
- Flush partial results to disk with `status: 'aborted'` before exit.
- Exit code 130.

### Demo mode

`playwright.config.ts` reads `FS_BENCH_MODE`. When `demo`, adds a `webServer` entry for **one** demo app — `examples/todolist-htmx` (simpler than the tanstack example: Express + static, no Vite build step, no HMR to contaminate the baseline). `reuseExistingServer: false` (prevents silent reuse of a dev instance). Run timeout 180s to allow for cold start.

Phase 1 audit: does `examples/todolist-htmx/server.js` run background polling (activity log?) that would contaminate the at-rest baseline? If yes, either disable via a benchmark-mode env var on the example (CLAUDE.md says not to couple examples to conformance; benchmark is a second consumer, same rule applies — so prefer a wrapper that boots the example's production server from the benchmark side without modifying the example source).

The demo-mode run injects an **at-rest scrub** as an additional `addInitScript` before the agent bundle: it removes `fs-*` attributes from the DOM and installs a `MutationObserver` that strips them from any newly-added nodes for the lifetime of the page. This turns the instrumented demo into a clean at-rest baseline — matching what a customer sees on their own pages (no `fs-*` attributes anywhere) — while still running against a realistic page with real scripts, DOM, and events.

A second `npm run benchmark:demo:active` (optional, Phase 2) runs the same demo without the scrub, capturing active-state numbers side-by-side. Ship at-rest first; active-state follows.

Only one demo app in MVP. `examples/todolist-tanstack` gets added later — it needs a production-build path that doesn't exist yet, and adding it now is scope creep.

### Implementation Phases

#### Phase 1: Foundation, measurement, first real numbers

- Scaffold `tools/benchmark/` with `README.md`, `playwright.config.ts`, `tsconfig.json` extending root, `benchmark.spec.ts`, and the `lib/` layout above.
- Add `web-vitals` v4 + `devtools-protocol` as dev dependencies.
- Define `lib/types.ts` with `Measurement`, `ScenarioConfig`, `ThrottleProfile`, `THROTTLE_PROFILES`, `BenchmarkError` (single class, discriminated `kind`), and `declare global { interface Window { __fsBench: { ... } } }` scoped via the benchmark-local tsconfig so it doesn't pollute the root project.
- Implement `lib/measure.ts` — the runMeasurement + runPair + orchestration loop above.
- Implement `lib/report.ts` — inline stats, HTML-escaped Markdown, JSON.
- Wire `npm run benchmark -- <URL>` → sets `FS_BENCH_URL` + `FS_BENCH_MODE=url` → invokes Playwright test runner.
- **Empirically resolve the CPU attribution URL bug** — dump `profile.nodes[*].callFrame.url` against a synthetic always-busy page, fix the filter OR decide to omit agent-attributed CPU from the headline.
- CI refusal gate + `--allow-ci` escape + URL scheme allowlist + SIGINT cleanup.
- Vitest unit tests for: `report.ts` Markdown escaping (script/backtick/pipe/triple-backtick round-trip), significance-label arithmetic (pure function, 5 tests).

**Phase 1 exit criteria:** `npm run benchmark -- https://example.com` runs 10 paired runs across both throttle profiles, writes a JSON + Markdown report, exits 0. Real CWV + heap + long task numbers. CPU attribution either correctly filtered or explicitly omitted with "below sampling resolution."

#### Phase 2: Demo mode + first published report + docs

- `FS_BENCH_MODE=demo` wiring: conditional `webServer` entry, conditional at-rest scrub injection, output path to `docs/performance/current.md`.
- Audit `examples/todolist-htmx/server.js` for background polling; if present, disable via a wrapper on the benchmark side.
- Implement at-rest scrub (`lib/injection/at-rest-scrub.js`): DOM walk + `MutationObserver` + `Element.prototype.setAttribute` override on `fs-*`.
- Run `npm run benchmark:demo` locally, iterate on report format until a non-developer reader can make sense of it. Real-reviewer eye-test ideally before the first commit.
- Commit `docs/performance/current.md` with the first real numbers. Honest — including any unflattering findings. If heap delta is +200KB, report it and fix the agent separately.
- Add `docs/performance/README.md` explaining `current.md` vs raw results, how to reproduce, trusted-runner path.
- Expand `tools/benchmark/README.md` with full usage, flags, interpretation, CSP/build troubleshooting, privacy note (running against a target you don't own captures tracker URLs in profile output — review JSON before publishing).
- One-paragraph update to root `README.md` ("Performance" section pointing at `docs/performance/`) and `CLAUDE.md` ("Development" section mentioning the tool).
- Run `npm run build:size` — confirm README + SKILL.md gzipped size numbers are current (per user memory).

**Phase 2 exit criteria:** `docs/performance/current.md` exists with real numbers. `npm run benchmark:demo` regenerates it. README + docs navigable by a new reader.

## Acceptance Criteria

**Functional (origin: R1–R12, pruned):**

- [ ] **R1.** `npm run benchmark -- <URL>` produces a complete, readable Markdown + JSON report in under ~20 minutes per scenario on a modern laptop, with zero faultsense-specific knowledge required.
- [ ] **R2.** Measurements run in real Chromium via Playwright, `headless: 'new'` mode.
- [ ] **R3.** Agent injected via `addInitScript` + explicit `Faultsense.init(...)` wrapper — verified the agent is actually active during the soak.
- [ ] **R4.** Cold load + 60s idle soak per measurement, strict A-B-A-B paired, first pair discarded as warmup, fresh context per measurement + fresh browser per pair.
- [ ] **R5.** Core Web Vitals in the headline: LCP, CLS, INP, FCP, TTFB via `web-vitals` v4. Finalized explicitly via `__fsBench.finalized` promise, not a magic sleep.
- [ ] **R6.** Idle-soak section: `JSHeapUsedSize` delta (post two forced GCs), long-task count + total ms, DOM node delta.
- [ ] **R7.** Bundle + network bytes delta reported (network delta should be 0 in noop-collector mode — prove it).
- [ ] **R8.** Two throttle profiles per scenario: unthrottled + Slow 4G. Exact numeric constants embedded in the report.
- [ ] **R9.** 10 paired runs, median + p95 + IQR + raw array, plain-English significance labels.
- [ ] **R10.** Environment disclosure: machine, OS, CPU, RAM, Node, Playwright, Chromium revision, agent version + commit SHA + bundle SHA-256, target URL + resolved IP, UTC timestamp, throttle profile constants, `--pairs` + soak duration. All in both Markdown and JSON.
- [ ] **R11.** Dual output: Markdown readable by non-developer procurement reviewer, JSON for archival/diff. Markdown HTML-escapes all user-derived fields.
- [ ] **R12.** First published benchmark report in `docs/performance/current.md` against `examples/todolist-htmx` at-rest mode, committed to this PR.

**Correctness fixes from the deepening review (non-negotiable):**

- [ ] **CPU attribution URL resolved** — either filter matches real frames or headline omits attributed CPU with an explanation. No silent 0ms.
- [ ] **Web-vitals finalization is explicit** — `window.__fsBench.finalized` promise, not `waitForTimeout(500)`.
- [ ] **Markdown is HTML-safe** — every user-derived field escaped, vitest regression test covers it.
- [ ] **URL scheme allowlist** — `file:`, `javascript:`, `data:`, etc. rejected pre-navigation.
- [ ] **SIGINT clean** — no orphaned Chromium processes, partial results flushed, exit 130.
- [ ] **Two GCs before every heap read** — baseline and end-of-soak.
- [ ] **Profiler sampling at 100μs**, not default 1ms.
- [ ] **Throttle order** — network before `page.goto`, CPU after.

**Non-functional:**

- [ ] Runs on macOS, Linux, Windows. Chromium-only (Firefox/Safari explicitly out of scope).
- [ ] Full run (one URL, two profiles, 10 pairs each) completes in < 45 minutes on a modern laptop. A single profile run in < 25 min.
- [ ] No `as any` in `tools/benchmark/` — enforced by ESLint.
- [ ] No imports from `src/` into `tools/benchmark/` — enforced by a grep check in Phase 2.
- [ ] Refuses to run in CI without `--allow-ci`; reports under `--allow-ci` are tagged.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| CPU attribution URL filter doesn't match real injected script URL | Certain | Empirically verify in Phase 1; either fix filter or omit attributed CPU from headline |
| LCP/CLS asymmetric finalization under-reports B | Eliminated | `__fsBench.finalized` promise replaces the magic sleep |
| Unescaped user data in Markdown report | Eliminated | HTML escape + vitest test |
| Target site uses CSP, injection silently fails | Low | Post-nav `window.Faultsense === undefined` check aborts with a clear message |
| Target site is a bot-challenge / login page | Low | Generic abort on post-nav sanity check; README guidance to use real public URLs |
| Published numbers are unflattering | Medium | Publish anyway; fix the agent. Honest numbers compound trust faster than clean ones. |
| Chromium version drift changes numbers release-over-release | Medium | Pin Chromium revision in report; document reproducibility scope |
| Customer runs on loaded laptop, gets noisy numbers | Medium | README prescribes run conditions; raw variance visible in report |

## Deliberately out of scope (captured so future-you doesn't re-derive)

An earlier draft of this plan added a lot of defensive infrastructure. A subsequent simplicity review pruned aggressively. These cuts were deliberate, not oversights. Reasoning preserved here so a later contributor doesn't rediscover the same list and re-add them without cause:

- **Bot-challenge detection (Cloudflare, Akamai, Sucuri, DataDome, PerimeterX vendor signatures).** A customer running the tool on their own public site knows what they're pointing at. If they hit a challenge, the generic "no LCP detected / agent not installed" fallback surfaces it. Vendor-signature detection is ~200 lines of code for a rare failure mode on customer sites.
- **Login-redirect detection (IdP chain walking, password-input shape detection).** Same reasoning — customer knows their URL.
- **CSP detection via `response.allHeaders()` + `script-src` parsing.** Sentinel check (`window.Faultsense === undefined` post-nav) is sufficient and disambiguation ("CSP vs bundle error") isn't load-bearing — either way, the run aborts.
- **Parity check (A vs B resource/DOM divergence detection).** No real site serves different content to Playwright. If one did, the paired numbers would show it immediately.
- **Environment ruggedness gates (Docker, macOS Low Power Mode, battery, load-avg, App Nap, disk-space).** README guidance ("run on a quiet laptop") does the same job for a fraction of the code.
- **Third throttle profile (`cpu4x`).** Weird middle ground between unthrottled and Slow 4G. Layer in later if a reviewer asks.
- **Trend check (first-half vs second-half median drift).** With 9 usable pairs, 4 vs 5 samples per half has no statistical power. Disclose the monotonic blind spot in methodology instead.
- **`tools/benchmark/fixtures/` layer, `lib/bundle-source.ts` abstraction, barrel exports, Phase 2 extraction prep.** Phase 2 (`@faultsense/benchmark` npm package) is speculative. If it ever happens, the extraction is a rewrite not a move — and that's an acceptable cost for a speculative future.
- **`--budgets heap:500kb,lcp:50ms` flag, exit-code contract, machine-readable `E_*` error codes, root `AGENTS.md`.** Not in scope per the brainstorm (this is procurement evidence, not CI gating). Add when someone asks for agent-driven automation.
- **`--heap-pairs` separate from `--pairs`.** Pilot 10 first; if V8 heap noise swamps the signal, split then.
- **`--collector-mode echo-local` with a local HTTP echo server.** Default `() => {}` proves network delta is 0 because it is 0.
- **Bundle SHA-256 "matches published release" verification.** Just embed the hash in the report; reviewers can verify against GitHub themselves.
- **Subframe isolation (`window.top !== window` guard in injected scripts).** Edge case on busy ad-laden pages. Document as a known limitation.
- **Second demo app (`examples/todolist-tanstack`).** Needs a production-build path that doesn't exist yet. Ship with one demo, add the second later.
- **Second `stats.ts` module with its own vitest suite.** ~30 lines of arithmetic inlined into `report.ts` is simpler and the eye-test on generated reports is sufficient validation.
- **Standalone `scripts/generate-report.js` CJS post-processor.** Inline render at the end of the run. Reinstate if a real regeneration use case appears.

All of these have clean "add later when a real user asks" paths. None of the cuts foreclose a future version.

## Sources & References

### Origin
- [`docs/brainstorms/2026-04-11-performance-benchmarks-requirements.md`](/Users/mitch/src/faultsense-agent/docs/brainstorms/2026-04-11-performance-benchmarks-requirements.md). Key decisions carried forward: customer-runnable is the primary value prop, cold-load + 60s idle soak is the run shape, idle-soak is the load-bearing section, public URLs only, two-phase distribution (`tools/benchmark/` in-repo now, `@faultsense/benchmark` speculative later).

### Internal
- `conformance/playwright.config.ts` — one-config-many-projects + `webServer` pattern to mirror.
- `conformance/drivers/react.spec.ts` — thin-driver-over-shared-helper pattern.
- `dist/faultsense-agent.min.js` — injection target (~25KB IIFE, requires explicit `Faultsense.init()` to activate).
- `examples/todolist-htmx/server.js` — the Phase 2 demo fixture; audit for background polling.
- `docs/solutions/logic-errors/gc-timeout-refactor-and-instrumentation-patterns.md` — 5s `gcInterval`, 2s `unloadGracePeriod` + `sendBeacon` (context for idle-soak interpretation; the sweep is legitimate agent work, disclose in methodology).
- `CLAUDE.md` — project constraints (examples/ vs conformance/ separation rule, SKILL.md canonical API reference).

### External (load-bearing)
- [Playwright — `addInitScript`](https://playwright.dev/docs/api/class-page#page-add-init-script) — additive, document-creation ordering.
- [Playwright — `newCDPSession`](https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session) — scoping + detach contract.
- [Playwright — `testConfig.webServer`](https://playwright.dev/docs/test-webserver) — `reuseExistingServer`, timeout, readiness.
- [GoogleChrome/web-vitals v4](https://github.com/GoogleChrome/web-vitals) — `onLCP`, `onCLS`, finalization on `pagehide`.
- [web-vitals issue #180 — Playwright LCP/CLS flakiness](https://github.com/GoogleChrome/web-vitals/issues/180) — why the `__fsBench.finalized` promise replaces a timer.
- [Chrome DevTools Protocol — Profiler](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/) — sampling interval, `callFrame.url` attribution.
- [Chrome DevTools Protocol — HeapProfiler](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/) — `collectGarbage`.
- [devtools-frontend network throttle presets](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/core/sdk/NetworkManager.ts) — numeric constants for "Slow 4G" (formerly "Fast 3G").
- [CDP issue #174 — CPU throttle persistence across navigation](https://github.com/ChromeDevTools/devtools-protocol/issues/174) — why we re-apply after `page.goto`.
- [Lighthouse throttling docs](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md) — network-before-nav, CPU-after-nav convention.
