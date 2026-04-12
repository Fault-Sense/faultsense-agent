---
date: 2026-04-11
topic: performance-benchmarks
---

# Performance Benchmarks

## Problem Frame

Faultsense's core pitch is "zero-overhead monitoring that runs in production against every real user session." The conformance layer proves the agent is *correct*. Nothing currently proves it is *cheap*. During customer evaluations — especially security review and procurement — we get asked: "what does this cost my page?" Today we can only answer with intuition ("it's a small observer, it should be fine"). That answer does not survive scrutiny.

The goal of this work is to produce **credible, reproducible evidence** that faultsense has negligible impact on page performance, suitable for customer procurement and security review. The durable output is a tool customers can run themselves against their own page — because the strongest answer to "prove it doesn't hurt my site" is "don't trust us, run it yourself."

This is explicitly *not* a CI regression-detection system. That is a valuable but separate concern with different design pressures (hardware independence, paired-ratio comparisons, fast feedback loops). Conflating the two would compromise both.

## Requirements

- **R1. Customer-runnable benchmark tool.** A CLI / script that takes a URL and produces a side-by-side performance comparison of the page loaded *with* and *without* faultsense injected. The customer should need nothing beyond Node, a shell, and a public URL to run it.
- **R2. Real Chromium, not jsdom.** Measurements run in a real Chromium instance via Playwright. jsdom micro-benchmarks do not survive procurement scrutiny and are out of scope for this work.
- **R3. Faultsense injected via `addInitScript`.** The agent is loaded into the target page via Playwright's `addInitScript`, before the page's own scripts run. No modification to the target page is required.
- **R4. "Cold load + idle soak" is the run shape.** One benchmark run is: launch fresh browser context → navigate to target URL → wait for load → sit idle for a fixed soak window (default ~30–60s) → capture metrics → close. Paired runs alternate with/without faultsense to reduce system-noise bias.
- **R5. Core Web Vitals headline.** Every report headlines the with/without delta for LCP, CLS, and INP-on-load. These are the metrics procurement and platform teams already know by name.
- **R6. Idle-soak stats as the load-bearing proof section.** Because customer pages have no `fs-*` attributes, faultsense is effectively idle — only its observer and listeners are installed. The report must prove that "idle" really is idle, by measuring across the soak window: heap growth (delta between start-of-soak and end-of-soak snapshots), long-task count and total blocking time, main-thread busy percentage, and CPU time attributed to scripts. This is the section most likely to be scrutinized, because it is the claim that cannot be verified from reading source.
- **R7. Bundle and network deltas included automatically.** Report the gzipped bundle added by injecting the agent and any network bytes sent during the soak (should be ~0 bytes since no assertions fire on an uninstrumented page — but prove it).
- **R8. Three throttling profiles per run.** Each scenario runs under three CDP-throttled profiles and reports all three: unthrottled, CPU 4× slowdown, and Fast 3G (network only). Low-end device numbers are the ones procurement asks about; unthrottled numbers are the ones marketing asks about.
- **R9. Statistical rigor sufficient for credibility.** ≥20 paired runs per scenario by default, configurable via `--pairs`. Report median, p95, and standard deviation for every metric, not just means. Disclose the delta's confidence in plain terms (e.g., "LCP median +3ms, within run-to-run noise" vs. "LCP median +120ms, p95 +180ms, significantly above noise"). A benchmark that hides its variance is worse than no benchmark.
- **R10. Hardware and environment disclosure in every report.** Every generated report embeds: machine model/OS/CPU, Node version, Playwright + Chromium version, agent version/commit, system-load warning if the machine was loaded during the run, and the raw JSON of all per-run measurements for third-party verification. No hand-edited numbers.
- **R11. Dual-format output.** Each run produces a human-readable Markdown report (for publication, sharing, procurement PDFs) and a machine-readable JSON file (for diffing, archival, future regression tracking). The Markdown should be readable by a non-developer procurement reviewer: headline table, plain-English summary, methodology section, raw appendix.
- **R12. Self-dogfooded against our own demos.** As part of shipping this work, run the tool against `examples/todolist-tanstack` and `examples/todolist-htmx` and publish the first benchmark reports to `docs/performance/`. The benchmark tool is only half the deliverable — the other half is the first published numbers that prove we believe our own claim.

