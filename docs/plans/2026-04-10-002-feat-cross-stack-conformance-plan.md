---
title: Cross-stack conformance strategy — DOM mutation pattern suite + framework harnesses
type: feat
status: completed
date: 2026-04-10
completed: 2026-04-11
origin: docs/brainstorms/2026-04-10-cross-stack-conformance-requirements.md
---

# Cross-stack conformance strategy

## Overview

Build a two-layer conformance strategy that decouples **how Faultsense behaves against raw DOM mutation patterns** (Layer 1, jsdom, fast, exhaustive) from **whether Faultsense works end-to-end against real frontend frameworks** (Layer 2, real browser via Playwright, empirical). The two layers form a discovery → lock-in loop: Layer 2 surfaces new mutation patterns real frameworks produce, Layer 1 converts each discovered pattern into a permanent regression test so the same class of bug cannot recur.

The strategy explicitly replaces "re-implement the todolist in every framework." That approach is slow, redundant, and still misses patterns no single app exercises. Frameworks differ only in how they mutate the DOM, and those mutation behaviors are a finite, enumerable set shared across many frameworks. Once a pattern is characterized, any framework that uses that pattern is supported by transitivity.

This plan carries forward all twelve requirements (R1–R12), all ten seeded pattern classes (PAT-01 through PAT-10), and all five deferred-to-planning questions from the origin requirements document. Each deferred question is resolved below in **Deferred-from-Brainstorm Decisions (Resolved)**.

## Problem Statement

Faultsense ships as a zero-dependency, stack-agnostic DOM observer. The public positioning is "works with any framework that renders to DOM," but the only empirical evidence of stack coverage today is two example apps: `examples/todolist-tanstack` (React 19 + TanStack Router + Vite) and `examples/todolist-htmx` (Express + EJS + HTMX 2). Between them, those two apps exposed two load-bearing agent bugs that unit tests had missed:

1. **Pre-existing target false-pass** — fixed in `b9b0fac`. `immediateResolver` was resolving `added`/`removed` assertions against current document state at trigger time, false-passing on elements that existed before the user action. Under `mutex="conditions"` this silently dismissed the legitimate error-variant sibling, so the error outcome never reached the collector. Tests at `tests/assertions/conditionals/resolution.test.ts:50-100` now lock this in.
2. **Fail-fast resolver semantics** — overhauled in PR #20 (commit `301a807`). Before this PR, `handleAssertion` committed `pass=false` immediately when no matching element satisfied all modifiers. Under HTMX's outerHTML swap and transient loading classes, mid-flight modifier mismatches false-failed assertions that would have passed a few milliseconds later. The resolver now returns `null` on negative checks and re-evaluates on every subsequent mutation. Failure is delivered only by `fs-assert-timeout`, the GC sweep (now `gcInterval: 5000` default), or page unload grace. `stable` and `invariant` are explicit exceptions that keep fail-fast semantics because their definitions require commit-on-first-observation. See `src/resolvers/dom.ts:158-219` for the new `handleAssertion` contract.

That second bug also drove six manual-test instrumentation fixes in the HTMX example (panel host preservation under `hx-boost`, outerHTML swaps requiring `added` not `updated`, focus unreliability on dynamically-inserted elements, the fake-checkbox click-delegation pattern, etc.). A handful of these surfaced agent-side corrections, several surfaced instrumentation patterns documented in the skill, and one (virtual-nav lifecycle) was investigated and correctly reverted as a non-bug.

Two takeaways set up this plan:

- **Real frameworks find bugs no synthetic test suite will enumerate in advance.** We cannot write a Layer 1 suite that predicts every pattern; discovery has to come from somewhere.
- **Once a pattern is named, it is cheap to lock in forever.** The `outer-swap-toggle` and `b9b0fac` regression tests are proof — each is ~50 lines of vitest-in-jsdom and catches a whole class of future regression.

The gap today is structural: we have no named catalog of mutation pattern classes, no Layer 2 framework testbed beyond the two existing example apps, and no discovery → lock-in workflow. This plan fills all three gaps.

## Proposed Solution

Two layers, one feedback loop:

**Layer 1 — DOM Mutation Pattern Conformance Suite.** A new named, enumerated catalog (`PAT-01` through `PAT-10` to start, growable) lives in `tests/conformance/` as a set of vitest-in-jsdom tests. Each test drives raw DOM operations that simulate a specific mutation pattern and asserts that the agent resolves the relevant assertion types correctly. Tests are synthetic — no framework runtime is loaded — so they are fast, deterministic, and exhaustive. The catalog itself (names, descriptions, representative frameworks, file pointers) lives in a new doc file that the tests reference by ID.

**Layer 2 — Per-Framework Conformance Harness.** A new top-level `conformance/` directory (sibling to `examples/` and `tests/`) holds one minimal harness app per framework. Each harness renders the ~20 assertion patterns from the tanstack example's `ASSERTIONS.md` on a single page with one trigger per assertion type, loads the agent via `<script>` tags, and registers a custom in-page collector that pushes completed assertions to `window.__fsAssertions`. A Playwright test driver per framework walks the page, triggers each assertion, and verifies the expected payloads appear. The two existing example apps (tanstack, htmx) are reused as-is by adding only the in-page collector adapter and a Playwright driver file — they remain examples for humans, but also double as harnesses for CI. Vue 3 and Hotwire are built fresh as minimal harness apps under `conformance/vue3/` and `conformance/hotwire/`.

**The discovery → lock-in loop is documented as a canonical workflow.** When a Layer 2 harness exposes a new bug, the workflow is: (1) diagnose root cause, (2) name the mutation pattern class, (3) add a new `PAT-NN` entry to the catalog with a failing test, (4) fix the agent, (5) verify both layers green. This is documented in `CLAUDE.md` under a new "Conformance strategy" section so every future framework addition compounds the catalog instead of being one-off work.

## Deferred-from-Brainstorm Decisions (Resolved)

The origin requirements doc flagged five questions to resolve during planning. Each is answered below with its rationale and the file evidence that informed the answer.

### Q1. Should Layer 1 run in jsdom, or move to Vitest browser mode alongside Layer 2? (R2, R8)

**Decision: Layer 1 stays in jsdom.** (see origin: R2)

Layer 1's job is to exercise the agent's assertion resolver against *every* named mutation pattern as fast and as deterministically as possible. The relevant agent code — `src/assertions/manager.ts:249-283`, `src/resolvers/dom.ts:158-219`, `src/processors/mutations.ts:7-53` — consumes DOM mutation records via a `MutationObserver`. jsdom implements `MutationObserver` with the same semantics as a real browser for the operations we care about: `childList`, `attributes`, `characterData`, `subtree`. There is no semantic gap between jsdom and a real browser for the Layer 1 scope. Moving Layer 1 to browser mode would triple per-test latency for zero gain.

The only places jsdom diverges in ways that matter are layout (`getBoundingClientRect`, computed visibility) and paint-boundary APIs. These are mocked via `vi.mock("../../src/utils/elements", ...)` in existing tests where needed (see `tests/assertions/visible.test.ts` and `tests/assertions/focused.test.ts` for the canonical stubs).

### Q2. Reuse existing tanstack/htmx example apps in place, or extract minimal `conformance/react/` and `conformance/htmx/` pages? (R6, R9)

**Decision: every harness is purpose-built minimal under `conformance/`. The `examples/todolist-*` apps stay in `examples/` as pure marketing + manual demos, decoupled from the conformance suite.** (see origin: R6, R9)

**This is a reversal** — the original decision was "reuse in place" with a `VITE_FS_COLLECTOR=conformance` env-var switch wired into the tanstack example. We shipped that in Phase 3 as a single-scenario smoke test and then built Phase 4 (Vue 3) and Phase 5 (Hotwire) as purpose-built minimal harnesses. The reversal landed after Phase 5 — enough evidence had accumulated that the minimal-harness pattern was strictly better.

**Why the reversal:**

- **Consistency beats cleverness.** Two patterns ("reuse example with env-var switch" vs. "purpose-built minimal") is cognitive overhead. Every new framework harness would have to pick. One pattern is simpler.
- **Decoupling lets the demos be demos.** The tanstack example had to be two things at once: a pretty showcase AND a test-driveable harness. Marketing polish (animations, styling, route changes) risked breaking the conformance driver. Decoupling lets the demo become actually polished while the harness stays minimal and stable.
- **Better scenario coverage.** Phase 3's tanstack smoke test had 1 scenario. Vue 3 and Hotwire had 10 and 7 respectively. Matching tanstack → `conformance/react/` with full 10-scenario coverage makes the Phase 6 works-with matrix meaningful instead of lopsided.
- **Solves TanStack Start's dev-mode double-init quirk.** The Phase 3 driver needed a 500 ms settle wait to work around a `<Scripts />` HMR re-init. A plain Vite + React harness without TanStack Start's SSR path doesn't have that problem.
- **Faster CI.** TanStack Start's dev server boots in ~3-5s; a minimal Vite + React dev server boots in <1s (same as vue3).

**What's in `conformance/`:**

