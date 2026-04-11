---
title: Cross-stack conformance — follow-ups backlog
type: followups
status: backlog
date: 2026-04-11
parent: docs/plans/2026-04-10-002-feat-cross-stack-conformance-plan.md
---

# Cross-stack conformance — follow-ups

Self-contained backlog of things discovered or deferred during Phases 1–6 of the cross-stack conformance plan. The parent plan is complete and its branch (`feat/cross-stack-conformance-layer-1`) is ready to push. Items here can be picked up individually in future sessions without re-reading the full plan.

**How to use this doc:**
- Each item is self-contained: what, why, where, how, effort.
- Items are grouped by category. Within each category, higher priority is at the top.
- If an item grows into a multi-step effort, extract it to its own plan doc and link back.
- When you complete an item, strike it through (or delete) and add any new follow-ups it surfaced.

**Context carryover:**
- Branch: `feat/cross-stack-conformance-layer-1` — 12 commits ahead of `main`, all quality gates green (`354 unit + 34 conformance`). Not yet pushed.
- Works-with matrix: `docs/works-with.md` (generated, committed snapshot)
- Framework integration notes: `docs/framework-integration-notes.md` (scratch pad, seeded from Phases 3–5)
- Plan doc (now `status: completed`): `docs/plans/2026-04-10-002-feat-cross-stack-conformance-plan.md`

---

## 1 · Ship blockers for this branch

### ~~1.1 Push `feat/cross-stack-conformance-layer-1` and open a PR~~

**✓ Done 2026-04-11.** Merged as [#21](../../pull/21) (commit `dc51cc6`).

### 1.2 Wire up CI

- **Why.** `npm run conformance` currently runs only on developer machines. The whole point of the works-with matrix is continuous verification — without CI, the matrix can drift silently. The drift-guard step (`git diff --exit-code docs/works-with.md`) in the suggested workflow is the single most important piece.
- **Where.** The YAML is already written and documented in `conformance/README.md` under "Suggested CI workflow". The repo has no `.github/workflows/` directory yet, which is why I didn't commit the file.
- **How.** Create `.github/workflows/conformance.yml` with the YAML from the README. Four moving parts to verify: Node cache, Playwright browser cache, Ruby setup for hotwire, and the drift-guard final step.
- **Effort.** ~15 min to create + first green CI run. Docker availability in GitHub Actions is default; no extra config needed for the hotwire harness.
- **Gotcha.** First CI run will pay the Playwright-browser install cost (~90 MB) and the hotwire `docker build` cost (~2 min). Subsequent runs cache both.

### ~~1.3 Verify bundle size claim in README after the `stripOuterQuotes` fix~~

**✓ Done 2026-04-11 (batch 1).** Bundle was 8.6 KB gzipped at branch start; grew to 8.7 KB in the same batch after §3.3 landed. README updated in commit `86c88a5`.

---

## 2 · Next-up Layer 2 coverage

These are the framework harnesses and mutation patterns that Phase 6 called out as gaps in the works-with matrix. Each one is a self-contained follow-up.

### 2.1 PAT-04 morphdom empirical coverage — Turbo 8 morph scenario in the Hotwire harness

- **Why.** PAT-04 (morphdom preserved-identity) is locked in at Layer 1 via `tests/conformance/pat-04-morphdom-preserved-identity.test.ts`, but no Layer 2 harness currently exercises morphdom mutations against a real renderer. The works-with matrix shows `○` for all four frameworks on PAT-04. Hotwire is the natural place — Turbo 8 has built-in morph support via `turbo_stream.replace method: :morph` or `<turbo-frame refresh="morph">`.
- **Where.**
  - `conformance/hotwire/app/views/todos/index.ejs` — add a new scenario section.
  - `conformance/hotwire/app/controllers/todos_controller.rb` — add a controller action that returns `turbo_stream.replace target, method: :morph, partial: ...`.
  - `conformance/drivers/hotwire.spec.ts` — add the corresponding driver test.
  - `conformance/scripts/generate-matrix.js` — update `SCENARIO_TO_PAT` to map the new scenario to `PAT-04`.
- **How.** The scenario should exercise a case where identity preservation matters: e.g., a text counter inside a `<turbo-frame>` that increments via morph. The new element should have the SAME DOM identity as the old one (verifiable via `Object.is` on the node reference before/after) but with updated text content. PAT-04's matcher looks for `attributes` or `characterData` MutationRecords targeting the SAME node.
- **Effort.** ~45 min. Biggest unknowns: Turbo 8 morph API docs, whether `method: :morph` is on the `turbo_stream` helper or elsewhere, and whether morphdom's mutation records match what PAT-04 expects (if not, that's a new Layer 1 PAT-NN, not a bug).
- **Reference.** Turbo 8 morph docs: https://turbo.hotwired.dev/reference/attributes#turbo-frame-attributes

