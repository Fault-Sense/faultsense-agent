---
title: "feat: Benchmark Phase 2 — CWV reporting + active-state benchmarking"
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-benchmark-phase2-requirements.md
---

# feat: Benchmark Phase 2 — CWV reporting + active-state benchmarking

## Overview

Phase 1 shipped a working benchmark tool at `tools/benchmark/` that proves idle overhead is negligible. Phase 2 makes the report credible for procurement by fixing two gaps: (1) Core Web Vitals don't report in headless-shell mode, and (2) only idle soak is measured — no active assertion resolution.

The deliverable is a single `npm run benchmark:demo` command that produces a report with real CWV deltas and active-state numbers showing faultsense overhead when assertions are actively firing.

## Problem Statement / Motivation

A procurement reviewer reading the current report sees all-zero CWV and only idle-soak metrics. This looks like the tool is broken or hiding something. The report needs to show: (a) real LCP/FCP/TTFB deltas proving CWV impact is negligible, and (b) what happens when faultsense is actively resolving assertions during user interactions. Without both, adoption stalls at the security-review gate (see origin: `docs/brainstorms/2026-04-12-benchmark-phase2-requirements.md`).

## Proposed Solution

Two changes to the existing benchmark tool:

1. **Switch from headless-shell to headed Chromium** (`headless: false`). This enables paint compositing so LCP/FCP/TTFB fire via web-vitals v4. Visible browser window during the run is acceptable per user decision.

2. **Add an active-state benchmark scenario** with a fixed canonical interaction sequence against `examples/todolist-htmx`. A/B comparison: condition A = page without agent (same interactions), condition B = page with agent + `fs-*` attributes + assertions actively firing.

Both idle-soak and active-state sections appear in one report from one command.

## Technical Approach

### Headless fix (R1, R5)

Change `chromium.launch({ headless: true })` to `chromium.launch({ headless: false })` in `tools/benchmark/lib/measure.ts` (three call sites). This is the only change needed for CWV.

**INP caveat:** Idle-soak mode has no interactions, so INP will remain 0. Report INP as "n/a (no interactions)" in idle mode rather than a misleading 0ms. Active-state mode will produce real INP from the scripted interactions.

**App Nap risk:** On macOS, a headed browser window behind other windows may be throttled by App Nap during the 60s soak. Mitigate with `--disable-backgrounding-occluded-windows` Chromium flag in the launch args, which Playwright already sets by default. Document in README: "keep the browser window visible during the run for cleanest numbers."

### Active-state scenario (R2, R3)

#### Server state reset

**Critical issue from specflow:** The htmx demo uses an in-memory store. The canonical interaction mutates state (adds/toggles/deletes todos). Condition A runs first, leaving dirty state for condition B — invalidating the A/B comparison.

**Solution:** Add a `POST /reset` endpoint to the htmx demo, guarded by `FS_BENCH=1` env var. The benchmark's `webServer` config already controls the server process, so it sets the env var. The reset endpoint restores the store to its initial 3-seed-todo state. Call `/reset` before each measurement (both A and B).

This is the minimal change to the demo. It doesn't couple the demo to the benchmark — the endpoint is inert unless the env var is set.

#### Interaction script

New file: `tools/benchmark/lib/interact.ts`

Fixed canonical sequence against `examples/todolist-htmx`:

1. **Login:** Fill `input[name=username]` + `input[name=password]` with `demo`/`demo`, click `.login-button`, wait for `#todo-list` to appear (HTMX client-side nav via `HX-Location`, not a full redirect — do NOT use `page.waitForNavigation()`).
2. **Add 3 todos:** For each: fill `#add-todo-input`, click `#add-todo-button`, wait for new `.todo-item` to appear. Settle 300ms between adds.
3. **Toggle 2:** Click first two `.todo-item input[type=checkbox]`, wait for `data-status` attribute change after each. Settle 300ms.
4. **Edit 1:** Click `[id^=edit-btn-]` on third item, wait for `.todo-edit-input` to appear, fill new text, press Enter, wait for edit input to disappear (row swaps back). Settle 300ms.
5. **Delete 1:** Click `.action-btn.delete-btn` on first item, wait for that `.todo-item` to be removed from DOM. Settle 300ms.

This fires ~23 assertions (not ~15 as originally estimated): add triggers + char-count + OOB count updates + toggle triggers + OOB count-stable + edit + delete + OOB chains.

**Settle timing:** Use `page.waitForSelector()` as the primary gate (wait for DOM to reflect the action), plus a 300ms fixed settle buffer matching the conformance harness pattern. This handles HTMX's async fetch + DOM swap + OOB pipeline.

#### A/B conditions for active mode

- **Condition A (no agent):** Inject measurement instruments only (longtask observer, web-vitals). No agent bundle, no init-wrapper, no at-rest-scrub. `fs-*` attributes exist in the DOM but are inert (no agent to process them). Run the canonical interaction sequence.
- **Condition B (active agent):** Inject measurement instruments + agent bundle + init-wrapper. `fs-*` attributes are processed by the agent — assertions fire during interactions. Run the same canonical interaction sequence.