- `conformance/react/` — plain React 19 + Vite + StrictMode. Covers React reconciliation, hooks state, keyed list updates, conditional JSX. NOT TanStack Start — TanStack Start-specific quirks (SSR hydration, `<Scripts />` re-init) are out of scope and can become a future `conformance/tanstack-start/` harness if demand arises.
- `conformance/vue3/` — Vue 3 Composition API + Vite. Covers `nextTick` batching and fine-grained reactivity.
- `conformance/hotwire/` — Rails 8 + turbo-rails + Turbo 8 (Docker-hosted). Covers Turbo Stream append/replace/remove + OOB.
- `conformance/htmx/` — minimal Express + EJS + HTMX 2. Covers `hx-swap` variants and `hx-swap-oob`. Language-agnostic — the Node host is a faithful harness because HTMX's mutation shapes are driven by the client library, not the server language.

**What's in `examples/`:**

- `examples/todolist-tanstack/` — React 19 + TanStack Start + Vite, full SSR, panel collector, auth + routing + offline banner + activity log. Marketing showcase and the "read this to learn how to instrument a real app" reference. Not driven by the conformance suite.
- `examples/todolist-htmx/` — Express + EJS + HTMX 2, panel collector. Same role for the HTMX audience. Not driven by the conformance suite.

Each harness follows the same shape: a `package.json` or `Gemfile`, a single-file app/component/view rendering all scenarios, a `public/` directory with symlinks to `dist/faultsense-agent.min.js` and `conformance/shared/collector.js`, a matching driver under `conformance/drivers/<framework>.spec.ts`, and a `webServer` entry in `conformance/playwright.config.ts`. The `scope: :todo` / `local: false` / route helper / CSRF / selector-quoting / HTMX transient-class / React controlled-checkbox findings from implementing these are captured in `docs/framework-integration-notes.md`.

### Q3. Collector shape for Layer 2? (R8)

**Decision: in-page global, registered via Faultsense's existing custom-collector-by-name mechanism.** (see origin: R8)

The repo already supports custom collectors registered on `window.Faultsense.collectors[name]` resolved by the `data-collector-url` attribute on the agent script tag (see `src/index.ts:151-161`). This is the same extension point the panel collector uses.

**Custom collector signature (important correction from first draft).** Custom collectors are invoked ONCE PER SETTLED ASSERTION with a single `ApiPayload` object — _not_ with an array. See `sendToFunction` in `src/assertions/server.ts:37-57`. The payload uses the wire-format snake_case field names (`assertion_key`, `condition_key`, `assertion_type`, `assertion_type_value`, `assertion_type_modifiers`, …), not the agent's internal camelCase. The panel collector at `src/collectors/panel.ts:877` is the canonical reference.

The Layer 2 collector adapter:

```javascript
// conformance/shared/collector.js — loaded before the agent script in every harness
(function () {
  window.__fsAssertions = window.__fsAssertions || [];
  window.Faultsense = window.Faultsense || {};
  window.Faultsense.collectors = window.Faultsense.collectors || {};
  window.Faultsense.collectors.conformance = function (payload /*, config */) {
    // Defensive JSON clone — the agent mutates assertion objects post-settlement
    // (invariant auto-retry, sibling dismissal) so a shared reference would
    // corrupt the captured snapshot. Snake_case keys match ApiPayload.
    window.__fsAssertions.push(JSON.parse(JSON.stringify(payload)));
  };
})();
```

Harnesses set `data-collector-url="conformance"` on the agent script tag. Playwright drivers read results via `page.evaluate(() => window.__fsAssertions)` and filter by `assertion_key` / `status`. No HTTP listener, no Playwright fixtures beyond the standard `test`, no custom RPC. The shared helpers at `conformance/shared/assertions.ts` (`waitForFsAssertion`, `assertPayload`, `readCapturedAssertions`, `resetCapturedAssertions`) wrap the common polling pattern.

### Q4. Where does the "works-with" matrix live? (R10)

**Decision: the matrix is generated from Playwright JSON output and committed to the repo at `docs/works-with.md`. The README references it with a short badge-style excerpt.** (see origin: R10)

Rationale: generating the matrix from actual test output (not hand-maintained claims) prevents drift. Committing it to this repo (not the `.org` docs repo) keeps the source of truth next to the code that validates it. The docs site can `fetch` or iframe it, or pull a rendered snapshot via a separate publishing step — that is a `.org` repo concern, not this plan's.

Format: a simple grid with rows = framework, columns = pattern IDs, cells = `pass` / `fail` / `n/a`. Generation script lives at `conformance/scripts/generate-matrix.js` and runs as a post-test step.

### Q5. Does Faultsense currently traverse shadow roots? Is PAT-10 a gap-discovery test or a blocker? (R3, PAT-10)

**Decision: Faultsense does not currently traverse shadow roots. `PAT-10` ships as an `it.fails()` expected-failure test with a comment pointing to a separate future feature plan.** (see origin: R3, PAT-10)

File evidence: the agent creates a single `MutationObserver` rooted at `document.body` with `subtree: true` in `src/index.ts:67-76`. `MutationObserver` does not cross shadow root boundaries — `subtree: true` only descends into light-DOM children. A grep of `src/` for `shadowRoot`, `attachShadow`, and `composed` finds matches only in `src/collectors/panel.ts` (which uses a shadow root to isolate the panel's own UI — that's its *own* shadow, not user-site traversal). The immediate/document resolvers (`src/resolvers/dom.ts:277-316`) use bare `document.querySelector(...)`, not `getRootNode()` or `composedPath()`.

`PAT-10` is therefore a confirmed gap. The plan writes a test that drives a shadow-rooted target and expects the assertion to NOT resolve (the current correct behavior given the gap). When shadow DOM support ships in a future plan, flipping the expectation is a one-line change. This marks the gap explicitly without blocking the plan.

### Q6. Natural backend per framework — Rails for Hotwire, and the policy for future polyglot harnesses. (late addition, resolved mid-execution)

**Decision: each Layer 2 harness uses that framework's natural backend. Hotwire → Rails. Future Livewire → Laravel, future LiveView → Phoenix.** (raised mid-execution, not in the original brainstorm)

The original plan specified Express + EJS for the Hotwire harness because the existing HTMX example uses that stack. That was the wrong call. HTMX is language-agnostic — its mutation shapes are the same regardless of backend — so Express + EJS is a fine minimal host. **Hotwire is not.** Turbo was built for Rails; nearly every Turbo mutation shape observed in the wild is produced by `turbo_stream.replace`, `turbo_frame_tag`, or Turbo 8 morphing (`refresh="morph"`), all rendered by Rails helpers that write specific attribute combinations. A hand-rolled Express app emitting Turbo-shaped HTML tests what we _think_ Turbo produces, not what it actually produces. That defeats Layer 2's purpose — catching real-framework surprises that Layer 1 cannot predict.

The same logic extends to future framework additions: Livewire is PHP/Laravel-only by design, and LiveView is Elixir/Phoenix-only. A minimal JS host for either would be fiction.

**Tradeoffs:**

- **CI:** `ruby/setup-ruby`, `setup-php`, `setup-elixir` are all solid GitHub Actions and each add ~30–60s to CI setup, running in parallel with the Node jobs. Cached toolchain installs make repeat runs cheap.
- **Local contributor friction:** someone adding a new `PAT-NN` test from a Rails-exposed bug likely already has Ruby installed. A contributor without Ruby can still run Layer 1 + the Node harnesses (tanstack, htmx, vue3) and skip `npm run conformance -- --project=hotwire`. Document the skip path in `conformance/README.md`.
- **Maintenance burden:** kept minimal — `rails new --minimal --skip-*` produces ~5 files plus a Gemfile, and the harness uses Turbo via CDN or importmap with no asset pipeline cruft. Rails/Bundler updates follow normal dependabot cadence.
- **Docker escape hatch (optional, later):** a per-harness `Dockerfile` plus a wrapper script (`npm run conformance:docker`) would let contributors run polyglot harnesses without installing the native toolchain. Out of scope for this plan; noted as a follow-up if friction becomes real.

**Convention for future plans:** the rule is "each framework harness uses that framework's natural backend." When a new framework is added, default to its idiomatic host unless the framework is explicitly language-agnostic.

## Research Summary

Distilled from the repo-research-analyst and learnings-researcher agents. Full reports in conversation context at plan-creation time.

### Existing test infrastructure

- Vitest 3.2.4 + jsdom 25, config inline in `package.json:41-48`, setup file at `setupTests.ts` (near-empty, only polyfills `HTMLElement`).
- Canonical test pattern: `// @vitest-environment jsdom` header → import `init` from `src/index` → `vi.useFakeTimers()` and mock `Date.now` → `vi.spyOn(resolveModule, "sendToCollector").mockImplementation(() => {})` → call `init(config)` with inline config → set `document.body.innerHTML`, attach event listeners that mutate DOM, dispatch the trigger event, `await vi.waitFor(() => expect(sendToServerMock).toHaveBeenCalledWith(...))`. See `tests/assertions/added.test.ts:1-59`, `tests/assertions/removed.test.ts:1-44`, `tests/assertions/conditionals/resolution.test.ts:50-100`.
- The shared helper `tests/helpers/assertions.ts` is unused — top-of-file comment literally says "Not current used". Resurrecting and extending it is a Phase 1 deliverable.
- **Neither `@vitest/browser` nor `playwright` is installed as a direct devDependency.** Both are new direct installs in Phase 3.
- **Vitest mock aliasing trap:** `vi.spyOn` stores references to assertion objects, not deep copies. Post-recording mutation corrupts captured args. The Layer 1 tests already work around this because they assert quickly via `vi.waitFor`, but the Layer 2 in-page collector uses `JSON.parse(JSON.stringify(...))` defensively (see Q3). Documented at `docs/solutions/logic-errors/assertion-pipeline-extension-ui-conditional-and-invariant-triggers.md`.

