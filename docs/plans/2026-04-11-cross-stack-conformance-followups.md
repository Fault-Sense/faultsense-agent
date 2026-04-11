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

### 1.1 Push `feat/cross-stack-conformance-layer-1` and open a PR

- **Status.** Waiting on human approval.
- **Where.** Branch head is `43c4d2d docs(conformance): Phase 6`. 12 commits total since `main`.
- **How.** `git push -u origin feat/cross-stack-conformance-layer-1` then `gh pr create`. Suggested title: `feat(conformance): cross-stack conformance strategy (Layers 1 + 2, 4 harnesses)`.
- **PR description should include.** Link to the plan, link to `docs/works-with.md`, link to `docs/framework-integration-notes.md`, and a summary of the 12 commits grouped by phase (the individual commit messages already have good one-liners).

### 1.2 Wire up CI

- **Why.** `npm run conformance` currently runs only on developer machines. The whole point of the works-with matrix is continuous verification — without CI, the matrix can drift silently. The drift-guard step (`git diff --exit-code docs/works-with.md`) in the suggested workflow is the single most important piece.
- **Where.** The YAML is already written and documented in `conformance/README.md` under "Suggested CI workflow". The repo has no `.github/workflows/` directory yet, which is why I didn't commit the file.
- **How.** Create `.github/workflows/conformance.yml` with the YAML from the README. Four moving parts to verify: Node cache, Playwright browser cache, Ruby setup for hotwire, and the drift-guard final step.
- **Effort.** ~15 min to create + first green CI run. Docker availability in GitHub Actions is default; no extra config needed for the hotwire harness.
- **Gotcha.** First CI run will pay the Playwright-browser install cost (~90 MB) and the hotwire `docker build` cost (~2 min). Subsequent runs cache both.

### 1.3 Verify bundle size claim in README after the `stripOuterQuotes` fix

- **Why.** The `feedback_bundle_size_docs.md` memory preference says to update README/SKILL.md gzipped size after code changes. I updated README to 8.6 KB after commit `e3550f9` but didn't re-verify after all subsequent commits.
- **How.** `npm run build:size` → compare to `README.md` line 7 and line 246.
- **Effort.** 30 seconds. Probably still 8.6 KB.

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

### 2.2 PAT-09 hydration empirical coverage — SSR harness

- **Why.** PAT-09 (hydration upgrade) is locked in at Layer 1 via `tests/conformance/pat-09-hydration-upgrade.test.ts`, but no Layer 2 harness is server-rendered. The tanstack example (which IS SSR) was decoupled from conformance in commit `d1ca1fb`; the current `conformance/react/` is CSR-only.
- **Options.**
  - (a) **Add a minimal `conformance/tanstack-start/` harness.** Full TanStack Start with SSR, reduced to ~3 scenarios: title invariant, add-item (SSR-rendered empty state → hydrated list), and a mount-trigger on an SSR-rendered element that should NOT re-fire during hydration. Pairs with PAT-09's assertion.
  - (b) **Add a minimal `conformance/astro/` harness.** Astro's islands model exercises PAT-09 more interestingly than TanStack Start — most of the page is static, a few islands hydrate. Good target for "mount fires once on hydration, invariants watch the hydrated DOM correctly."
  - (c) **Add a minimal `conformance/next/` harness.** Next.js App Router. Most popular SSR framework. Bigger setup, more moving parts.
- **Recommendation.** Start with (a) tanstack-start since the plumbing (React 19 + Vite + the tanstack example) is already familiar from Phase 3. Astro is a good second harness once the pattern is proven.
- **Known quirk to test for.** The original Phase 3 tanstack harness hit a dev-mode agent double-init (see `docs/framework-integration-notes.md` under "TanStack Start"). A new SSR harness will likely hit the same issue and need the 500 ms settle wait in `beforeEach`. The root-cause fix is in §3.1 below.
- **Effort.** (a) ~90 min, (b) ~2 hours (Astro is less familiar), (c) ~3 hours.

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