The at-rest-scrub does NOT run in active mode for either condition. It's only used in idle-soak demo mode (existing behavior).

#### Measurement pipeline changes

The current `runMeasurement()` flow is: init scripts → navigate → [CPU throttle] → heap baseline → profiler start → soak → profiler stop → heap end → web-vitals → close.

For active mode, insert the interaction sequence between navigation and soak:

1. Init scripts → navigate to `/login`
2. **Reset server state** (`page.request.post('/reset')`)
3. **Run canonical interaction sequence** (login → add → toggle → edit → delete)
4. CPU throttle (if applicable)
5. Heap baseline → profiler start → soak → profiler stop → heap end
6. Web-vitals finalization → close

The interaction happens *before* the soak, not during it. This way:
- CWV captures the full page lifecycle including interactions
- The soak window still captures idle overhead after the burst of assertion work
- Heap delta captures any memory retained by resolved assertions

### Report changes (R4)

The Markdown report gains a second results section per throttle profile:

```
## Results: Unthrottled (idle soak)
[existing table]

## Results: Unthrottled (active — 23 assertions)
[same table format, but from active-state measurements]
```

The headline summary references both: "idle: LCP Δ +Xms (within noise), active: heap Δ +YKB (measurable)."

INP column shows "n/a" in idle sections and a real value in active sections.

### Config and script changes (R4, R6)

`benchmark.spec.ts` runs both scenarios sequentially:
1. Idle-soak scenario (existing, now with headed browser)
2. Active-state scenario (new, same pairs/profiles)

`npm run benchmark:demo` triggers both. Total run time with 5 pairs × 2 profiles × 2 modes × ~32s = ~21 min.

`npm run benchmark -- <URL>` continues to run idle-soak only (no scripted interactions for arbitrary URLs — we don't know the page's interaction model).

## Acceptance Criteria

**From origin document (R1–R6):**

- [ ] LCP, FCP, and TTFB report non-zero values for pages with visible content (headed Chromium)
- [ ] Active-state benchmark runs the canonical interaction sequence (login + add 3 + toggle 2 + edit 1 + delete 1) against `examples/todolist-htmx`
- [ ] A/B comparison for active state: A = no agent, B = agent with assertions firing
- [ ] Server state is reset between measurements so A and B start from identical state
- [ ] Both idle-soak and active-state sections appear in one report from `npm run benchmark:demo`
- [ ] Existing `npm run benchmark -- <URL>` works with real CWV (idle soak only)
- [ ] `docs/performance/current.md` regenerated with real CWV + active-state data
- [ ] INP shows "n/a" in idle-soak sections (no interactions to measure)

**Correctness (from specflow analysis):**

- [ ] Login uses `waitForSelector('#todo-list')` not `waitForNavigation()` (HTMX client-side nav)
- [ ] Each interaction step waits for its DOM effect before proceeding (selector + 300ms settle)
- [ ] Edit interaction explicitly waits for save completion before delete step
- [ ] at-rest-scrub does NOT run in active-state mode

**Non-functional:**

- [ ] Full demo run (idle + active, 5 pairs, 2 profiles) completes in < 25 min
- [ ] No `as any` in new code

## Dependencies & Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Headed Chromium CWV variance from window compositing | Medium | Verify during implementation; `--disable-gpu` flag if needed |
| macOS App Nap throttles headed browser during soak | Medium | Playwright sets `--disable-backgrounding-occluded-windows` by default; document "keep window visible" in README |
| HTMX settle timing varies, flaky interactions | Medium | Use selector-based waits as primary gate, 300ms fixed settle as buffer |
| Server state reset endpoint modifies demo app | Low | Guarded by `FS_BENCH=1` env var; inert in normal usage |
| Run time doubles with two scenarios | Medium | Already reduced to 5 pairs / 30s soak from Phase 1 learnings |

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-04-12-benchmark-phase2-requirements.md](docs/brainstorms/2026-04-12-benchmark-phase2-requirements.md). Key decisions carried forward: headed mode for CWV, demo apps only (not conformance harnesses), no-agent vs active-agent A/B, fixed canonical interaction sequence.

### Internal

- `tools/benchmark/lib/measure.ts` — existing measurement pipeline, three `chromium.launch()` call sites to change
- `tools/benchmark/lib/report.ts` — report generation, needs active-state section + INP "n/a" handling
- `tools/benchmark/lib/types.ts` — `ScenarioConfig` needs `interactFn` field
- `examples/todolist-htmx/routes/auth.js` — login flow (`demo`/`demo`, `HX-Location` redirect)
- `examples/todolist-htmx/routes/todos.js` — CRUD routes, store reset target
- `examples/todolist-htmx/lib/store.js` — in-memory store to reset
- `conformance/shared/runners.ts` — `HarnessConfig` + settle pattern to mirror

### External

- [Playwright `headless` option](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-headless) — `false` for headed mode
- [web-vitals v4 finalization](https://github.com/GoogleChrome/web-vitals/issues/180) — `visibilitychange` triggers in headed mode
