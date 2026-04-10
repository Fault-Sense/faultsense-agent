---
date: 2026-04-10
topic: cross-stack-conformance
---

# Cross-Stack Conformance Strategy

## Problem Frame

Faultsense ships as a zero-dependency agent that advertises stack-agnostic DOM observation, but the only empirical evidence of stack coverage today is two example apps: `todolist-tanstack` (React) and `todolist-htmx` (Node + HTMX). Both of these apps surfaced real bugs in the agent — the pre-existing target false-pass (`b9b0fac`) and the HTMX transient-mutation "don't fail fast" behavior change — which proves that real framework exposure finds bugs no unit test has caught.

Extending this coverage by re-implementing the todolist in every framework is slow, expensive, and mostly redundant. The underlying insight is that **frameworks differ only in *how they mutate the DOM*** — and those mutation behaviors are a finite, enumerable set shared across many frameworks. Once a mutation pattern is characterized, any framework that uses that pattern is "supported" by transitivity.

The goal of this work is to establish a **two-layer conformance strategy** that decouples "do we handle this DOM behavior correctly?" (pattern suite, fast, exhaustive) from "does this real framework work end-to-end?" (browser harness, slower, empirical). The two layers form a discovery → lock-in loop: real frameworks discover new mutation patterns, and the pattern suite prevents those patterns from ever regressing.

## Requirements

### Layer 1 — DOM Mutation Pattern Conformance Suite

- **R1.** A named, enumerated catalog of DOM mutation pattern classes lives in the repo as a first-class artifact (either in the test file headers or a dedicated `docs/` page). Each pattern has a stable ID (e.g., `PAT-01 pre-existing-target`), a description, and at least one known framework that exercises it.
- **R2.** Each pattern class has at least one automated test in a new pattern conformance suite that drives raw DOM operations (no framework required) and verifies Faultsense resolves the relevant assertion types correctly. Tests live alongside `tests/` and run in the existing vitest environment.
- **R3.** The initial catalog seeds with the following pattern classes — chosen from known bugs and known framework behaviors:
  - `PAT-01 pre-existing-target` — selector already matches at trigger time (regression lock for `b9b0fac`).
  - `PAT-02 delayed-commit mutation` — transient loading/spinner mutation fires between trigger and final outcome; Faultsense must not satisfy/fail on the transient (regression lock for the HTMX transient-mutation finding).
  - `PAT-03 outerHTML replacement` — target node is swapped out and replaced; event listeners rebound (HTMX `hx-swap="outerHTML"`, Turbo frame swap, `innerHTML` replacement of parent).
  - `PAT-04 morphdom preserved-identity` — target node identity is preserved while attributes/children are patched (Livewire, Turbo 8 morphing, Alpine).
  - `PAT-05 detach-reattach` — node briefly leaves the DOM then returns (React keyed list reordering, Portal moves, React 18 StrictMode double-mount).
  - `PAT-06 text-only mutation` — only `textContent` or a single attribute changes, no element structure change (Solid, Svelte, Vue fine-grained reactivity).
  - `PAT-07 microtask batching` — multiple independent mutations arrive in one microtask (React 18 automatic batching, Vue `nextTick`).
  - `PAT-08 cascading mutations` — a single trigger causes many mutations across unrelated subtrees (global state updates, OOB-style server responses).
  - `PAT-09 hydration upgrade` — SSR-rendered nodes gain attributes, listeners, or children when the client hydrates; the element identity is preserved but its state changes.
  - `PAT-10 shadow-dom traversal` — the assertion target is inside a Shadow DOM root (Lit, Stencil, web components). Marked as a known gap if Faultsense does not support it today.
- **R4.** The pattern catalog is explicitly marked as **growable** — every new framework bug discovered in Layer 2 must be extracted into a new `PAT-NN` entry before the fix lands.
- **R5.** Pattern tests assert against the full assertion lifecycle (pending → resolved with pass/fail, including the correct status reason) and cover at least: `added`, `removed`, `updated`, `stable`, `visible`, `hidden`, and conditional outcomes with `mutex="each"` and `mutex="conditions"`.

### Layer 2 — Per-Framework Conformance Harness