- **Svelte 5** — runes-based fine-grained reactivity. Similar to Vue 3 but different compilation model. Good PAT-06/PAT-07 exposure. `conformance/svelte/` with Vite. ~1 hour.
- **Solid** — fine-grained reactivity without a VDOM. Most distinctive PAT-06 exposure (direct text node updates). `conformance/solid/` with Vite. ~1 hour.
- **Lit** — depends on §2.3 landing first. Web components + shadow DOM. ~1–2 hours once the agent supports shadow.
- **Livewire** (Laravel + PHP) — follows the Hotwire pattern from Q6 (natural backend required). Uses morphdom for DOM patching, so this ALSO contributes to PAT-04 empirical coverage. Bigger setup: needs PHP + composer toolchain in CI. ~4 hours.
- **Phoenix LiveView** (Elixir) — same Q6 category. Uses morphdom. `ruby/setup-ruby`-equivalent is `erlef/setup-beam`. ~4 hours.
- **Alpine.js** — small and class-directive based. Less unique pattern coverage than the above but easy to add. ~30 min.
- **Angular 19** — bigger framework, distinct change detection, zones. Useful for "does Faultsense work with X" marketing but low pattern-diversity value. ~2 hours.

After each harness, re-run `npm run conformance:matrix` and commit the updated `docs/works-with.md`.

### 2.5 Conformance scenario parity — backfill missing scenarios across existing harnesses

- **Why.** React and Vue 3 have 10 scenarios each. Hotwire and HTMX have 7. The four missing scenarios (`todos/edit-item`, `actions/log-updated`, `guide/advance-after-add`, and one more) aren't naturally covered by Hotwire/HTMX's minimal shape. Adding them would make the matrix rows perfectly aligned.
- **Trade-off.** Forcing scenarios into frameworks they don't naturally express is fake coverage. Better to leave `○` cells honest than pad the matrix.
- **Recommendation.** Don't pad. Instead, when you DO add an Alpine or Svelte harness, aim for the full 10-scenario set.

---

## 3 · Agent quality improvements surfaced by Layer 2

Items here are behaviors the agent COULD improve, surfaced by Phase 3–5 implementation friction. None of them are blocking bugs (all correct today), but each would make real-framework integration smoother.

### 3.1 Agent cleanup on re-init (TanStack Start dev-mode double-init)

- **Why.** In Vite dev mode, the agent's classic `<script>` tag effectively runs twice in TanStack Start — once during initial parse, once after Vite HMR connects. Each run calls `init(config)` and registers its own listeners/observers. The old init's listeners are never removed; its cleanup fn is overwritten on `window.Faultsense.cleanup`. Both agent instances are live, which isn't a correctness bug (event listeners happen to be idempotent for the agent's flow) but IS a resource leak and a subtle source of test flakes.
- **Where.** `src/index.ts:187-198` — the IIFE's DOMContentLoaded handler. Current shape:
  ```ts
  document.addEventListener("DOMContentLoaded", function () {
    const config = extractConfigFromScriptTag();
    if (config) {
      window.Faultsense!.cleanup = init(config);  // ← just overwrites
      ...
    }
  });
  ```
- **Fix.** Call the previous cleanup before storing the new one:
  ```ts
  document.addEventListener("DOMContentLoaded", function () {
    const config = extractConfigFromScriptTag();
    if (config) {
      window.Faultsense!.cleanup?.();  // ← add this
      window.Faultsense!.cleanup = init(config);
      ...
    }
  });
  ```
- **Test.** Unit test in `tests/index.test.ts` (create if needed) that fires DOMContentLoaded twice and verifies only ONE set of document listeners is active. OR: a new `PAT-NN` entry "dev-mode double-init resilience" under `tests/conformance/`.
- **Effort.** ~20 min plus the test.
- **Priority.** Low — the current behavior works, just not optimally.

### 3.2 Audit other modifier-value sites for quote handling

- **Why.** Commit `e3550f9` fixed `parseTypeValue` to strip outer quotes from modifier values (discovered via Vue 3 template literals). That fix covers `fs-assert-*` attributes. But the same CSS-selector-style quoting might appear in OTHER places:
  - `text-matches` regex values — `text-matches='\\d+'` — unlikely to be quoted but worth spot-checking.
  - `value-matches` regex values — same.
  - Custom-event detail-matches — `fs-assert-emitted="event[detail-matches=foo]"` via `src/utils/triggers/custom-events.ts` — has its own parser, may or may not strip quotes.