### Agent internals relevant to Layer 1

- Single `MutationObserver` at `src/index.ts:67-76`, rooted at `document.body` with `{ childList, subtree, attributes, characterData }`. **Shadow DOM is not traversed.**
- Manager pipeline at `src/assertions/manager.ts:249-283`: process mutations for new `mount`/`invariant` assertion creation → enqueue → resolve pending assertions against the same mutation batch → settle completed.
- `checkImmediateResolved` at `manager.ts:56-104` with the `eventBasedTypes = ["loaded", "stable", "updated", "added", "removed"]` exclusion list at line 73. The `b9b0fac` fix added `added` and `removed` to that list. These types now resolve *only* via mutation observation. OOB still bypasses this exclusion at `manager.ts:358` — intentional because OOB fires after the parent has resolved, so the mutation has already happened.
- Wait-for-pass contract at `src/resolvers/dom.ts:158-219`: `handleAssertion` returns `null` when no match satisfies modifiers so the assertion stays pending; failure is delivered only by `fs-assert-timeout`, GC sweep (`gcInterval: 5000` default, see `src/config.ts:4`), or page unload grace. Exceptions: `stable` (inverted-resolution) commits on first matching mutation; `invariant` commits on count violation and on pass to handle recovery. This is the architecture PAT-02 and PAT-03 lock in.
- Mutation → element fanout at `src/processors/mutations.ts:7-53`: for each `MutationRecord` → buckets elements into `addedElements`, `removedElements`, `updatedElements`. For `childList` it includes descendants of added/removed nodes via `querySelectorAll('*')`. For `attributes` the target is `updated`. For `characterData` the target's `parentElement` is `updated`. **This is the exact code path PAT-06 (text-only mutation) exercises.**
- Conditional mutex: parser at `src/processors/elements.ts:129-152`, sibling-group resolution at `src/assertions/assertion.ts:75-132`, dismissal filtered by `getAssertionsToSettle` before the collector sees them. Pattern tests for conditionals assert *presence of winner* and *absence of dismissed siblings* via `expect(sendToServerMock).toHaveBeenCalledTimes(1)` — see `tests/assertions/conditionals/resolution.test.ts` for the canonical pattern.
- Click event delegation walks up from `event.target` via `closest()` in the event processor (added in PR #20). This means child-element clicks on nested icons/spans resolve to the `fs-trigger` host. Tests for `PAT-03` and `PAT-05` should not over-constrain the trigger target.
- Recent commit `b9b0fac` (pre-existing target fix) and all of PR #20 (wait-for-pass adoption, `gcInterval` 30s→5s, click delegation, panel host `hx-preserve`, `outer-swap-toggle` test) are the direct antecedents of this plan.

### Documentation drift to fix alongside this plan

`CLAUDE.md:70` under "Timeout Model" still says "GC sweep (`config.gcInterval`, default 30s)". The actual default is 5000ms since PR #20. Phase 6 fixes this.

### Example app shapes (Layer 2 reference)

- **Tanstack** (`examples/todolist-tanstack/`): TanStack Router + Start + React 19 + Vite 7. Agent loaded via `head` scripts in `src/routes/__root.tsx:15-29` with `data-collector-url="panel"`. For conformance reuse, add a new `conformance` collector registration in a side-effect import before the head scripts, then override the `data-collector-url` to `conformance` in a Playwright beforeEach that rewrites the script tag before agent init — OR (simpler) add a second harness entry point at `examples/todolist-tanstack/conformance.html` with the conformance collector wired from the start.
- **HTMX** (`examples/todolist-htmx/`): Express 4.21 + EJS + HTMX 2. Agent loaded in `views/layout.ejs:13-22`. Uses `<div id="fs-panel-host" hx-preserve="true">` to survive `hx-boost` body swaps. For conformance reuse, same pattern: a second layout `views/layout-conformance.ejs` that wires the conformance collector instead of the panel collector, and a `/conformance` route that renders that layout.
- **Both examples** link `dist/faultsense-agent.min.js` as a symlink. Rebuild of the agent updates all examples immediately. The conformance harnesses will do the same.

## Implementation Phases

Six phases, sized so each produces an independently useful increment. Phase dependencies flow left-to-right: 1 → 2, 1 → 3 → (4, 5, 6).

### Phase 1: Test helper consolidation and catalog scaffolding

**Goal:** stop duplicating 40 lines of setup boilerplate across every new test file, and create the catalog artifact that Phase 2 populates.

**Tasks:**

1. Rewrite `tests/helpers/assertions.ts` as the canonical test harness.
   - Export `setupAgent(config?)` returning `{ sendToCollectorSpy, cleanup, advanceToGC }`.
   - `setupAgent` calls `vi.useFakeTimers()`, stubs `Date.now` to `fixedDateNow = 1230000000000`, stubs `isVisible` via `vi.mock`, spies on `resolveModule.sendToCollector`, and calls `init(config)` with sensible defaults (`apiKey: "test"`, `releaseLabel: "test"`, `gcInterval: 5000`, `unloadGracePeriod: 2000`, `collectorURL: "http://localhost:9000"`).
   - `cleanup()` calls the agent cleanup function and resets timers.
   - `advanceToGC()` advances fake timers past `gcInterval + 100` so expected-fail tests don't hang. This is the new convention for PAT-02 and similar tests that rely on timeout/GC delivery.
2. Migrate three representative existing tests to the new helper — `tests/assertions/added.test.ts`, `tests/assertions/conditionals/resolution.test.ts`, `tests/assertions/outer-swap-toggle.test.ts` — as proof the helper covers the existing patterns. No mass migration; the rest of the suite can be migrated incrementally later.
3. Create `docs/mutation-patterns.md` — the named catalog artifact. Opens with a one-paragraph explanation of the discovery → lock-in loop, then one section per pattern with: `PAT-NN` ID, title, description, representative framework(s), current agent support (`supported` | `gap`), and a file pointer to the test. Seed with the ten pattern classes from the brainstorm (R3), leaving the test-file pointers as TODOs until Phase 2.
4. Add a "Conformance strategy" section to `CLAUDE.md` (after the existing "Timeout Model" section) explaining the two-layer strategy in ~15 lines and linking to `docs/mutation-patterns.md`. This makes the workflow discoverable to future work on the agent.

**Files touched:**
- `tests/helpers/assertions.ts` (rewrite)
- `tests/assertions/added.test.ts` (migrate — proof of helper)
- `tests/assertions/conditionals/resolution.test.ts` (migrate)
- `tests/assertions/outer-swap-toggle.test.ts` (migrate)
- `docs/mutation-patterns.md` (new)
- `CLAUDE.md` (add "Conformance strategy" section)

**Acceptance criteria:**
- [ ] `tests/helpers/assertions.ts` exports `setupAgent`, `cleanup`, `advanceToGC`.
- [ ] Three migrated tests use the helper and pass unmodified against `main`.
- [ ] `docs/mutation-patterns.md` exists with all ten PAT entries, stable IDs, descriptions, and `status: gap` correctly set for PAT-10.
- [ ] `CLAUDE.md` references the new mutation-patterns doc.
- [ ] `npm test` passes with no flakes or timing changes to existing tests.

**Risks:**
- **Vitest mock aliasing.** Surface any existing mutation-after-capture issues by adding a defensive assertion shape check in the helper. Mitigation: the helper captures spy arguments via `JSON.parse(JSON.stringify(arg))` before returning.
- **Scope creep on the migration.** Three files only. Do not migrate the rest as part of this phase — it's unrelated churn that would bloat the PR.

### Phase 2: Layer 1 — DOM Mutation Pattern Conformance Suite (PAT-01 through PAT-10)

**Goal:** implement one vitest test file per seeded pattern, each locking in a class of mutation behavior. New files live under `tests/conformance/` to keep them separable from the existing per-assertion-type tests.

Each test file imports the Phase 1 helper, creates the relevant DOM state, dispatches the trigger, applies the pattern-specific mutation sequence, and asserts the expected `sendToCollector` call. Each file starts with a comment block naming the pattern ID, linking to the catalog entry, describing the pattern in prose, and calling out the known-framework examples. Each file has at least one test per assertion type the pattern affects.

Pattern-by-pattern implementation notes follow. File paths are all relative to the repo root.

#### PAT-01 `pre-existing-target` → `tests/conformance/pat-01-pre-existing-target.test.ts`

**What it tests:** selector already matches at trigger time. Agent must NOT resolve `added` via `immediateResolver`. Under `mutex="conditions"`, the error variant must still be able to fire.

**How:** put an existing `.todo-item` in the DOM *before* calling `init()`. Then attach a click listener that does nothing (simulates a failed add). Click the trigger with `fs-assert-added-success=".todo-item"` + `fs-assert-added-error=".add-error"` + `fs-assert-mutex="conditions"` + `fs-assert-timeout="500"`. Advance timers. Assert the error variant reached the collector, not the success variant.

**Regression reference:** commit `b9b0fac`, existing test at `tests/assertions/conditionals/resolution.test.ts:50-100`. The Phase 2 version moves this into `tests/conformance/` as the canonical PAT-01 test. The existing test stays in place as a secondary-level regression in the conditionals file.

**Critical setup detail:** `init()` must be called AFTER the pre-existing DOM is set, or the initial observer `subtree` walk will see the pre-existing element as an addition. See the `cleanupFn(); document.body.innerHTML = ...; cleanupFn = init(config);` pattern in the existing conditionals test.

**Assertion types covered:** `added`, `removed` (negative case — element removed before trigger should not false-pass `removed`).

#### PAT-02 `delayed-commit mutation` → `tests/conformance/pat-02-delayed-commit-mutation.test.ts`

**What it tests:** a transient mutation (loading class, spinner, placeholder) fires between trigger and final outcome. Wait-for-pass semantics must keep the assertion pending across the transient and commit on the final state.

**How:** two sub-scenarios per assertion type.

1. **Transient does NOT match the assertion selector.** Trigger fires, listener adds `.loading` class, then after a microtask removes `.loading` and adds `.result`. Assertion `fs-assert-added=".result"` must pass. Sanity check — validates the wait-for-pass contract in its easy case.
2. **Transient matches the assertion selector but fails a modifier** (the dangerous case). Trigger fires, listener adds `.result` with `data-status="loading"`, then after a microtask flips `data-status` to `"complete"`. Assertion `fs-assert-added=".result[data-status=complete]"` must NOT commit on the transient and must pass on the final mutation. This is the class of bug that caused the HTMX regression.

**Regression reference:** PR #20 — `feat(resolvers): adopt wait-for-pass semantics for DOM assertions`. The current `handleAssertion` implementation at `src/resolvers/dom.ts:158-219` returns `null` when no matching element satisfies modifiers, so this test should pass on `main`. It locks in that contract.

**Assertion types covered:** `added`, `updated`, `visible`, `hidden`. Explicitly `stable` and `invariant` are the exceptions — add two counter-tests confirming `stable` DOES commit on the transient (inverted-resolution expects commit-on-first-match) and `invariant` commits on count violation.

#### PAT-03 `outerHTML replacement` → `tests/conformance/pat-03-outer-html-replacement.test.ts`

**What it tests:** the trigger host's target node is swapped wholesale — the old node is in `removedElements`, the new node is in `addedElements`, and `updatedElements` contains only the parent (the `childList` mutation target). The agent must use `added` (or `removed`) assertion types, not `updated`.

**How:** start with `<ul id="list"><li class="todo-item completed">...</li></ul>`. Click trigger runs `list.innerHTML = '<li class="todo-item">...</li>'`. Assertion `fs-assert-added=".todo-item[classlist=completed:false]"` must pass. Assertion `fs-assert-updated=".todo-item[classlist=completed:false]"` must NOT pass on this swap pattern (documents the known instrumentation gotcha).

**Regression reference:** existing `tests/assertions/outer-swap-toggle.test.ts` covers this. The Phase 2 version is the canonical pattern-named entry; the existing test stays as the lower-level regression. Cross-reference both files in `docs/mutation-patterns.md`.

**Assertion types covered:** `added`, `removed`, `updated` (negative case).

#### PAT-04 `morphdom preserved-identity` → `tests/conformance/pat-04-morphdom-preserved-identity.test.ts`

**What it tests:** target node identity is preserved while attributes/children are patched. The mutation produces `attributes` or `characterData` mutation records targeting the existing node, not `childList` swaps.

**How:** simulate morphdom behavior by mutating attributes on an existing node directly (`node.setAttribute('class', 'completed')`, `node.textContent = 'New text'`). This is actually the `PAT-06 text-only mutation` path for text, and an `attributes`-record path for attribute changes. Assertion `fs-assert-updated=".todo-item[classlist=completed:true]"` must pass.

**Why it still deserves its own entry:** morphdom also preserves children across patches. If an ancestor is morphed but a descendant keeps its identity, the mutation observer fires on the ancestor (`childList` or `attributes`) AND on the descendant (`attributes`). The bucket fanout in `src/processors/mutations.ts:7-53` handles this, but a dedicated test locks in that `updated` assertions on nested morph targets still resolve.

**Representative frameworks:** Livewire, Turbo 8 morphing, Alpine `x-html.morph`.

**Assertion types covered:** `updated`, `visible`, `text-matches`.

#### PAT-05 `detach-reattach` → `tests/conformance/pat-05-detach-reattach.test.ts`

**What it tests:** node briefly leaves the DOM then returns. Two sub-scenarios: (a) node is re-added to the same parent (React keyed reorder), (b) node is moved between parents (Portal, fragment reparenting).

**How:** start with `<div id="container"><div class="target" data-v="1"></div></div>`. Trigger calls `container.innerHTML = ''` synchronously then re-inserts `<div class="target" data-v="2"></div>` in the next microtask. Assertion `fs-assert-updated=".target[data-v=2]"` — does this pass? Under wait-for-pass, yes, because the first mutation batch has a `removedElements` entry (fails modifier) and the second has an `addedElements` entry (passes modifier). Lock this in.

React 18 StrictMode's double-mount is a real variant: mount → unmount → mount. Add a second test that executes three mutation batches: insert → remove → re-insert. The assertion `fs-assert-added=".target"` should pass on the final insert.

**Assertion types covered:** `added`, `updated`.

#### PAT-06 `text-only mutation` → `tests/conformance/pat-06-text-only-mutation.test.ts`

**What it tests:** the only change is a `textContent` or `characterData` update, no element structure change. This is the common case for fine-grained reactivity (Solid, Svelte, Vue 3 reactive text bindings).

**How:** start with `<div id="counter">0</div>`. Trigger sets `counter.firstChild.nodeValue = '1'`. Assertion `fs-assert-updated="#counter[text-matches=\d+]"` must pass. The mutation record fanout at `src/processors/mutations.ts:7-53` promotes characterData-target's `parentElement` into `updatedElements`, which is why this works.

Counter-test: `fs-assert-updated="#counter[text-matches=\D+]"` (expects non-digits) must NOT commit on any mutation and must time out.

**Assertion types covered:** `updated`, `visible` with `text-matches`.

#### PAT-07 `microtask batching` → `tests/conformance/pat-07-microtask-batching.test.ts`

**What it tests:** multiple independent mutations arrive in one `MutationObserver` callback. React 18 automatic batching, Vue `nextTick`, and any `queueMicrotask`-wrapped update path produce this shape.

**How:** trigger schedules two separate mutations in a single synchronous path (e.g., `elA.classList.add('x'); elB.textContent = 'y'`). The MutationObserver fires once with two records. Assertion `fs-assert-updated=".target-a[classlist=x:true]"` + a second OOB assertion on `.target-b` should both resolve from the same callback.

**Why this is worth its own entry:** `handleMutations` at `src/assertions/manager.ts:249-283` runs the mutation fanout over the full records array. If assertion A resolves from record 1 and assertion B only matches on record 2, the iteration order and bucket flushing must not cause assertion B to be missed. Lock in the multi-record batch case explicitly.

**Assertion types covered:** `updated`, `added`, conditional outcomes.

#### PAT-08 `cascading mutations` → `tests/conformance/pat-08-cascading-mutations.test.ts`

**What it tests:** a single trigger causes many mutations across unrelated subtrees. This is the OOB case — one trigger resolves a primary assertion AND fires OOB assertions that live in different parts of the DOM.

**How:** start with `<button fs-assert="parent" fs-trigger="click" fs-assert-added=".child">` plus a hidden sentinel `<div fs-assert="sibling" fs-assert-oob="parent" fs-assert-added=".sibling-marker">`. Click handler inserts `.child` in the button's subtree AND `.sibling-marker` in an unrelated subtree. Both assertions must resolve — primary via mutation observation, OOB via `immediateResolver` called from `settle()` after primary resolution (`src/assertions/manager.ts:358`). This exercises the OOB path that intentionally bypasses the `b9b0fac` exclusion.

**Assertion types covered:** OOB chaining, `added` on both primary and OOB.

#### PAT-09 `hydration upgrade` → `tests/conformance/pat-09-hydration-upgrade.test.ts`

**What it tests:** SSR-rendered nodes gain attributes, listeners, or children when the client "hydrates." Element identity is preserved, but its state changes.

**How:** simulate hydration by starting with `<button class="unhydrated" data-state="ssr">Click</button>` in the DOM before `init()`. After init, simulate the hydration pass: `button.setAttribute('data-state', 'hydrated')`, `button.classList.remove('unhydrated')`, `button.classList.add('hydrated')`. Assertion `fs-assert="layout/hydrated" fs-trigger="invariant" fs-assert-visible="button.hydrated"` — invariants handle this naturally because they watch perpetually.

Also test: assertion with `fs-trigger="mount"` on the hydrated element. The mount trigger must not fire a second time on hydration (only on true DOM insertion) — this is the gotcha. Verifies the mount processor at `src/assertions/manager.ts` (via `createElementProcessor(["mount","invariant"])`) correctly handles already-present elements.

**Assertion types covered:** `invariant` with `visible`, `mount` trigger.

#### PAT-10 `shadow-dom traversal` → `tests/conformance/pat-10-shadow-dom-traversal.test.ts`

**Status: GAP — expected-failure test.**

**What it tests:** the assertion target lives inside an `attachShadow`-created shadow root. The current agent's `MutationObserver` at `src/index.ts:67-76` does not cross shadow boundaries, so mutations inside the shadow tree are invisible.

**How:** create `<div id="host"></div>`, call `host.attachShadow({ mode: 'open' })`, then insert `<button fs-assert="shadow/click" fs-trigger="click" fs-assert-added=".shadow-result">` into the shadow root. Click handler inserts `<div class="shadow-result">` inside the same shadow. Expected behavior on `main`: the trigger processor does not see the click (and/or the assertion never resolves). Use `it.fails` with a comment explaining this is intentional — when shadow DOM support ships, the expectation flips.

**File pointer:** `docs/mutation-patterns.md` entry for PAT-10 links to a future plan for shadow DOM support (not created by this plan, just referenced as "open gap").

**Acceptance criteria for Phase 2:**
- [ ] Ten files under `tests/conformance/pat-NN-*.test.ts` exist, one per pattern.
- [ ] PAT-01 through PAT-09 all pass on `main` with no agent changes. Failures indicate real regressions.
- [ ] PAT-10 uses `it.fails` and passes the vitest check (the expected failure is the green state).
- [ ] `docs/mutation-patterns.md` file pointers are filled in for all ten entries.
- [ ] `npm test` total runtime increases by <2s over `main` baseline (rough target; re-measure after implementation).
- [ ] Each test file has a top-of-file comment block naming the pattern, linking the catalog, and describing the real-world frameworks that produce the pattern.

**Risks:**
- **Existing tests drift.** Phase 2 adds new tests; it must not modify existing ones except via the Phase 1 migration of three files. Any new failure in a non-conformance test is a blocker.
- **Fake-timer hangs.** Tests that rely on GC or unload failure semantics need `advanceToGC()`. Phase 1's helper enforces this; if a Phase 2 test forgets, the vitest default timeout will catch it fast.
- **Pattern naming drift.** Every new PAT added in the future must follow the same file-naming and comment-header convention. Phase 1 establishes the convention; Phase 6 documents it in CLAUDE.md.

### Phase 3: Layer 2 infrastructure (Playwright + in-page collector)

**Goal:** stand up the directory layout, shared collector code, Playwright configuration, and one smoke test proving the infrastructure works end-to-end against the existing tanstack example. No new framework harnesses yet.

**Tasks:**

1. Add direct devDependency: `@playwright/test` (current latest, verify version at install time). Run `npx playwright install --with-deps chromium` as a one-time local setup step; CI will use the GitHub Action.
2. Create `conformance/` directory with this layout:
   ```
   conformance/
   ├── README.md              # explains the strategy, links to mutation-patterns.md
   ├── playwright.config.ts   # projects for each harness, webServer config per project
   ├── shared/
   │   ├── collector.js       # the in-page conformance collector (Q3)
   │   └── assertions.ts      # shared Playwright helpers (waitForFsAssertion, assertPayload, etc.)
   ├── drivers/
   │   ├── tanstack.spec.ts   # driver for the existing examples/todolist-tanstack app
   │   ├── htmx.spec.ts       # driver for the existing examples/todolist-htmx app
   │   ├── vue3.spec.ts       # Phase 4
   │   └── hotwire.spec.ts    # Phase 5
   ├── vue3/                  # Phase 4
   ├── hotwire/               # Phase 5
   └── scripts/
       └── generate-matrix.js # Q4 — post-test matrix generation
   ```
3. Implement `conformance/shared/collector.js` as specified in Q3. Structured-clone assertion arrays into `window.__fsAssertions` defensively.
4. Implement `conformance/shared/assertions.ts` with two helpers:
   - `async waitForFsAssertion(page, key, options = { timeout: 5000 })` — poll `page.evaluate` until an assertion with the given key appears in `window.__fsAssertions`, throw on timeout.
   - `async assertPayload(page, key, expected)` — fetch the assertion by key, assert `status`, `type`, `typeValue`, and (optionally) `errorContext`.
5. Implement `conformance/playwright.config.ts` with one `projects` entry per framework. Use `webServer` to auto-start each example/harness on a different port. Target Chromium only in v1; Firefox/WebKit can come later.
6. Add the conformance collector to `examples/todolist-tanstack`:
   - New file `src/faultsense-collector.ts` that registers the collector (guarded on `window`).
   - Side-effect import from `src/routes/__root.tsx` before the head scripts.
   - A URL param or env var (`VITE_FS_COLLECTOR=conformance`) switches the `data-collector-url` attribute between `panel` (default for demo) and `conformance` (for Playwright).
7. Implement `conformance/drivers/tanstack.spec.ts` with ONE smoke scenario — the "Add Todo Item" assertion (`todos/add-item` from `ASSERTIONS.md`). Driver navigates to `/todos`, fills the input, clicks Add, waits for `todos/add-item` in `__fsAssertions`, asserts status=`passed`, type=`added`.
8. Add `package.json` script `"conformance": "playwright test --config=conformance/playwright.config.ts"`. Also add `"conformance:install": "playwright install --with-deps chromium"`.
9. **Do not add conformance to `npm test`.** Layer 1 and Layer 2 run under separate scripts. CI runs both in parallel jobs.

**Files touched:**
- `package.json` (devDep + scripts)
- `conformance/` (new, full layout per tree above)
- `examples/todolist-tanstack/src/faultsense-collector.ts` (new)
- `examples/todolist-tanstack/src/routes/__root.tsx` (add import + env-var switch)
- `examples/todolist-tanstack/vite.config.ts` (if env var needs wiring)

**Acceptance criteria:**
- [ ] `npm run conformance` runs the tanstack smoke test in a real Chromium and passes.
- [ ] `@playwright/test` is pinned in `package.json`.
- [ ] `conformance/README.md` explains how to run the suite locally and how to add a new framework harness.
- [ ] `window.__fsAssertions` is populated after a single asserted click in the tanstack app, verified via `page.evaluate`.
- [ ] Default `npm test` runtime is unchanged.

**Risks:**
- **Playwright CI install time.** First-run install of Chromium + deps is ~2 min on GitHub Actions. Mitigation: cache `~/.cache/ms-playwright` between runs via a cache key derived from the Playwright version. Document in `conformance/README.md`.
- **Env-var switch on the existing tanstack app.** Flipping `data-collector-url` based on env var should not affect demo users. Default is `panel`; conformance mode is opt-in. A smoke test run against the demo URL must still show the panel.
- **Dev server port conflicts.** Each harness must use a distinct port. Configure in `playwright.config.ts` `webServer` entries, not in the harness app's own config.

**Implementation notes (added during execution):**
- **Collector signature was wrong in the first draft.** Custom collectors receive a single `ApiPayload` per call, not an array. The corrected sample and explanation live in Q3. Phases 4–5 collector wiring inherits the fix.
- **TanStack Start dev mode double-inits the agent.** In `vite dev` the root layout's `<Scripts />` path runs the agent bootstrap twice — once during initial document parse and once after Vite HMR connects. Both `init()` calls register their own listeners, and if a test click lands between the second init and its observer attaching, the click's payloads never reach the collector. Workaround applied in `conformance/drivers/tanstack.spec.ts`: `page.waitForTimeout(500)` in `beforeEach` after `page.goto` to let both init passes complete before the reset + interaction. Follow-up: run the tanstack harness in production build mode (`rails new`-equivalent: rebuild via `npm run build`, serve the static output) so there is no HMR re-init. Not in scope for this PR.
- **Vitest/Playwright collection collision.** Vitest's default scan picks up `conformance/drivers/*.spec.ts` and tries to run them as vitest tests, which throws at Playwright's `test.describe`. Fixed by adding `vitest.config.ts` at the repo root with `include: ["tests/**/*.{test,spec}.{js,ts}"]` so vitest only scans `tests/`. The stale `vitest` block in `package.json` was removed — it had never been read by vitest (no config file existed before).

### Phase 4: Vue 3 harness

**Goal:** minimal Vue 3 single-page app under `conformance/vue3/` that exercises the full 20-assertion catalog, plus a Playwright driver file at `conformance/drivers/vue3.spec.ts`.

**Tasks:**

1. Scaffold `conformance/vue3/` with Vite + Vue 3 (`create-vue` or manual). Minimal shape:
   ```
   conformance/vue3/
   ├── package.json           # vue, vite, own devDeps
   ├── index.html             # loads faultsense-agent.min.js + collector.js
   ├── vite.config.ts         # dev server on a dedicated port
   └── src/
       ├── main.ts            # Vue root
       └── App.vue            # ONE component rendering all 20 assertion scenarios
   ```
2. `App.vue` is a single `<template>` with sections mirroring `examples/todolist-tanstack/ASSERTIONS.md`: add-item, toggle-complete, remove-item, edit-item, cancel-edit, char-count, empty-state, count-updated, item-count-correct, count-stable-after-toggle, log-updated, guide-step-1/2/3, title-visible, login/logout, offline-banner-shown/hidden, gc-timeout-demo. Each scenario is the minimum markup needed for the `fs-*` attributes to fire.
3. Use Vue 3 conventions: `v-model` for inputs, `v-if` for conditional rendering, `v-for` for lists, `:class` bindings for classlist toggles. This exercises Vue's fine-grained reactivity and `nextTick` microtask batching — the reason Vue is in scope.
4. Link `dist/faultsense-agent.min.js` as a symlink from `conformance/vue3/public/` the same way the example apps do.
5. Load `conformance/shared/collector.js` before the agent script tag via a plain `<script src="./collector.js">` in `index.html`. Use `data-collector-url="conformance"` on the agent tag.
6. Add `conformance/vue3/` as a `webServer` in `conformance/playwright.config.ts` with its dev-server command and port.
7. Implement `conformance/drivers/vue3.spec.ts` — one test per assertion scenario from `ASSERTIONS.md`. Each test navigates to the harness page, triggers the action, waits for the expected assertion via `waitForFsAssertion`, and asserts payload shape. Reuse `conformance/shared/assertions.ts` helpers.

**Files touched:**
- `conformance/vue3/` (new, full app)
- `conformance/drivers/vue3.spec.ts` (new)
- `conformance/playwright.config.ts` (add project)

**Acceptance criteria:**
- [ ] `conformance/vue3/` is under 200 LoC total (excluding `package.json`, `vite.config.ts`, and `index.html`).
- [ ] `npm run conformance -- --project=vue3` runs the Vue 3 driver and all 20 scenarios pass.
- [ ] The harness exercises at minimum: `added` + conditional mutex (add-item), `updated` with classlist (toggle), `removed` (delete), `added` with focused modifier (edit), `removed` via keydown (cancel-edit), `text-matches` (char-count), `mount` trigger (empty-state), OOB + self-referencing selector (count-updated), OOB + count modifier (item-count-correct), `stable` (count-stable), `event:*` trigger (log-updated), `after` sequence (guide steps), `invariant` (title-visible), `route` (login/logout), `offline`/`online` triggers (network banner), GC sweep (gc-timeout).
- [ ] If any assertion fails, the failure message names the pattern class and links to the relevant `PAT-NN` entry (via comments in the test, not runtime).

**Risks:**
- **Vue `nextTick` batching breaks mutation-observer timing assumptions.** If a Vue update schedules two mutations that arrive as one MutationObserver callback, PAT-07 in Layer 1 should catch any regression. Mitigation: if Vue exposes a timing-related bug, follow the discovery → lock-in workflow — extract a new PAT-NN, lock it in, then fix.
- **`<Suspense>` fallback rendering.** Not used in the harness by default. If included, it exercises a pattern close to PAT-02 (delayed-commit). Out of scope for Phase 4; add as a new pattern if a bug surfaces.
- **Vue 3 + TypeScript friction.** Keep `App.vue` in plain JS with type assertions only where needed. The harness is not a TypeScript showcase; simplicity beats strict types.

### Phase 5: Hotwire harness (Rails-native)

**Goal:** minimal Rails + Turbo + Stimulus app under `conformance/hotwire/` that exercises Turbo frame/stream swaps and Stimulus controllers against a real Rails backend, plus a Playwright driver at `conformance/drivers/hotwire.spec.ts`.

**Why Rails and not Express:** see Q6 in Deferred-from-Brainstorm Decisions. Hotwire is language-coupled to Rails — every Turbo mutation shape observed in the wild is produced by a Rails helper (`turbo_stream.replace`, `turbo_frame_tag`, `refresh="morph"`). An Express + EJS hand-rolling of Turbo-shaped HTML would be testing what we _think_ Turbo produces, not what it actually produces.

**Tasks:**

1. Scaffold `conformance/hotwire/` as a minimal Rails app. Use the most aggressive `rails new` skip flags to keep the footprint small:
   ```bash
   rails new conformance/hotwire \
     --minimal \
     --skip-active-record \
     --skip-active-storage \
     --skip-action-mailer \
     --skip-action-mailbox \
     --skip-action-text \
     --skip-action-cable \
     --skip-jbuilder \
     --skip-test \
     --skip-system-test \
     --skip-javascript
   ```
   Then layer in Turbo and Stimulus via importmap (or CDN `<script>` tags — whichever is simpler for a harness of this size). In-memory state (`Rails.application.config.todos ||= []`) — no database. Target layout:
   ```
   conformance/hotwire/
   ├── Gemfile            # rails, importmap-rails, turbo-rails, stimulus-rails
   ├── config.ru
   ├── config/
   │   ├── application.rb # minimal Rails::Application
   │   ├── routes.rb      # resources :todos + session/auth stubs
   │   └── environments/development.rb
   ├── app/
   │   ├── controllers/todos_controller.rb  # CRUD via turbo_stream responses
   │   ├── views/todos/index.html.erb       # single page with all 20 assertion scenarios
   │   ├── views/todos/_item.html.erb       # the partial Turbo Stream renders
   │   └── javascript/controllers/          # Stimulus controllers (minimal)
   └── public/
       ├── collector.js             # symlink to conformance/shared/collector.js
       └── faultsense-agent.min.js  # symlink to dist/
   ```
2. Use Turbo Drive, Turbo Frames, and Turbo Streams intentionally across the 20 scenarios so the harness exercises distinct Turbo mutation shapes. Suggested split:
   - CRUD via `turbo_stream.append`, `turbo_stream.remove`, `turbo_stream.replace`
   - Sub-page navigation via `turbo_frame_tag` with lazy-load (`src:`)
   - Main navigation via Turbo Drive
   - Toggle assertion via Turbo 8 morph (`<%= turbo_frame_tag "item", refresh: "morph" %>`) — exercises PAT-04 against a real morphing implementation
3. One Stimulus controller for any interactive behavior not covered by Turbo. Minimize Stimulus usage — the harness is primarily about Turbo; Stimulus is a bonus.
4. Panel collector NOT used. Register the conformance collector in the layout's `<head>` via `<script src="<%= asset_path 'collector.js' %>">` before the agent script tag. Use `<%= content_tag :script, "", id: "fs-agent", src: "...", "data-collector-url": "conformance" %>`.
5. Add `conformance/hotwire/` as a `webServer` in `conformance/playwright.config.ts`. The `command` runs `bin/rails server -p 4568 -e development` (pick a port that does not collide with the Vite/Vue harnesses). `reuseExistingServer: !process.env.CI`.
6. Implement `conformance/drivers/hotwire.spec.ts` — one test per assertion scenario. Reuse `conformance/shared/assertions.ts`.

**Prerequisites (one-time, documented in `conformance/README.md`):**

- Ruby 3.x via `rbenv` / `asdf` / `mise` / system install.
- `bundle install` from `conformance/hotwire/`.
- Contributors who do not have Ruby installed can run Layer 1 plus the Node-only harnesses and skip `--project=hotwire` locally. CI installs Ruby via `ruby/setup-ruby`.

**Files touched:**
- `conformance/hotwire/` (new, full Rails app)
- `conformance/drivers/hotwire.spec.ts` (new)
- `conformance/playwright.config.ts` (add project)
- `conformance/README.md` (Rails prerequisite instructions)
- `.github/workflows/conformance.yml` (add `ruby/setup-ruby` step if the workflows directory exists — Phase 6 scope)

**Acceptance criteria:**
- [ ] `conformance/hotwire/` exists as a runnable Rails app that boots via `bin/rails server`.
- [ ] The harness is kept minimal — application code (controllers + views + Stimulus controllers, excluding generated Rails scaffolding) stays under 300 LoC.
- [ ] `npm run conformance -- --project=hotwire` runs all 20 scenarios successfully.
- [ ] Harness exercises at minimum: `turbo_stream.append`, `turbo_stream.remove`, `turbo_stream.replace`, `turbo_frame_tag` lazy-load + swap, Turbo Drive navigation for login/logout, Turbo 8 morph for toggle.
- [ ] Turbo 8 morph mutation shape is verified to match PAT-04 expectations — if not, lock in the discrepancy as a new PAT-NN in Layer 1 before shipping.

**Risks:**
- **Ruby toolchain friction on contributor machines.** Mitigated by documenting the skip path in `conformance/README.md` and by the fact that CI does install Ruby. Docker wrapper is a follow-up if friction becomes real.
- **Rails boot time.** `rails server` cold-start is 2–4s on an already-configured machine, longer on first run. Playwright's `webServer` config uses `reuseExistingServer: !CI` so local iteration reuses the server across runs.
- **Turbo Drive full-page swaps destroy observer state.** The agent's `handlePageUnload` fires on real navigations. Harness must use Turbo Drive for intra-app navigation only and never trigger a hard reload between assertions. If one scenario requires a reload, isolate it in its own Playwright test.
- **Turbo Stream WebSocket mode.** Not used — we skipped Action Cable in the scaffold flags. Harness uses the fetch-response Turbo Stream mode only.
- **Stimulus lifecycle edge cases.** Stimulus controllers connect/disconnect on DOM changes. If a controller's `connect()` fires a mutation before the trigger event bubbles, it may race with assertion creation. Mitigation: keep Stimulus usage minimal; if a race surfaces, lock it in as a new PAT-NN.

### Phase 6: Documentation and works-with matrix

**Goal:** generate the live works-with matrix, update README and CLAUDE.md to reference the strategy, and fix the stale `gcInterval` documentation.

**Tasks:**

1. Implement `conformance/scripts/generate-matrix.js` that:
   - Reads the Playwright JSON reporter output from `conformance/test-results/`
   - Parses per-project results
   - Generates a Markdown grid at `docs/works-with.md` with rows = framework and columns = PAT-NN pattern IDs (pulled from `docs/mutation-patterns.md`)
   - Each cell is one of: ✓ (pass), ✗ (fail), ○ (n/a — pattern not exercised by this framework's harness), or a link to the failing test
2. Configure Playwright to emit JSON reporter alongside the default HTML reporter: `reporter: [['html'], ['json', { outputFile: 'conformance/test-results/results.json' }]]`.
3. Add `"conformance:matrix": "npm run conformance && node conformance/scripts/generate-matrix.js"` to `package.json`.
4. Add a "Works with" section to the root `README.md` with a compact excerpt of the matrix (links to the full `docs/works-with.md`). Commit the current snapshot.
5. Update `CLAUDE.md`:
   - Fix line 70: "GC sweep (`config.gcInterval`, default 30s)" → "default 5s". This is stale since PR #20.
   - Add a new "Conformance strategy" section (after the "Timeout Model" section) summarizing the two-layer strategy in ~15 lines, linking `docs/mutation-patterns.md` and `conformance/README.md`.
   - Add a "When you add a new framework" paragraph explaining the discovery → lock-in workflow.
6. Update `docs/mutation-patterns.md` PAT-NN entries with final file pointers.
7. Add a CI job to `.github/workflows/` (if workflows directory exists) that runs `npm run conformance` on PR. If no workflows directory exists, note this as a follow-up and skip.

**Files touched:**
- `conformance/scripts/generate-matrix.js` (new)
- `conformance/playwright.config.ts` (add JSON reporter)
- `conformance/README.md` (update run instructions)
- `package.json` (add `conformance:matrix` script)
- `README.md` (add "Works with" section)
- `CLAUDE.md` (fix gcInterval, add conformance section)
- `docs/mutation-patterns.md` (fill in file pointers)
- `docs/works-with.md` (new, generated then committed)
- `.github/workflows/conformance.yml` (new if `.github/workflows` exists)

**Acceptance criteria:**
- [ ] `npm run conformance:matrix` generates `docs/works-with.md` from test output.
- [ ] Matrix shows ✓/✗/○ cells for every `framework × PAT-NN` combination.
- [ ] README links to the matrix.
- [ ] CLAUDE.md `gcInterval` line reads `default 5s`, not `default 30s`.
- [ ] CLAUDE.md has a new "Conformance strategy" section that is ≤20 lines and references both docs.
- [ ] CI job runs on PR if `.github/workflows/` exists.

**Risks:**
- **Matrix drift if tests are skipped or renamed.** The generator reads test titles and must map them to PAT-NN IDs. Convention: each Playwright test title starts with the assertion scenario name from `ASSERTIONS.md`; the mapping to PAT-NN lives in `docs/mutation-patterns.md`. If a PAT is renamed, both the catalog and the test naming convention must update together.
- **CI flakes on Playwright.** Mitigation: retry failing Playwright tests up to 2x in CI (standard Playwright config), and alert if retry counts spike.

## System-Wide Impact

### Interaction graph

A Layer 1 pattern test triggers the following chain:

```
Test setup:
  setupAgent() → vi.useFakeTimers() → mocks Date.now, isVisible
  → spyOn(resolveModule.sendToCollector) → init(config)
  → src/index.ts:67-76 attaches MutationObserver to document.body

Test body:
  1. Test sets document.body.innerHTML with fs-* attributes on a trigger element
     → mutation fires → manager.handleMutations
     → src/assertions/manager.ts:249-283: first pass creates mount/invariant assertions
     → second pass resolves pending assertions (none yet)
  2. Test dispatches a DOM event (click, change, etc.) on the trigger element
     → src/processors/events.ts walks closest() to find fs-trigger host
     → manager creates an assertion
     → microtask: manager.checkImmediateResolved runs for eligible types
     → excluded types (added, removed, stable, updated, loaded) skip immediate path
  3. Test's event listener mutates the DOM
     → MutationObserver batches mutations into one callback
     → manager.handleMutations processes the batch
     → processors/mutations.ts fans records into addedElements/removedElements/updatedElements
     → resolvers/dom.ts:elementResolver iterates pending assertions
     → handleAssertion:
        - if wait-for-pass and no element satisfies → return null → stays pending
        - if a matching element satisfies all modifiers → return completeAssertion(true)
        - if invariant/stable and negative → return completeAssertion(false)
     → manager.settle() on completed assertions
     → settle() calls dismissSiblings on conditional winners
     → non-dismissed assertions flow to sendToCollector
     → spy captures the call

Test assertion:
  await vi.waitFor(() => expect(sendToCollectorSpy).toHaveBeenCalledWith(...))
```

A Layer 2 test adds an HTTP layer and a real browser:

```
Playwright launches Chromium → loads harness URL
  → harness page loads faultsense-panel-replacement (conformance collector) via <script>
  → harness page loads faultsense-agent.min.js via <script id="fs-agent" data-collector-url="conformance">
  → agent auto-init resolves collector by name → window.Faultsense.collectors.conformance
  → agent attaches MutationObserver to document.body
Driver triggers scenario (page.click, page.fill, etc.)
  → browser dispatches real DOM events → agent processes → same chain as above
  → agent calls window.Faultsense.collectors.conformance(assertions, config)
  → collector pushes structured-cloned assertions into window.__fsAssertions
Driver asserts via page.evaluate(() => window.__fsAssertions)
```

### Error and failure propagation

- **Layer 1 test failures** fail vitest — caught by `npm test`. No separate error channel. Failing mutation patterns surface as test failures with the pattern ID in the test title.
- **Layer 2 test failures** fail Playwright — caught by `npm run conformance`. Artifacts: Playwright HTML report + JSON (consumed by the matrix generator) + screenshot + trace on failure (default Playwright config).
- **Discovery path (new bug surfaced by Layer 2):** workflow documented in CLAUDE.md. Extract pattern → add Layer 1 test → test fails → fix agent → test passes → Layer 2 passes. Both layers green = the pattern is locked in forever.
- **Agent error propagation:** unchanged by this plan. `errorContext` tagging, GC sweep, unload grace period all still work. Layer 1 tests that rely on GC-delivered failures call `advanceToGC()` to drive the fake timer past `gcInterval`. Layer 2 tests rely on real-time elapse with default Playwright timeouts (5s) covering the 5s GC interval naturally.

### State lifecycle risks

- **Pre-existing target observer attachment.** Phase 2 PAT-01 must init the agent AFTER the DOM is seeded, or the observer's initial attach will surface pre-existing nodes as additions. The Phase 1 helper MUST NOT auto-init in a way that prevents this — `setupAgent` takes an optional `deferInit: true` flag, and PAT-01 uses it.
- **Fake timer + real microtask interleaving.** Vitest fake timers do not stub `queueMicrotask`. This is correct — the agent relies on microtasks for `checkImmediateResolved`. Tests that need to wait for microtasks use `await Promise.resolve()` or `await vi.waitFor(...)`.
- **MutationObserver callback batching.** `MutationObserver` groups synchronous mutations into one callback. Tests that check "multiple records in one batch" (PAT-07) must mutate synchronously. Tests that check "batch boundaries" must `await Promise.resolve()` between mutations.
- **Layer 2 collector state leakage between tests.** `window.__fsAssertions` is per-page. Playwright's default test isolation creates a new page context per test, so the array is empty on start. `beforeEach` in `conformance/drivers/*.spec.ts` should assert `window.__fsAssertions.length === 0` defensively.

### API surface parity

- **Developer-facing API:** unchanged. No new `fs-*` attributes, no new config options, no agent runtime changes.
- **Test API:** the Phase 1 helper is new. It is an internal test helper, not a public API. Changes to it are not breaking.
- **Custom collector mechanism:** unchanged. The conformance collector uses the existing extension point at `src/index.ts:151-161`. If future work changes that mechanism, `conformance/shared/collector.js` must update.

### Integration test scenarios

Five cross-layer scenarios that unit-only testing would not catch:

1. **Tanstack reuse drives the existing app in a real browser with the conformance collector instead of the panel.** Verifies the custom collector extension point works under real agent init, not just unit-test injection.
2. **Vue 3 `nextTick` batching produces a single `MutationObserver` callback with multiple records.** Verifies `handleMutations` + `elementResolver` iterate the records in order and resolve all affected assertions. PAT-07 covers this synthetically; the Vue 3 driver covers it empirically.
3. **Turbo Stream replaces a DOM fragment while a previously-created assertion is pending.** Verifies the assertion either resolves on the new fragment or times out — no phantom pass from the replaced element.
4. **Conformance collector receives a dismissed-sibling conditional payload.** Verifies `getAssertionsToSettle` filters dismissed siblings before send, and the in-page collector records only the winner. This is a direct regression lock for `b9b0fac`'s reverse direction.
5. **Pattern test PAT-10 fails in expected direction.** `it.fails` verifies the current shadow DOM gap. If someone ships a change that accidentally enables shadow traversal, this test flips green and alerts that PAT-10's expected behavior needs to update.

## Acceptance Criteria

### Functional

- [ ] Layer 1: 10 tests under `tests/conformance/pat-NN-*.test.ts`, all passing (PAT-10 via `it.fails`).
- [ ] Layer 1: Phase 1 helper migrated across 3 canonical existing tests.
- [ ] Layer 2: `conformance/` directory exists with shared collector, Playwright config, and four drivers (tanstack, htmx, vue3, hotwire).
- [ ] Layer 2: `npm run conformance` passes all drivers in Chromium.
- [ ] Layer 2: Vue 3 harness ≤200 LoC. Hotwire harness application code ≤300 LoC (Rails scaffolding excluded).
- [ ] Matrix: `docs/works-with.md` generated from real test output and committed.
- [ ] Docs: `docs/mutation-patterns.md` seeded with 10 pattern entries, all file pointers filled.
- [ ] Docs: CLAUDE.md `gcInterval` reference fixed and conformance section added.

### Quality gates

- [ ] Existing `npm test` runtime increases by less than 2s vs. `main` baseline.
- [ ] Existing `npm test` passes with zero new failures.
- [ ] Bundle size (`npm run build:size`) unchanged — no agent source code changes in this plan.
- [ ] README bundle-size references still accurate (per the user's `feedback_bundle_size_docs.md` preference — re-verify; no agent change so should be unchanged).
- [ ] `npm run conformance` runs in under 90s total on a local machine (rough target; adjust after first run).

### Non-functional

- [ ] The discovery → lock-in workflow is documented in CLAUDE.md in ≤15 lines and understandable to a future developer onboarding the repo.
- [ ] Adding a new framework harness after this plan ships requires: create one harness directory with a single page, add a `webServer` entry to `playwright.config.ts`, write one driver spec file. No Layer 1 changes unless the framework exposes a new pattern. Documented in `conformance/README.md`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Playwright CI flakiness under real-browser load | Medium. False reds block PRs. | Use Playwright's built-in 2x retry for failing tests in CI, not locally. Alert if retry count exceeds 5% of runs. |
| Layer 2 adds significant CI minutes | Medium. Slows PR feedback. | Parallelize drivers as Playwright projects; cache `~/.cache/ms-playwright` across runs. Target <90s total wall time. |
| Pattern catalog grows faster than the agent can keep up with | Low-medium. Gaps accumulate. | `docs/mutation-patterns.md` marks each entry as `supported` or `gap`. Gap entries use `it.fails` so they surface if behavior accidentally changes. Gaps become explicit backlog items. |
| Reusing existing example apps couples them to Playwright timing assumptions | Medium. Makes the examples harder to modify. | Keep all Playwright-specific code in `conformance/drivers/`, not in the example apps themselves. The only change in `examples/` is a collector registration and an env-var switch — nothing that affects the demo UX. |
| Shadow DOM gap (PAT-10) is not solved by this plan | Accepted as known limitation. | Documented explicitly in `docs/mutation-patterns.md` and marked `gap`. Separate future plan handles shadow DOM support; this plan just ensures the gap is visible. |
| Vitest mock aliasing corrupts Layer 1 assertion snapshots | Low. Already documented. | Phase 1 helper captures spy arguments via `JSON.parse(JSON.stringify(arg))` before returning. Layer 2 in-page collector does the same. |
| Hotwire harness exposes a class of bug that requires agent changes | Low-medium. Scope creep. | Follow the discovery → lock-in workflow: extract the pattern as a new PAT, lock it in Layer 1, then fix the agent in a follow-up PR. Do not inline agent fixes into the harness phase. |
| Ruby toolchain required for the Hotwire harness | Medium. Contributors without Ruby cannot run `--project=hotwire` locally. | Document the skip path in `conformance/README.md` — Layer 1 and the Node-only harnesses are fully runnable without Ruby. CI installs Ruby via `ruby/setup-ruby`. Docker wrapper is a follow-up if friction persists. Same policy applies to future Livewire (PHP) and LiveView (Elixir) harnesses. |
| "Works-with" matrix drifts from reality between CI runs | Low. Misleading claims. | Matrix is generated fresh from `npm run conformance` output. README snapshot is updated via script, not hand-edited. CI can be extended to fail if the committed matrix does not match the current run. |

## Sources and References

### Origin

- **Origin document:** [`docs/brainstorms/2026-04-10-cross-stack-conformance-requirements.md`](../brainstorms/2026-04-10-cross-stack-conformance-requirements.md) — key decisions carried forward: (1) two-layer strategy with discovery → lock-in loop, (2) ten seeded pattern classes PAT-01 through PAT-10, (3) Vue 3 + Hotwire as the framework coverage targets (not Svelte/Solid/Lit/Livewire in the first round), (4) `conformance/` directory separate from `examples/`, (5) existing tanstack and htmx apps reused as Layer 2 harnesses.

### Internal references (file:line)

- Manager pipeline: `src/assertions/manager.ts:249-283`
- `checkImmediateResolved` (the `b9b0fac` fix site): `src/assertions/manager.ts:56-104`
- Wait-for-pass `handleAssertion` contract: `src/resolvers/dom.ts:158-219`
- Mutation → element fanout: `src/processors/mutations.ts:7-53`
- MutationObserver attachment: `src/index.ts:67-76`
- Custom-collector extension point: `src/index.ts:151-161`
- Conditional mutex parser / sibling logic: `src/processors/elements.ts:129-152`, `src/assertions/assertion.ts:75-132`
- `gcInterval` default: `src/config.ts:4` (value `5000`)
- Canonical unit-test pattern: `tests/assertions/added.test.ts`, `tests/assertions/conditionals/resolution.test.ts:50-100`, `tests/assertions/outer-swap-toggle.test.ts`
- Example app Faultsense loaders: `examples/todolist-tanstack/src/routes/__root.tsx:15-29`, `examples/todolist-htmx/views/layout.ejs:13-34`
- Assertion catalog used as Layer 2 coverage target: `examples/todolist-tanstack/ASSERTIONS.md`
- Existing unused helper to revive: `tests/helpers/assertions.ts`
- CLAUDE.md gcInterval drift: `CLAUDE.md:70`

### Related work

- Commit `b9b0fac` — pre-existing target false-pass fix. Precedes and motivates PAT-01.
- PR #20 (`301a807`) — HTMX example port + wait-for-pass semantics adoption + `gcInterval` 30s → 5s + click delegation + `outer-swap-toggle` regression test. Precedes and motivates PAT-02 and PAT-03.
- `docs/plans/2026-04-10-001-feat-htmx-todolist-example-port-plan.md` — the immediately-preceding plan; retro section covers the three audit misreads and explains why agent behavior under `hx-boost` is correct as-is.
- `docs/solutions/logic-errors/assertion-pipeline-extension-ui-conditional-and-invariant-triggers.md` — Vitest mock aliasing trap; motivates the Phase 1 structured-clone guard.
- `docs/solutions/logic-errors/gc-timeout-refactor-and-instrumentation-patterns.md` — timeout model and instrumentation gotchas; motivates `advanceToGC()` helper.
- `docs/ideation/2026-03-27-e2e-gap-analysis-v2-ideation.md` — 30-recipe Playwright-vs-Faultsense comparison; reference source when deciding which assertion scenarios the Layer 2 harnesses must cover.

### External references

- None used in plan drafting. Playwright docs and `@playwright/test` setup details will be referenced during Phase 3 implementation — noted but not front-loaded.

### Process notes

- SpecFlow Analyzer was deliberately skipped. This is test infrastructure work, not a user-facing flow. SpecFlow's user-flow completeness lens has low leverage here; the brainstorm + repo research identified the critical semantic gaps (Vitest mock aliasing, shadow DOM gap, pre-existing target, wait-for-pass, `gcInterval` drift) and edge cases during research.
- Plan drafted against a fresh read of the HTMX PR (#20) diff to verify the scope of the wait-for-pass refactor and the `gcInterval` default change. Both confirmed via `git show 301a807 -- src/resolvers/dom.ts` and `src/config.ts:4`. This corrects a potential miscalibration in the origin brainstorm, which framed the HTMX transient-mutation issue as purely discovery — it was actually a discovery *plus* a load-bearing agent refactor. PAT-02 is therefore a regression lock on new architecture, not a replay of an unfixed bug.
