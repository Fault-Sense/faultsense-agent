---
date: 2026-03-24
topic: demo-showcase-marketing
focus: creative demo/showcase experiences for marketing and adoption, including bookmarklet/extension, AI-assisted instrumentation, and self-dogfooding landing page
---

# Ideation: Demo, Showcase & Marketing Experiences

## Codebase Context

**Project:** Faultsense Agent v0.4.0 — zero-dependency TypeScript browser SDK (18.7KB) that monitors feature health via `fs-*` HTML attributes. Separate IIFE builds for collectors: console (766B), panel (6.3KB). The panel collector renders settled assertions in a Shadow DOM floating panel.

**The problem:** Zero demo infrastructure. No example pages, no playground, no way to experience the product without instrumenting your own HTML and setting up a collector. The docs site (faultsense.org) is a separate repo. Time-to-first-value is too high for marketing.

**Key assets:**
- Three standalone IIFE bundles loadable via `<script>` tags with zero build step
- Panel collector uses Shadow DOM — works on any page without style conflicts
- Self-registering collector pattern — injection-friendly by design
- `marketing.md` contains progressive assertion examples (Level 1/2/3 todo delete)
- `llms-full.txt` is LLM-consumable API reference

**Core tension:** Manual instrumentation is the moat (devs must think about correctness), but it's also the adoption barrier. The demo must make the value of manual assertions tangible without requiring the viewer to manually instrument something first.

## Ranked Ideas

### 1. Self-Instrumenting Landing Page
**Description:** faultsense.org instruments itself with `fs-*` attributes on real interactive elements — nav menu, CTA buttons, interactive code examples, signup form. The panel collector runs visibly on the page. Every visitor experiences faultsense by simply using the site. Some elements are deliberately broken (silent failures) to showcase the "aha" moment: the panel catches things that look fine but aren't.
**Rationale:** Eliminates time-to-aha entirely. Visitors see assertions fire in the first 3 seconds. This is the kind of thing people screenshot and share — "this marketing site monitors itself." Also serves as a real deployment that surfaces API rough edges. Combines the "dogfood" and "failure-first" design principles.
**Downsides:** Docs site is a separate repo. Panel visible by default may confuse non-developer visitors. Needs thoughtful UX to not overwhelm.
**Confidence:** 90%
**Complexity:** Low–Medium
**Status:** Unexplored

### 2. The Faultsense Bookmarklet
**Description:** A bookmarklet (draggable from the landing page) that injects `faultsense-agent.min.js` + `faultsense-panel.min.js` onto any page, calls `init()` with the panel collector, and shows a minimal overlay to help the user add `fs-*` attributes to clicked elements. "Try faultsense on your own app in 10 seconds."
**Rationale:** The viral demo moment no competitor offers. Conference talk: open any website, drag bookmarklet, instrument a button in 10 seconds, click it, panel shows PASSED. The agent is designed for injection (IIFE, self-registering collectors, Shadow DOM panel). Combined bundle ~25KB.
**Downsides:** Adding attributes via overlay requires building a small UI. Attributes don't persist across page reload. More polished than a console snippet but more work.
**Confidence:** 85%
**Complexity:** Medium
**Status:** Explored (brainstorm 2026-03-24)

### 3. Hosted Sandbox Playground
**Description:** A split-pane page at playground.faultsense.org: editable HTML source on the left, live preview with panel on the right. Users edit `fs-*` attributes and see assertions resolve instantly as they interact. Ships with 4-5 starter templates (todo, checkout, search, tabs, image gallery). Could also be built as an embeddable `<fs-example>` web component for docs pages. No account required.
**Rationale:** The REPL for assertions. The "aha moment" isn't watching pre-built assertions — it's writing your first one and seeing it resolve. HTML attributes are uniquely suited to a playground (the entire API IS the HTML). Becomes the go-to link for docs, blog posts, talks, and support.
**Downsides:** Requires hosting and maintenance. Split-pane editor is non-trivial UX. Must handle iframe security.
**Confidence:** 80%
**Complexity:** Medium–High
**Status:** Unexplored

### 4. Gamified Instrumentation Challenges
**Description:** Interactive web pages presenting deliberately buggy mini-apps, challenging users to write correct `fs-*` attributes to catch the bug. A custom collector "grades" whether the assertion correctly fires. Progressive difficulty from simple (button doesn't update counter) to advanced (optimistic update doesn't roll back on 4xx). Shareable completion badges.
**Rationale:** Gamification drives engagement and deep product understanding. Each challenge teaches a different assertion pattern. Completion badges are shareable ("I caught a silent race condition with 3 HTML attributes"). Creates advocates who understand the product deeply. Builds on playground infrastructure.
**Downsides:** Significant content creation and grading logic. Must balance difficulty. Maintenance as API evolves.
**Confidence:** 70%
**Complexity:** High
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | In-repo playground HTML file | Dropped by user — too basic as standalone |
| 2 | Silent failure gallery | Dropped by user |
| 3 | Auto-instrumentation demo mode | Undermines "manual instrumentation is the moat" positioning |
| 4 | DevTools console snippet | Weaker version of the bookmarklet |
| 5 | Chrome extension with AI | Too expensive — extension dev, AI integration, store submission |
| 6 | npx CLI demo | Lower leverage than web-based approaches |
| 7 | Assertion coverage badge | Needs collector backend |
| 8 | Panel timeline/replay | Feature, not demo/marketing |
| 9 | Annotation hover overlay | Dev tool feature, not marketing |
| 10 | Pre-instrumented OSS app gallery | High effort for marginal gain |
| 11 | CI panel screenshots for PRs | Engineering, not marketing |
| 12 | Copy-paste snippet generator | Feature, not demo |
| 13 | E2E test auto-suggest | Product feature |
| 14 | LLM assertion audit | Product feature |
| 15 | Framework codemod | Product feature |
| 16 | Natural language authoring | Future chrome ext feature |
| 17 | AI modifier inference | Product feature |
| 18 | Interaction heatmap | Too complex for demo scope |
| 19 | VS Code one-click instrument | Product feature |
| 20 | Assertion confidence scoring | Needs backend |
| 21 | Embeddable web component | Merged into hosted sandbox |
| 22 | CI smoke test on playground | Engineering, not marketing |

## Session Log
- 2026-03-24: Demo/showcase ideation — 39 raw ideas from 5 agents, ~30 after dedup, 4 survivors (user refined from 6)
- 2026-03-24: Selected #2 (Faultsense Bookmarklet) for brainstorm