- **R6.** A new top-level `conformance/` directory (sibling to `examples/` and `tests/`) holds minimal single-page harness apps, one per framework. These are *not* examples and *not* marketing demos — they exist solely to drive Faultsense through the full assertion catalog in a real browser.
- **R7.** Each harness renders the Faultsense assertion catalog on one page (roughly mirroring the 20 assertion patterns from `todolist-tanstack/ASSERTIONS.md`), with one trigger element per assertion type. Target size: ~100-200 LoC per framework. No routing, no auth, no CRUD ceremony beyond what each assertion needs.
- **R8.** Harness apps run under Playwright-in-CI (or Vitest browser mode with Playwright driver, if it matches the existing test infra better). A lightweight in-harness collector captures the assertion payloads and the test asserts the expected pass/fail outcomes.
- **R9.** Initial framework coverage:
  - **React + TanStack Router** — already instrumented via `todolist-tanstack`. Reuse as-is (not ported to the `conformance/` layout) or extract the minimal subset. Primary value: exercises React 18 StrictMode and reconciliation.
  - **HTMX** — already instrumented via `todolist-htmx`. Same reuse question.
  - **Vue 3** — new harness. Exercises `nextTick` microtask batching and fine-grained reactivity.
  - **Hotwire (Turbo + Stimulus)** — new harness. Exercises Turbo frame/stream swaps, Turbo Drive fetches, and Turbo 8 morphing. Hotwire is tightly coupled to Rails — the harness **must** run on Rails (not an Express hand-roll) so that the Turbo mutation shapes come from real `turbo_stream.*` helpers, not our guess at what they emit. Also exercises a Rails-ecosystem pattern the HTMX harness doesn't.
- **R10.** Each harness run produces a pass/fail result per assertion in the catalog, and the results are summarized in a "works-with" matrix the README and docs site can reference.

### Cross-Cutting

- **R11.** The existing `todolist-tanstack` and `todolist-htmx` example apps remain in `examples/` as instrumentation reference for developers learning Faultsense — they are not run as CI tests unless they happen to double as R9 harnesses. Their audience is human, not CI.
- **R12.** When a new framework harness exposes a bug, the workflow is: (1) diagnose the root cause, (2) extract the mutation pattern class, (3) add it to the Layer 1 catalog with a failing test, (4) fix the agent, (5) verify the fix in both layers. This is documented as the canonical "framework compatibility bug" workflow.

## Success Criteria

- Every pattern listed in R3 has a corresponding failing-then-passing test in the pattern conformance suite.
- The two new framework harnesses (Vue 3, Hotwire) run under CI in a real browser and report per-assertion pass/fail.
- A public "works-with" matrix exists (README or docs site) and is sourced from real test output, not claims.
- When we add a new framework harness in the future, adding it requires instrumenting one ~150-LoC page — not porting a todo app.
- The agent's regression surface against the HTMX transient-mutation class (`PAT-02`) and the pre-existing-target class (`PAT-01`) is locked in by tests that would have caught each bug before it shipped.

## Scope Boundaries

- **NOT:** porting the full `todolist-tanstack` or `todolist-htmx` app to every framework. That is the exact pattern this strategy replaces.
- **NOT:** building a generic cross-framework test runner with shared scenario definitions and per-framework render adapters. A flat "one harness page per framework" is simpler and sufficient at this scale. Revisit if the harness count exceeds ~5.
- **NOT:** performance benchmarking, bundle-size comparisons, or hosted-collector integration tests — those are separate initiatives.
- **NOT:** testing every framework on the market in the first round. Vue 3 and Hotwire are the initial additions because they exercise distinct mutation patterns React and HTMX don't. Svelte, Solid, Lit, Livewire, and Angular are explicitly deferred until after Layer 1 + the first two Layer 2 harnesses ship.
- **NOT:** testing framework *versions* matrix-style (React 16 vs 17 vs 18, Vue 2 vs 3, etc.). Target latest stable only. Older versions are someone else's problem until someone asks.
- **NOT:** replacing any existing unit tests. Layer 1 is additive, not a rewrite.

## Key Decisions