### ~~2.2 PAT-09 hydration empirical coverage — SSR harness~~

**✓ Done 2026-04-11 (batch 2).** Landed option (b) equivalent: `conformance/astro/` — Astro 6 static output with a React 19 island hydrated under `client:load`. 11 scenarios (full SPA set + `hydration/island-mount`), all passing. The new scenario asserts a mount trigger on an SSR-rendered marker inside the hydrating island fires exactly once across hydration; the count check catches any future agent regression that would double-fire or drop the payload. Framework notes captured under "Astro 6" in `docs/framework-integration-notes.md` (`is:inline` script tags, single-fire guarantee on hydration, `settleMs: 500`). Works-with matrix now shows PAT-09 empirically covered (✓ astro, ○ everywhere else).

<details>
<summary>Original entry</summary>

- **Why.** PAT-09 (hydration upgrade) is locked in at Layer 1 via `tests/conformance/pat-09-hydration-upgrade.test.ts`, but no Layer 2 harness is server-rendered. The tanstack example (which IS SSR) was decoupled from conformance in commit `d1ca1fb`; the current `conformance/react/` is CSR-only.
- **Options.**
  - (a) **Add a minimal `conformance/tanstack-start/` harness.** Full TanStack Start with SSR, reduced to ~3 scenarios: title invariant, add-item (SSR-rendered empty state → hydrated list), and a mount-trigger on an SSR-rendered element that should NOT re-fire during hydration. Pairs with PAT-09's assertion.
  - (b) **Add a minimal `conformance/astro/` harness.** Astro's islands model exercises PAT-09 more interestingly than TanStack Start — most of the page is static, a few islands hydrate. Good target for "mount fires once on hydration, invariants watch the hydrated DOM correctly."
  - (c) **Add a minimal `conformance/next/` harness.** Next.js App Router. Most popular SSR framework. Bigger setup, more moving parts.
- **Recommendation.** Start with (a) tanstack-start since the plumbing (React 19 + Vite + the tanstack example) is already familiar from Phase 3. Astro is a good second harness once the pattern is proven.
- **Known quirk to test for.** The original Phase 3 tanstack harness hit a dev-mode agent double-init (see `docs/framework-integration-notes.md` under "TanStack Start"). A new SSR harness will likely hit the same issue and need the 500 ms settle wait in `beforeEach`. The root-cause fix is in §3.1 below.
- **Effort.** (a) ~90 min, (b) ~2 hours (Astro is less familiar), (c) ~3 hours.

</details>

### 2.3 PAT-10 shadow-DOM traversal — agent feature, not just a harness

- **Why.** PAT-10 is the one PAT marked as an active gap in the agent. `tests/conformance/pat-10-shadow-dom-traversal.test.ts` uses `it.fails` so the current behavior is the green state. Fixing PAT-10 requires actual agent work: the `MutationObserver` at `src/index.ts:71-76` doesn't traverse shadow roots (`subtree: true` doesn't cross shadow boundaries), and the document-level `querySelector` paths in `src/resolvers/dom.ts` don't call `composedPath()`.
- **Scope.** This is a FEATURE plan, not a harness addition. Needs its own brainstorm + plan doc.
- **Hook points the plan will need to cover.**
  - Detect shadow roots at init time (`document.body.querySelectorAll("*")` + filter for `shadowRoot`) and attach a child observer to each.
  - Detect new shadow roots as they appear via the main observer (scan `addedNodes` for `attachShadow`-backed elements).
  - Walk `getRootNode()` / `composedPath()` in the immediate resolver and document resolver paths.
  - Handle `closed` shadow roots — the agent can't see them, and that should be documented as a known limitation.
  - Test harness: `conformance/lit/` would be the natural Layer 2 driver since Lit uses shadow DOM by default.