## Success Criteria

- A customer's platform engineer can run `npm run benchmark -- <URL>` (or the eventual `npx` form) on their own machine with zero faultsense-specific knowledge and get a complete, readable report in under ~10 minutes per scenario.
- The generated Markdown report is self-contained enough that a procurement reviewer who has never seen faultsense can read it and form an opinion about the agent's page impact without asking us a single clarifying question.
- At least one published benchmark report exists in `docs/performance/` against our own demos, numbers disclosed honestly (including any findings that are unflattering — those are *more* credible than perfect numbers).
- A security reviewer can reproduce our published numbers using the same tool on comparable hardware and land within the disclosed variance bands.
- If the tool surfaces real overhead we didn't know about, we fix the agent. The benchmark's job is to tell the truth, not to make the pitch easier.

## Scope Boundaries

- **Not CI regression detection.** Different goal, different design, different statistical approach. Protecting against release-over-release drift is valuable but belongs in a separate initiative.
- **Not authenticated pages.** MVP handles public URLs only. Customers can benchmark their marketing site, pricing page, public product pages, or public docs. Authenticated-page support (via Playwright storage state or scripted login) is deferred to a follow-up, because session-cookie capture adds a UX surface and testing burden disproportionate to MVP value.
- **Not scripted interactions.** MVP is cold-load + idle soak only. "Run my checkout flow 50×" is the strongest marketing story but the steepest adoption curve — most customers will not write an interaction script. Revisit post-MVP if idle-soak numbers are convincing and interaction data is still asked for.
- **Not active-state deep-dive benchmarks.** On customer URLs there are no `fs-*` attributes, so active-state is not measurable there. When the tool is pointed at our own demos, the report will naturally include active-state numbers (because the demos are instrumented) — but no special active-state reporting features (per-assertion timing, resolver flame graphs) are in MVP scope. This is a tool, not a profiler.
- **Not Firefox / Safari in MVP.** Chromium only. Multi-browser coverage is a credibility win for a later iteration; shipping Chromium-only is defensible because it dominates the real-world fleet and Playwright's CDP metrics are Chromium-specific. Explicitly call this out in the report so reviewers aren't confused.
- **Not a hosted web UI / SaaS dashboard.** No hosted infrastructure, no historical trend dashboard, no backend service. Local CLI only. The hosted-tool idea competes with the collector product and is out of scope here.
- **Not Lighthouse-based.** Lighthouse is a browser-agnostic score aggregator with its own opinions; measuring raw CDP metrics directly produces more defensible numbers and fewer third-party dependencies.

## Key Decisions

- **Primary audience is external (procurement / security / platform review), not internal (CI).** Determines that the deliverable is a tool plus a published report, not a test suite plus a threshold check. Every design choice below flows from this.
- **Customer-runnable is non-negotiable.** The strongest answer to "prove it doesn't hurt my site" is "here is a tool you run on your own site." Published-only numbers were considered and rejected; they fall to the "we can't verify your methodology" critique every time.
- **Two-phase distribution: script in agent repo first, standalone npm package later.** Phase 1 lives at `tools/benchmark/` in this repo with a `npm run benchmark` entry point. Phase 2 extracts it to `@faultsense/benchmark` on npm once the methodology has been battle-tested on real customer evals. Phase 1 ships faster and iterates with the agent; Phase 2 unlocks the low-friction `npx @faultsense/benchmark` pitch. The extraction should be planned from day one (clean module boundaries, no deep imports into `src/`) so the later migration is a move, not a rewrite.
- **Idle soak is the load-bearing measurement, not cold load.** Cold-load deltas for an agent this small will usually be in the noise floor and the published numbers will be both unimpressive and high-variance. The unique story the tool tells — the thing no Lighthouse run will show — is the at-rest cost of an installed-but-idle observer over a sustained soak window. That is the claim procurement cannot verify from source, and therefore the one the benchmark is most valuable for.
- **Report variance honestly in plain English.** Hiding variance behind a clean-looking mean is the most common way benchmarks destroy their own credibility. Every delta gets a median + p95 + stdev, and every headline claim gets a plain-English qualifier ("within noise" / "measurable" / "significant"). A number that's honest about its own uncertainty is more trustworthy than one that isn't.
- **Self-dogfooding is part of shipping, not a follow-up.** The benchmark tool without a first published report is half-done. Publishing the first numbers against our demos *as part of* this work proves the tool works and gives us the pitch artifact in one motion.

