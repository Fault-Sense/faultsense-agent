---
date: 2026-03-24
topic: open-ideation
focus: open-ended
---

# Ideation: Faultsense Agent Open Improvement Ideas

## Codebase Context

**Project:** Faultsense Agent v0.4.0 — lightweight, zero-dependency TypeScript browser agent that monitors feature health through real-time assertions declared via `fs-*` HTML attributes. Ships as a single IIFE bundle (`dist/faultsense-agent.min.js`).

**Architecture:** Clean pipeline: processors (input) → assertions (state) → resolvers (evaluation) → interceptors (side channels). Collector-agnostic reporting. The entire public API surface is HTML attributes — no JS API.

**Known gaps:**
- MPA assertions bypass in-memory queue → localStorage directly (flagged tech debt in CLAUDE.md)
- No integration tests (per-type unit tests only), no CI/lint config
- IIFE-only output (no ESM/CJS)
- No dev tools for assertion authors — console logging behind a debug flag is the only feedback
- Per-assertion fire-and-forget `fetch` calls with no batching, retry, or beacon fallback
- Negative assertions marketed as a core differentiator but not implemented as a first-class type
- `assertionCountCallback` and `consoleCollector` infrastructure exists but is unused/underutilized

**Leverage points:** Queue/storage unification, ESM output as prerequisite for framework wrappers, lifecycle hooks as a platform for dev tools and custom integrations, assertion timing data already captured but not transmitted.

## Ranked Ideas

### 1. ESM Module Output
**Description:** Add ESM (and optionally CJS) build targets alongside the existing IIFE via `package.json` exports map. ESM consumers get tree-shaking and TypeScript types; IIFE remains for script-tag users. The codebase already uses clean ES module internals — this is an esbuild flag change plus package.json metadata.
**Rationale:** The IIFE-only output blocks every team using a modern bundler (Vite, Next.js, SvelteKit). `package.json` has no `module` or `exports` field. This is the prerequisite for framework wrappers and bundler-native adoption — the lowest-effort, highest-leverage gate to remove.
**Downsides:** Must separate the auto-init IIFE behavior from library exports. Minor build complexity increase.
**Confidence:** 95%
**Complexity:** Low
**Status:** Unexplored

### 2. Assertion Timing Metadata in Payload
**Description:** Include `duration_ms` (endTime - startTime) and `timeout_ms` in the API payload sent to the collector. The data already exists on every assertion object (`startTime`, `endTime`, `timeout`) — it's just not included in `toPayload`.
**Rationale:** A checkout assertion that passes in 200ms vs. 4800ms (just under timeout) are both "passed" today. Shipping duration turns every assertion into a feature-level performance probe — not generic Core Web Vitals, but "how long did THIS feature take to produce the correct outcome for THIS user." Trivial implementation, significant product reframe. No other monitoring tool provides feature-level correctness latency.
**Downsides:** Increases payload size marginally. Requires collector-side support to surface value.
**Confidence:** 95%
**Complexity:** Low
**Status:** Unexplored

### 3. Batched Collector with Beacon Flush
**Description:** Replace per-assertion `fetch` calls in `sendToServer` with a batching layer that accumulates settled assertions, flushes on interval/threshold, retries on failure, and uses `navigator.sendBeacon` on page unload. Subsumes the queue/storage unification flagged in CLAUDE.md — localStorage becomes a persistence backend for a single queue abstraction, not a parallel code path.
**Rationale:** Currently every assertion fires its own HTTP POST (`server.ts:56`). 10 assertions = 10 requests. Assertions resolving during navigation are silently lost because `fetch` during `beforeunload` is not guaranteed. `AGENT_PAYLOAD_SPEC.md` explicitly documents "No Batching." This improves reliability, reduces collector load, and unifies the MPA storage bypass — three wins from one abstraction.
**Downsides:** Adds buffering complexity. Batch window introduces slight latency. `sendBeacon` payload size limits (64KB) need handling.
**Confidence:** 90%
**Complexity:** Medium
**Status:** Unexplored

### 4. Assertion Authoring Overlay
**Description:** A debug-mode visual overlay that highlights every instrumented element on the page, shows live assertion state (pending/passed/failed/timed out), validates selectors at creation time, and surfaces misconfiguration inline. Doubles as a discovery/dry-run mode that scans and reports all `fs-*` instrumentation without sending to the collector.
**Rationale:** The #1 adoption blocker is the zero-feedback authoring loop. Developers add `fs-*` attributes and rely on console output behind a debug flag. The `assertionCountCallback` and `consoleCollector` infrastructure exists but produces no spatial feedback tied to DOM elements. This turns instrumentation from "write and pray" into an interactive authoring experience.
**Downsides:** Adds DOM to the page (even if debug-only). Must be absolutely zero-cost when disabled. Risk of scope creep into a full debugging suite.
**Confidence:** 85%
**Complexity:** Medium
**Status:** Explored (brainstorm 2026-03-24)