- **How.** Audit `src/utils/triggers/custom-events.ts` and any other code paths that read modifier values. Add regression tests wherever the quoted form is plausible.
- **Effort.** ~30 min audit + ~15 min per regression test.
- **Priority.** Low unless someone hits it.

### 3.3 Agent warning for silent no-match modifier failures

- **Why.** The quoted-attribute bug was silent — the assertion stayed pending forever with no warning. A user encountering this would see a timeout failure and wonder why. Better: when an assertion's modifier check produces zero matches across ALL elements in the target bucket, and the element count is non-zero, log a debug warning in debug mode.
- **Where.** `src/resolvers/dom.ts:178` — `handleAssertion`. Add a conditional warn when `matchingElements.length > 0` but `passesAllModifiers` returns false for all of them. Gate on `config.debug`.
- **Trade-off.** Noisy in debug mode. Useful in dev, annoying in production (but production doesn't enable debug).
- **Effort.** ~20 min.
- **Priority.** Medium. This would have shaved hours off the Vue 3 debug session.

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

### 5.1 Should Layer 2 drivers share scenario definitions?

- **Current state.** Each driver under `conformance/drivers/*.spec.ts` hand-writes ~10 test blocks with near-identical structure (only the DOM interactions differ). The scenario names are hand-matched across drivers so the works-with matrix rows line up.
- **Risk.** Rows can drift — if I add `todos/bulk-delete` to the Vue 3 driver and forget to add it to the others, it silently becomes an `○` cell. The matrix looks sparse when it shouldn't.
- **Options.**
  - (a) **Shared scenario list** in a new `conformance/shared/scenarios.ts` that exports the canonical scenario names. Each driver imports and iterates, skipping scenarios it doesn't exercise. The matrix generator can flag scenarios that are in the shared list but unreferenced by any driver.
  - (b) **Driver-level consistency check** — a lint pass that verifies every driver's `test.describe` block contains at least a `test.skip` for every scenario in the shared list.
  - (c) **Keep as-is.** Rely on human review during PRs.
- **Recommendation.** (a) once there are 6+ frameworks. Currently 4 is manageable.
- **Effort when ready.** ~1 hour.

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

### 6.2 Verify `docs/mutation-patterns.md` test pointers are accurate

- **Why.** Phase 1 populated `docs/mutation-patterns.md` with file pointers to each PAT test. These were written at catalog creation time and may have drifted if tests were renamed/moved.
- **How.** Spot-check each PAT entry's "Test" column — click through and verify the file exists and contains the right test.
- **Effort.** ~10 min.

### 6.3 Clean up any stray debug artifacts

- **Why.** Multiple debug iterations during Phase 4–5 added temporary `console.log` statements and test dumps. I cleaned them up before each commit, but there may be stragglers.
- **How.** `grep -rn "console.log\|FS_DEBUG\|\\[FS\\]" src/ conformance/` should return only intentional logs (the agent's own debug-mode logger, the collector's error-case fallback, and the generator script's status line).
- **Effort.** 2 min.

### 6.4 Drop `test-results/` from git history if it leaked

- **Why.** `.gitignore` excludes `conformance/test-results/` but earlier I saw a `test-results/` at the repo root after one of the failed Playwright runs. I `rm -rf`'d it at the time but it's worth double-checking nothing got committed.
- **How.** `git log --all --full-history -- test-results/ conformance/test-results/` — should return nothing.
- **Effort.** 30 seconds.

---

## 7 · Parking lot (not following up)

Things that came up but aren't worth tracking:

- Agent bundle size went 8.5 → 8.6 KB gzipped from the quote-strip fix. Within noise, not worth optimizing.
- Phase 3's settle wait in the tanstack driver is irrelevant now that the driver is deleted; no lingering work.
- HTMX swap-transition workaround (`hx-swap="... swap:0ms settle:0ms"`) from my earlier mistaken diagnosis is fully reverted. The correct pattern is `fs-assert-updated` with an ID selector.
- `examples/todolist-tanstack/` and `examples/todolist-htmx/` are decoupled from conformance and can be polished freely without coordinating with the test suite. Flag for marketing/demo sessions: both are ready for refresh.