## Dependencies / Assumptions

- Playwright is already a dev dependency (used by the conformance layer). No new browser-automation library is required.
- The agent build artifact (`dist/faultsense-agent.min.js`) is injectable as a single IIFE script via `addInitScript`. Already true — no changes needed.
- Chromium's CDP APIs (`Performance.getMetrics`, `HeapProfiler`, `Tracing`, `Emulation.setCPUThrottlingRate`, `Network.emulateNetworkConditions`) are sufficient to capture all required metrics without third-party libraries. Core Web Vitals can be measured via the [`web-vitals`](https://github.com/GoogleChrome/web-vitals) script injected alongside the agent, or directly from CDP — to be confirmed in planning.
- Customers who want to benchmark their own site have Node installed. This is a reasonable assumption for any engineer capable of evaluating a frontend monitoring tool.
- The examples/ demo apps are stable and realistic enough to serve as the self-dogfooding substrate. If they are not (underinstrumented, toy-scale), we either enrich them as part of this work or pick a different substrate.

## Outstanding Questions

### Resolve Before Planning
(none — all blocking product decisions are captured above)

### Deferred to Planning
- [Affects R5, R6][Technical] Use the `web-vitals` library injected alongside the agent, or read LCP/CLS/INP directly from CDP `PerformanceObserver` traces? Both work; `web-vitals` is more idiomatic and matches what Google ships, CDP is lower-level and has zero dependencies. Pick in planning.
- [Affects R6][Technical] How to attribute heap growth and CPU time specifically to faultsense rather than to the page itself? Options: differential (page-alone vs page+agent), script-URL attribution in CPU profiles, or V8 heap snapshot diffing with URL filtering. Investigate in planning.
- [Affects R9][Needs research] What is the minimum number of paired runs needed to produce stable medians on a normal developer laptop? Default of 20 is a guess. Calibrate empirically during planning / early implementation by running the tool against a known baseline and looking at convergence.
- [Affects R10][Technical] How to detect and warn about system load before/during a run? Options: load-average check on Unix, a warmup run used as a noise-floor estimate, or both. Decide in planning.
- [Affects R11][Needs research] What does a procurement-ready Markdown report actually look like? Structure, terminology, length, visual hierarchy. Likely a small amount of iteration against a real reviewer is worthwhile before locking the format. Planning should produce a first draft, not a final format.
- [Affects R12][Technical] Where under `docs/performance/` do published reports live, and how are they versioned (per-release directory, per-commit filename, timestamped)? Defer to planning.
- [Affects R4][Technical] Exact default for the idle-soak window. 30s is probably the floor for catching slow leaks; 60s may be wasteful. Calibrate during implementation.
- [Affects scope boundaries][Needs research] Whether to include a `--mode=demo` shortcut that runs against our local `examples/*` apps (spinning them up, benchmarking, tearing down) so the first published reports can be regenerated with a single command. Nice-to-have, but probably worth it for reproducibility.

## Next Steps

→ `/ce:plan` for structured implementation planning