### 5. Assertion Lifecycle Hooks
**Description:** Expose `onAssertionCreated`, `onAssertionResolved`, `onAssertionTimeout` callbacks in the init configuration. The `consoleCollector`, any future dev overlay, custom analytics (Datadog counters, Sentry breadcrumbs), and test harnesses all become consumers of one event surface.
**Rationale:** Today every new "output" requires bespoke wiring into the manager. The `assertionCountCallback` is a single-subscriber precursor. Tests spy on `sendToCollector` as a workaround for the lack of proper events. A lifecycle API turns the manager into a platform — one integration point, unlimited consumers. It's also the foundation the authoring overlay (#4) would build on.
**Downsides:** API design must be stable since hooks become a public contract. Small performance overhead per assertion lifecycle event.
**Confidence:** 85%
**Complexity:** Low–Medium
**Status:** Unexplored

### 6. Negative/Absence Assertions
**Description:** Support `fs-assert-not-added`, `fs-assert-not-visible`, etc. — assertions that PASS when the condition is never met within the timeout window, and FAIL the instant it is. Inverts timeout semantics: timeout = success (nothing happened, which is what we wanted).
**Rationale:** CLAUDE.md lists "Negative assertions: Detecting when something that should NOT have happened did" as a core value prop and differentiator. But no negated assertion types exist in the `AssertionType` union. The timeout resolver always fails on timeout. This closes the gap between marketed capability and actual implementation.
**Downsides:** Inverted timeout semantics add conceptual complexity. Every resolver needs a negation path. Some types (e.g., "not-updated") are semantically tricky.
**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

### 7. Programmatic JS API
**Description:** Expose `Faultsense.assert("checkout/submit", { type: "added", selector: ".success" })` for cases where HTML attributes can't reach — Shadow DOM, dynamically generated content, third-party widgets, SSR hydration boundaries. `window.Faultsense` already exists and the internal pipeline is fully programmatic; a JS entry point bypasses attribute parsing and feeds directly into `enqueueAssertions`.
**Rationale:** The "attributes only" constraint prevents adoption in the most complex (and highest-value) codebases. React Server Components, closed Shadow DOM, and Web Components can't carry `fs-*` attributes. A JS API doesn't dilute the declarative model — it extends it to contexts where attributes literally cannot exist. Positioned as an escape hatch, not the primary interface.
**Downsides:** Risks diluting the "HTML attributes are the API" positioning. Must be clearly secondary to the declarative model. API surface needs careful design to avoid becoming the de facto interface.
**Confidence:** 75%
**Complexity:** Medium
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Selector validation at creation time | Subsumed by authoring overlay |
| 2 | SPA route-change trigger | `mount` trigger is a reasonable workaround; niche |
| 3 | Assertion deduplication/throttling | Edge case for v0.4, not top-tier |
| 4 | Assertion dependency chains | Too expensive; significant architectural complexity for v0.4 |
| 5 | Scoped assertion contexts (fs-context) | Nice DX but not critical; better as brainstorm variant |
| 6 | Build-time assertion linter (CI) | High value but separate tooling project, not agent core |
| 7 | E2E test extraction/generation | Too ambitious, insufficient grounding in immediate needs |
| 8 | Remove element snapshot from hot path | Good quick-win PR but not ideation-worthy |
| 9 | Assertion composition (AND/OR logic) | Too complex for current stage |
| 10 | Watch for uninstrumented element removal | Conceptually muddy, niche signal |
| 11 | URL-based network assertion matching | Interesting but changes a core design decision (fs-resp-for) |
| 12 | Assertion sampling and budgets | Premature optimization for v0.4 |
| 13 | Shadow DOM piercing | JS API (#7) solves this more elegantly |
| 14 | Framework adapter packages | Separate project; requires ESM first |
| 15 | localStorage quota resilience | Bug fix, not ideation |
| 16 | Pipeline isolation from own network traffic | Bug fix, not ideation |
| 17 | Cleanup doesn't restore interceptors | Bug fix, not ideation |
| 18 | Assertion staleness guard (long SPA sessions) | Good engineering, not top-tier |
| 19 | Structured error context on global errors | Quick win but not transformative |
| 20 | Dry-run / discover mode | Merged into authoring overlay (#4) |
| 21 | Unified queue/storage abstraction | Merged into batched collector (#3) |

## Session Log
- 2026-03-24: Initial open-ended ideation — 48 raw ideas from 6 agents, ~28 after dedup, 7 survivors
- 2026-03-24: Selected #4 (Assertion Authoring Overlay) for brainstorm
