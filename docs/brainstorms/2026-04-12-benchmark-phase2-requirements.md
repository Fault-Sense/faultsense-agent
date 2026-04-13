---
date: 2026-04-12
topic: benchmark-phase2-cwv-and-active-state
---

# Benchmark Phase 2: CWV Reporting + Active-State Benchmarking

## Problem Frame

Phase 1 shipped a working benchmark tool (`tools/benchmark/`) that produces A/B performance reports. However, the current output is not useful for procurement because:

1. **Web Vitals are all zeros.** `headless: true` in Playwright 1.59+ uses `chrome-headless-shell` which doesn't composite paint frames. LCP, FCP, and TTFB never fire. A report full of "0ms" CWV deltas looks broken, not reassuring.
2. **Only idle soak is measured.** The tool benchmarks a page where faultsense is installed but doing nothing (no `fs-*` attributes, no assertions firing). This answers "what does an idle observer cost?" but not the real question: "what does faultsense cost when it's actually working?"

Without both real CWV numbers and active-state data, the report invites the exact question it's supposed to close: "are you hiding something?"

## Requirements

- **R1. Real CWV data.** LCP, FCP, TTFB, CLS, and INP report non-zero values in the benchmark output for pages with visible content. Fix by launching Chromium in headed mode (`headless: false`) instead of headless-shell. A visible browser window during the run is acceptable.
- **R2. Active-state benchmark mode.** A new benchmark mode that runs scripted interactions against the demo app with faultsense actively resolving assertions. A/B comparison is: A = page without agent (same interactions), B = page with agent + `fs-*` attributes firing assertions.
- **R3. Fixed canonical interaction sequence.** The active-state benchmark runs a hardcoded sequence against `examples/todolist-htmx`: login, add 3 todos, toggle 2, edit 1, delete 1. This fires ~15 assertions per run covering click, change, submit, mount triggers plus OOB chains.
- **R4. Both idle and active numbers in one report.** The published benchmark report includes both idle soak (current behavior, now with real CWV) and active-state sections. One command produces the complete picture.
- **R5. CWV in idle soak mode.** The existing idle soak benchmark (`npm run benchmark -- <URL>` and `npm run benchmark:demo`) reports real CWV values after the headless fix.
- **R6. Updated first published report.** `docs/performance/current.md` is regenerated with real CWV numbers and active-state data. Replaces the Phase 1 placeholder report.

## Success Criteria

- A procurement reviewer reading `docs/performance/current.md` sees non-zero LCP/FCP/TTFB deltas labeled "within noise" alongside active-state metrics (heap, longtasks, wall clock during interactions) and forms an opinion about faultsense overhead without asking clarifying questions.
- The active-state section shows measurable assertion resolution work in condition B (proving faultsense is actually active, not inert) with the delta small enough to label "within noise" or "measurable."
- `npm run benchmark:demo` regenerates the full report (idle + active) in a single run.

## Scope Boundaries

- **Not Layer 2 conformance harness benchmarks.** Per-framework benchmark matrix is a future breadth play. Phase 2 uses demo apps only.
- **Not `examples/todolist-tanstack`.** Needs a production-build path that doesn't exist. Ship with htmx demo only, same as Phase 1.
- **Not configurable interaction sequences.** Fixed canonical sequence. Scenario files are YAGNI until a second demo app is added.
- **Not three-condition comparison.** Active-state is no-agent vs active-agent only. Idle-agent vs active-agent isolation is a later refinement.
- **Not Firefox/Safari.** Chromium-only, same as Phase 1.

## Key Decisions

- **Headed mode for CWV**: Launch Chromium with `headless: false`. Simpler than xvfb or CDP trace extraction. Browser window visible during the run is acceptable per Mitch.
- **Demo apps only for active-state**: Conformance harnesses are minimal and test-focused. Demo apps are richer and more realistic for the procurement story. Layer 2 harnesses can be added later.
- **No-agent vs active-agent A/B**: Clearest procurement answer. "Here's your page without faultsense, here's your page with it actively monitoring." No need to isolate idle vs active overhead.
- **Fixed interaction sequence**: Hardcoded login + CRUD flow exercises all assertion types without scenario-framework complexity.

## Dependencies / Assumptions

- `examples/todolist-htmx` has stable selectors for the scripted interaction (login form, add input, todo checkboxes, edit/delete buttons). These exist today.
- The htmx demo's `fs-*` instrumentation covers click, change, submit, mount, and OOB triggers. Verified: ~15 assertions fire during a full CRUD cycle.
- `headless: false` with Playwright produces consistent CWV numbers on macOS. Needs verification during planning.

## Outstanding Questions

### Resolve Before Planning
(none)

### Deferred to Planning
- [Affects R1][Needs research] Does `headless: false` produce stable LCP/FCP/TTFB numbers in Playwright, or is there per-run variance from window compositing? May need `--disable-gpu` or similar flags.
- [Affects R2][Technical] Should the interaction sequence run during the 60s soak window (interleaved with idle time), or as a separate pre-soak phase? Affects how metrics are attributed.
- [Affects R3][Technical] How does the scripted sequence handle auth state? Fresh login per measurement, or cookie reuse within a pair?
- [Affects R4][Technical] Report structure: two separate headline tables (idle + active) or a combined table with a "mode" column?
- [Affects R6][Technical] Active-state run time estimate. If the interaction sequence adds ~30s per measurement on top of soak, total run time for 5 pairs x 2 profiles x 2 modes = ~40 min. May need to reduce pairs or soak for active mode.

## Next Steps

-> `/ce:plan` for structured implementation planning