- **Flipping the Layer 1 test.** Once the feature ships, remove `it.fails` from `tests/conformance/pat-10-shadow-dom-traversal.test.ts:49` and adjust the assertion to expect a passing result. One-line change.
- **Effort.** Probably 1–2 days of focused work + a brainstorm. Not a small item.
- **Priority.** Medium. Lit is a real framework people use; ignoring shadow DOM means ignoring web components entirely. But no one has reported the gap yet — the catalog entry is the only visible artifact.

### 2.4 Additional framework harnesses

Listed roughly in order of pattern-diversity value, not popularity:

- ~~**Svelte 5**~~ — **✓ shipped (PR #22, 2026-04-11).** runes-based fine-grained reactivity.
- ~~**Solid**~~ — **✓ shipped 2026-04-11 (batch 2).** VDOM-free fine-grained reactivity, 10/10 scenarios passing. Captured a framework note: `<For>` requires `createStore` (or equivalent in-place mutation) for `fs-assert-updated` to hold — a `.map()` that replaces items with new object references re-mounts the row and breaks element identity.
- **Lit** — depends on §2.3 landing first. Web components + shadow DOM. ~1–2 hours once the agent supports shadow.
- **Livewire** (Laravel + PHP) — follows the Hotwire pattern from Q6 (natural backend required). Uses morphdom for DOM patching, so this ALSO contributes to PAT-04 empirical coverage. Bigger setup: needs PHP + composer toolchain in CI. ~4 hours.
- **Phoenix LiveView** (Elixir) — same Q6 category. Uses morphdom. `ruby/setup-ruby`-equivalent is `erlef/setup-beam`. ~4 hours.
- ~~**Alpine.js**~~ — **✓ shipped 2026-04-11 (batch 2).** Directive-based reactivity, 10/10 scenarios passing. Captured a framework note: attribute bindings that interpolate loop variables (e.g. `fs-assert-updated` inside `x-for`) must use Alpine's `:attr` shorthand so the expression evaluates at render time instead of as a literal.
- **Angular 19** — bigger framework, distinct change detection, zones. Useful for "does Faultsense work with X" marketing but low pattern-diversity value. ~2 hours.

After each harness, re-run `npm run conformance:matrix` and commit the updated `docs/works-with.md`.

### 2.5 Conformance scenario parity — backfill missing scenarios across existing harnesses

- **Why.** React and Vue 3 have 10 scenarios each. Hotwire and HTMX have 7. The four missing scenarios (`todos/edit-item`, `actions/log-updated`, `guide/advance-after-add`, and one more) aren't naturally covered by Hotwire/HTMX's minimal shape. Adding them would make the matrix rows perfectly aligned.
- **Trade-off.** Forcing scenarios into frameworks they don't naturally express is fake coverage. Better to leave `○` cells honest than pad the matrix.
- **Recommendation.** Don't pad. Instead, when you DO add an Alpine or Svelte harness, aim for the full 10-scenario set.

---

## 3 · Agent quality improvements surfaced by Layer 2

Items here are behaviors the agent COULD improve, surfaced by Phase 3–5 implementation friction. None of them are blocking bugs (all correct today), but each would make real-framework integration smoother.

### ~~3.1 Agent cleanup on re-init (TanStack Start dev-mode double-init)~~

**✓ Done 2026-04-11 (batch 1).** DOMContentLoaded handler now calls `window.Faultsense!.cleanup?.()` before re-initializing. Regression locked in by `tests/index.test.ts` which dispatches DOMContentLoaded twice and asserts the first cleanup is invoked before it is overwritten. Commit `86c88a5`.

### 3.2 Audit other modifier-value sites for quote handling

- **Why.** Commit `e3550f9` fixed `parseTypeValue` to strip outer quotes from modifier values (discovered via Vue 3 template literals). That fix covers `fs-assert-*` attributes. But the same CSS-selector-style quoting might appear in OTHER places:
  - `text-matches` regex values — `text-matches='\\d+'` — unlikely to be quoted but worth spot-checking.
  - `value-matches` regex values — same.
  - Custom-event detail-matches — `fs-assert-emitted="event[detail-matches=foo]"` via `src/utils/triggers/custom-events.ts` — has its own parser, may or may not strip quotes.
- **How.** Audit `src/utils/triggers/custom-events.ts` and any other code paths that read modifier values. Add regression tests wherever the quoted form is plausible.
- **Effort.** ~30 min audit + ~15 min per regression test.
- **Priority.** Low unless someone hits it.

### ~~3.3 Agent warning for silent no-match modifier failures~~

**✓ Done 2026-04-11 (batch 1).** `handleAssertion` in `src/resolvers/dom.ts` emits a `console.warn` naming the assertion key, type, typeValue, and match count when matching elements fail every modifier. Gated via a module-level logger set by `init()` and cleared in the cleanup closure — no threading through the `ElementResolver` type. Two-case coverage in `tests/resolvers/dom-debug-warning.test.ts` (debug=true emits, debug=false silent). Commit `86c88a5`.

### 3.4 `added` type re-check on subsequent attribute mutations

- **Why.** The HTMX investigation (see commit `51eeecb` commit message for the full trace) revealed that when an `added` assertion's modifier check fails on the initial insertion batch, and then a SUBSEQUENT attribute mutation on the same element would make the check pass, the `added` type never re-evaluates. The workaround is documented: use `updated` + ID selector instead. But some users will naturally reach for `added` first.
- **Options.**
  - (a) **Don't fix** — the documented pattern is the right answer, and re-adding the element to `addedElements` on attribute mutations would violate semantics ("added by this trigger" becomes "maybe added plus some stuff happened").
  - (b) **Track "recently added" elements** in a short-lived cache and re-check them on subsequent mutation batches. Bounded by some TTL or by a mutation-batch count.
  - (c) **Change `added` to fall back to `updatedElements` for elements that were in a recent `addedElements` batch.**
- **Recommendation.** (a). The `updated`+ID pattern is the better idiom anyway because it handles ID-keyed server-rendered responses cleanly. Documentation in `docs/framework-integration-notes.md` is sufficient.
- **Priority.** Zero. Only listed for completeness.

### 3.5 React controlled-input change-event timing — documentation only

- **Why.** React 19's controlled checkboxes process state updates synchronously enough during the native event dispatch that the agent's document-level capture listener reads the POST-update attribute value, not the pre-update one. This breaks the expected-next-state idiom for `fs-trigger="change"`. The workaround: use `fs-trigger="click"` on React controlled checkboxes.
- **Where.** Already documented in `docs/framework-integration-notes.md` under "React 19 (Vite + hooks + StrictMode)".
- **Agent fix.** None possible — this is React's behavior, not the agent's. The agent's capture listener fires at the correct time; React just dispatches events in an unusual order for controlled inputs.
- **Follow-up.** If we ever add a React-specific section to the public docs site, this goes at the top of "common gotchas." Also worth monitoring whether React 20 changes this (unlikely).

---

## 4 · Documentation evolution

### 4.1 Promote `docs/framework-integration-notes.md` sections to standalone guides

- **Why.** The doc is explicitly a scratch pad (see its top-of-file disclaimer). Sections are expected to graduate to `docs/frameworks/<name>.md` (or move to the `.org` docs site) once they accumulate enough entries to be useful on their own.
- **Current inventory.** React 19 section has 4 entries. Vue 3 has 5. Hotwire has 6. HTMX has 4. TanStack Start has 2 (marked "out of scope for conformance" — consider moving to a "gotchas" appendix).
- **Promotion criterion.** A section is ready to promote when it has ~10 entries AND covers all the core mutation patterns (add/remove/update, mount/invariant, OOB, conditional mutex). None of the current sections meet this bar yet.
- **Effort when ready.** ~30 min per framework to extract + reformat + cross-link.
- **Priority.** Hold until after 2–3 more harnesses add entries.

### 4.2 Publish the works-with matrix to the docs site

- **Why.** `docs/works-with.md` lives in this repo and only renders as raw Markdown. The `.org` docs site (see `reference_repos.md` memory) could pull it via fetch/iframe or via a scheduled sync.
- **Where.** `.org` repo, not this one. Cross-repo coordination required.
- **Options.** (a) fetch + render client-side, (b) GitHub Action that copies the file to the docs repo on every main-branch update, (c) publish as a proper API endpoint from a collector backend (but there's no collector backend yet).
- **Priority.** Low. The matrix is discoverable from the README for now.

### 4.3 Archive the completed plan doc

- **Why.** `docs/plans/2026-04-10-002-feat-cross-stack-conformance-plan.md` is marked `status: completed`. Future plans can reference it but it's done.
- **Options.** (a) leave in place with `status: completed` (current), (b) move to `docs/plans/archive/`, (c) leave as reference material.
- **Recommendation.** (a). Status field is the canonical signal; no need to move files.

---

## 5 · Bigger strategic questions

These are design decisions that don't block anything but are worth thinking about before the conformance surface grows much larger.

### ~~5.1 Should Layer 2 drivers share scenario definitions?~~

**✓ Done 2026-04-11 (batch 2).** Shipped option (a) — `conformance/shared/scenarios.js` is the canonical registry (scenario keys, titles, PAT ids) and both the Node matrix generator and the TypeScript drivers import it. A sidecar `conformance/shared/scenarios.d.ts` gives typed access without forcing a build step. Each driver now declares a `HarnessConfig` and passes it to shared `runners` from `conformance/shared/runners.ts`; framework-specific variance (Hotwire's `.toggle-btn` vs React's checkbox, HTMX's `"updated"` toggle type vs Hotwire's `"added"`, per-harness `settleMs`) lives in the config. Drift guard: the matrix generator fails loudly if Playwright results reference a scenario key that isn't in the registry, and warns on stranded registry entries no driver runs. Drivers shrank from ~180 lines each to ~60. Adding a framework now requires writing the harness app + a ~60-line driver instead of re-implementing 10 test bodies.

<details>
<summary>Original entry</summary>

- **Current state.** Each driver under `conformance/drivers/*.spec.ts` hand-writes ~10 test blocks with near-identical structure (only the DOM interactions differ). The scenario names are hand-matched across drivers so the works-with matrix rows line up.
- **Risk.** Rows can drift — if I add `todos/bulk-delete` to the Vue 3 driver and forget to add it to the others, it silently becomes an `○` cell. The matrix looks sparse when it shouldn't.
- **Options.**
  - (a) **Shared scenario list** in a new `conformance/shared/scenarios.ts` that exports the canonical scenario names. Each driver imports and iterates, skipping scenarios it doesn't exercise. The matrix generator can flag scenarios that are in the shared list but unreferenced by any driver.
  - (b) **Driver-level consistency check** — a lint pass that verifies every driver's `test.describe` block contains at least a `test.skip` for every scenario in the shared list.
  - (c) **Keep as-is.** Rely on human review during PRs.
- **Recommendation.** (a) once there are 6+ frameworks. Currently 4 is manageable.
- **Effort when ready.** ~1 hour.

</details>

### 5.2 Auto-derive PAT-NN coverage from test annotations

- **Current state.** `conformance/scripts/generate-matrix.js` has a hand-maintained `SCENARIO_TO_PAT` map that maps scenario names to PAT IDs. Adding a new scenario means editing two files (the driver + the map).
- **Alternative.** Use Playwright's test annotations:
  ```ts
  test("todos/add-item ...", { annotation: { type: "pats", description: "PAT-07,PAT-08" } }, async ...)
  ```
  The matrix generator reads annotations from the Playwright JSON output. One file to edit per new scenario.
- **Trade-off.** Annotations are a Playwright-specific mechanism; the current map is more portable if we ever swap out Playwright. Also, annotations live on the test, not the scenario — if we ever share scenarios across drivers (§5.1), the annotation has to move too.
- **Recommendation.** Tie this decision to §5.1. If shared scenarios land, put the PAT mapping there. If not, annotations are the cleaner per-test approach.

### 5.3 Should the agent ship a first-class "conformance mode"?

- **Motivation.** Each Layer 2 harness does the same dance: symlink `dist/faultsense-agent.min.js` + `conformance/shared/collector.js` into the harness's public dir, register a named collector, wire `data-collector-url="conformance"`. That's 3 moving parts per harness and easy to get wrong.
- **Alternative.** Add a `data-conformance="true"` attribute (or a `FAULTSENSE_CONFORMANCE=1` env var) that, when set, pushes assertion payloads directly onto `window.__fsAssertions` without needing a separate collector script. Essentially a built-in conformance collector.
- **Trade-off.** Ships test-only API in the production bundle. Minor bundle-size cost. BUT simplifies harnesses significantly: a new framework harness becomes "load the agent with `data-conformance`, write a driver" — no collector.js, no symlinks.
- **Recommendation.** Defer. The current pattern is ugly but works. Revisit if adding new harnesses becomes routine.

---

## 6 · Hygiene / cleanup

### 6.1 Migrate remaining `tests/assertions/*.test.ts` files to `setupAgent`

- **Why.** Phase 1 (commit `5474b14`) migrated three canonical test files to the new `setupAgent` helper but left the rest on the old pattern. The old pattern has ~40 lines of boilerplate per file for timer setup, mock setup, and cleanup.
- **Where.** Every file under `tests/assertions/*.test.ts` except `added.test.ts`, `conditionals/resolution.test.ts`, and `outer-swap-toggle.test.ts`. Roughly 25 files.
- **Effort.** ~5 min per file × 25 = ~2 hours. Can be done in parallel with other work.
- **Priority.** Low. The old pattern isn't broken; the new helper just reduces friction for new tests. Opportunistic migration (touch a file for another reason, migrate it too) is sufficient.

### ~~6.2 Verify `docs/mutation-patterns.md` test pointers are accurate~~

**✓ Done 2026-04-11 (batch 1).** All 10 `tests/conformance/pat-NN-*.test.ts` files exist exactly as referenced. Spot-checks on `src/assertions/manager.ts:56-104` (PAT-01) and `src/resolvers/dom.ts:158-219` (PAT-02) line pointers confirm they land on the right code.

### ~~6.3 Clean up any stray debug artifacts~~

**✓ Done 2026-04-11 (batch 1).** `grep` across `src/` and `conformance/` returns only intentional logs: the debug-gated init line in `src/index.ts`, the console collector's explicit output, the `Logger` class implementation, the matrix generator's status lines, and the HTMX harness's Express startup log. No stragglers.

### ~~6.4 Drop `test-results/` from git history if it leaked~~

**✓ Done 2026-04-11 (batch 1).** `git log --all --full-history -- test-results/ conformance/test-results/` returns empty. Never committed.

### 6.5 Delete or fix `src/resolvers/http.ts` (surfaced batch 1)

- **Why.** `npx tsc --noEmit` reports `src/resolvers/http.ts(227,1): error TS1005: '}' expected.` The file header says "NOT CURRENTLY USED" — it's a parking lot from the network-conditional assertion system that was replaced by UI-conditional assertions. Only a type-only import (`import type { HttpErrorHandler, HttpResponseHandler }`) survives in `src/interceptors/network.ts:11`. esbuild's bundler tolerates the syntax error because the actual runtime code is never imported; `tsc --noEmit` does not.
- **Options.** (a) Delete `src/resolvers/http.ts` entirely and remove the `import type` in `network.ts` (and verify nothing else expects those types). (b) Fix the trailing brace so tsc is clean, keep as a parking lot.
- **Recommendation.** (a). The file has been dead since UI-conditional assertions shipped; keeping it around just to preserve two unused type names is clutter.
- **Effort.** ~10 min to delete + verify.
- **Priority.** Low but genuine — blocks a clean `tsc --noEmit` which is a nice signal to preserve.

---

## 7 · Parking lot (not following up)

Things that came up but aren't worth tracking:

- Agent bundle size went 8.5 → 8.6 KB gzipped from the quote-strip fix. Within noise, not worth optimizing.
- Phase 3's settle wait in the tanstack driver is irrelevant now that the driver is deleted; no lingering work.
- HTMX swap-transition workaround (`hx-swap="... swap:0ms settle:0ms"`) from my earlier mistaken diagnosis is fully reverted. The correct pattern is `fs-assert-updated` with an ID selector.
- `examples/todolist-tanstack/` and `examples/todolist-htmx/` are decoupled from conformance and can be polished freely without coordinating with the test suite. Flag for marketing/demo sessions: both are ready for refresh.