- **Two layers, not one.** Pattern tests alone would miss bugs from mutation classes nobody has enumerated yet (the HTMX transient-mutation bug is proof). Framework harnesses alone are expensive to maintain and prove nothing about why a bug happened. Together, they form a discovery (Layer 2) → lock-in (Layer 1) loop.
- **Playwright is not a philosophical conflict with Faultsense's value prop.** Playwright and Faultsense solve different problems in different environments. Playwright drives scripted scenarios in controlled test environments to verify Faultsense itself behaves correctly. Faultsense in production observes unscripted real user behavior against real data. There is even a complementary story worth making explicit in marketing: Faultsense assertions can serve as the wait/assert primitives *inside* Playwright tests, converging the same correctness declaration across CI and production.
- **Frameworks are picked for pattern diversity, not popularity.** Vue 3 and Hotwire were chosen because they exercise microtask batching and Turbo swap patterns that React and HTMX don't. The selection criterion is "what unique mutation pattern does this framework exercise?" not "what's trending on Hacker News."
- **Harness apps live in a new top-level directory, separate from `examples/`.** `examples/` teaches developers how to instrument their apps (audience: humans). `conformance/` proves the agent is correct against real browsers (audience: CI + the maintainer). Conflating them creates pressure to keep examples pretty, which conflicts with keeping conformance harnesses minimal.
- **The pattern catalog grows organically.** Seeding it with ten entries is enough to prove the model. The real value accrues over time as every new framework bug becomes a permanent entry — future framework support gets cheaper, not more expensive.
- **Each framework harness uses that framework's natural backend.** HTMX is language-agnostic, so the HTMX harness uses Node + Express. Hotwire is not — Turbo is Rails-first — so the Hotwire harness uses Rails. The same rule applies to future additions: Livewire → Laravel/PHP, LiveView → Phoenix/Elixir. A hand-rolled Node host for a language-coupled framework is fiction, and Layer 2 exists precisely to catch real-framework surprises that synthetic hosts would miss. CI installs the native toolchain via `ruby/setup-ruby`, `setup-php`, `setup-elixir`; contributors without the toolchain can still run Layer 1 plus the Node-only harnesses and skip the polyglot ones locally. _(Decision added mid-execution; see plan Q6.)_

## Dependencies / Assumptions

- Playwright (or Vitest browser mode with the Playwright driver) can be added to CI without meaningful slowdown — the harness pages are trivial, startup cost dominates, and parallelization across frameworks is straightforward.
- The two existing example apps (tanstack, htmx) are stable enough to either reuse directly as Layer 2 harnesses or serve as reference when building the minimal harness version.
- Shadow DOM support (`PAT-10`) may reveal that Faultsense does not traverse shadow roots today. This is acceptable as a *discovery* of a known gap, not a blocker — the catalog entry would be marked "unsupported" and tracked as a separate feature.
- The `RealWorld` cross-framework reference app repo (https://github.com/gothinkster/realworld) exists as a future fallback if Layer 2 needs to scale to many frameworks without per-framework instrumentation effort. Not in scope for this iteration.

## Outstanding Questions

### Resolve Before Planning

_(none — the brainstorm resolved everything needed to hand off to planning)_

### Deferred to Planning

- **[Affects R2, R8][Technical]** Should Layer 1 run in the existing vitest/jsdom setup, or move to Vitest browser mode alongside Layer 2 so both layers share infrastructure? This is a repo-layout call planning should make after looking at current test runner config.
- **[Affects R6, R9][Technical]** Should the existing `todolist-tanstack` and `todolist-htmx` be reused in place as Layer 2 harnesses, or should a minimal "conformance page" be extracted into `conformance/react/` and `conformance/htmx/` for consistency with the Vue and Hotwire harnesses?
- **[Affects R8][Technical]** What is the simplest custom collector shape for the harness? An in-page global that test code reads, or a local HTTP collector Playwright points `collectorURL` at? Planning should pick one based on existing test helper patterns.
- **[Affects R10][Needs research]** Where does the "works-with" matrix live — README, docs site (`.org` repo), or both? Depends on cross-repo publishing workflow.
- **[Affects R3, PAT-10][Needs research]** Does Faultsense's MutationObserver setup currently cross shadow roots? Planning should check `src/listeners/` and `src/resolvers/dom.ts` before deciding if `PAT-10` is a gap-discovery test or a feature-addition blocker.

## Next Steps

→ `/ce:plan` for structured implementation planning.
