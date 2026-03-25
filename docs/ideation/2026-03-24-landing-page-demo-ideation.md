---
date: 2026-03-24
topic: landing-page-demo
focus: creative landing page demo strategy — AI-first positioning, silent failure storytelling, dogfooding, panel as proof-of-mechanism not product
---

# Ideation: Faultsense Landing Page Demo Strategy

## Codebase Context

**Project:** Faultsense Agent v0.4.0 — zero-dependency TypeScript browser SDK (18.7KB). Separate IIFE builds for collectors: console (766B), panel (6.3KB with Shadow DOM). The panel is a demo/debug tool, NOT the production notification mechanism.

**The real product workflow:**
1. AI coding agents (Claude, Cursor, Copilot) instrument HTML with `fs-*` attributes
2. The agent runs in the browser, monitoring real user sessions
3. Assertions report to a backend collector for alerting and dashboards
4. When assertions fail, an agentic loop investigates and remediates

**Key constraint:** The demo must convey the AI-first workflow and the full production loop — not position manual HTML authoring or the debug panel as the primary experience.

**Current state:** Zero demo infrastructure. No example pages, no playground. The docs site (faultsense.org) is a separate repo.

## Ranked Ideas

These 5 compose into a coherent landing page flow: Ghost Mode (hook) → Reveal → Gallery (explore) → AI Diff (how it works) → Agentic Loop (full value).

### 1. Ghost Mode — The Delayed Reveal
**Description:** The landing page loads normally with zero indication faultsense is running. The visitor browses, clicks nav, fills out the signup form. After 3-4 natural interactions, a subtle notification slides in: "Faultsense has been silently monitoring this page. 8 assertions passed. 1 failed. See what happened?" Clicking reveals the panel with a full history — including a planted silent failure they walked right past.
**Rationale:** Demonstrates the actual production experience — invisible, zero UX impact, surfaces only when something is wrong. The delayed reveal creates genuine surprise. The fact that the visitor didn't notice the failure IS the pitch. Reframes the product from "a panel" to "an invisible safety net."
**Downsides:** Requires careful timing. The planted failure must be subtle enough to miss but obvious enough to feel real once revealed.
**Confidence:** 90%
**Complexity:** Low–Medium
**Status:** Unexplored

### 2. The Agentic Loop Storyboard
**Description:** After the ghost reveal shows a failed assertion, a cinematic scroll sequence shows what happens in production: (1) assertion payload flies to backend as JSON, (2) Slack-like alert fires, (3) AI agent receives the alert with element snapshot and failure reason, (4) code diff appears showing the AI's fix, (5) fix deploys and assertion goes green. Each step auto-advances. The visitor watches the full loop that makes faultsense valuable.
**Rationale:** The panel is not the product — the closed loop IS. This bridges from on-page demo to actual production value without requiring imagination. Shows: detect → alert → diagnose → fix → verify.
**Downsides:** Animation/storyboard design work. Must feel snappy and real, not like a marketing video.
**Confidence:** 85%
**Complexity:** Medium
**Status:** Explored (brainstorm 2026-03-24)

### 3. The Silent Failure Gallery (with "Spot the Bug" Challenge)
**Description:** 5-6 interactive mini-widgets embedded in the page, each containing a different class of silent failure: todo that doesn't persist, checkout total that doesn't update, toggle that doesn't save, search returning stale results, form showing "Success!" on a 500. Challenge banner: "These widgets have silent bugs. Can you find them?" After interacting, the panel reveals what the visitor missed.
**Rationale:** Five realistic failure scenarios builds conviction this is a category of problem, not an edge case. The challenge format creates engagement. The reveal proves even developers miss these — but faultsense doesn't. Each failure maps to a different assertion type, showcasing API breadth.
**Downsides:** Significant content creation (5-6 mini-apps). Must all feel real enough not to be dismissible.
**Confidence:** 85%
**Complexity:** Medium–High
**Status:** Unexplored

### 4. "Claude Instrumented This" — AI Prompt to Live Diff
**Description:** A section shows uninstrumented component HTML on the left and a prompt: "Add faultsense monitoring to the checkout form." Visitor clicks "Run" and watches AI output stream token-by-token into a diff on the right — `fs-*` attributes appearing in the code. Below, the component is now live and instrumented. Visitor interacts, triggers a planted failure, and the panel catches it. Message: "One prompt. Full coverage. You review and merge."
**Rationale:** Directly demonstrates the AI-first workflow. The visitor never learns the attribute API. The streaming diff is visually compelling and honest about what the product does. Answers "how much work?" (one prompt) and "what does it look like?" (readable diff) simultaneously.
**Downsides:** Requires either a real AI call or a convincing scripted animation. The diff must look realistic.
**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

### 5. The A/B Murder Mystery
**Description:** Two identical-looking apps side by side. Both "in production." Both have clean error logs and passing health checks. "One of these apps has a critical bug affecting 12% of users. Which one?" Visitor clicks around both — can't find the difference (it's silent). Faultsense activates on the right app. Assertion fires red. Bug revealed. "This is what 'silent failure' means. Error tracking saw nothing. Faultsense caught it in 200ms." The left app stays broken. Silent.
**Rationale:** Theatrical setup creates genuine tension. The reveal delivers the entire value prop in one moment. The left-app-still-broken visual lingers — that's YOUR app right now. Side-by-side also shows faultsense is lightweight.
**Downsides:** Two full app instances to build. The mystery must be genuinely unsolvable without faultsense.
**Confidence:** 75%
**Complexity:** High
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Static before/after diff as hero | Weaker version of the live AI diff (#4) |
| 2 | Visitor-authored assertion playground | Positions manual HTML authoring — contradicts AI-first direction |
| 3 | X-Ray annotation overlay | Feature, not marketing demo |
| 4 | Time-travel release comparison | Too abstract, requires simulating backend |
| 5 | Cost calculator | Too salesy, not experiential |
| 6 | Confessional wall | Content marketing, not a demo experience |
| 7 | Cursor screen recording as hero | Supplementary content, not interactive |
| 8 | .cursorrules as the product | Adoption mechanism, not a demo |
| 9 | "Instrument your URL" sandbox | Too complex — needs AI backend + iframe proxy |
| 10 | Terminal session replay | Aesthetic choice, not product demo |
| 11 | Code review format page | Too niche |
| 12 | War room dashboard | End state without mechanism — too abstract |
| 13 | Prompt-to-coverage calculator | Comparison, not experiential |
| 14 | Failure timeline (12 releases) | Requires simulating production data |
| 15 | Reliability scorecard | Weaker version of ghost mode |
| 16 | "Everything instrumented" transparent page | Loses ghost mode surprise |
| 17 | Dual narrative scroll | Layout variant, not standalone concept |
| 18 | Sabotage playground (visitor breaks things) | Wrong frame — implies reactive, not proactive |
| 19 | Trust gradient layout | Layout idea, not concept |
| 20 | Honest checkout (standalone) | Merged into gallery |

## Session Log
- 2026-03-24: Landing page demo ideation (round 2, fresh start with AI-first constraints) — 40 raw ideas from 5 agents, ~25 after dedup, 5 survivors
- 2026-03-24: Selected #2 (The Agentic Loop Storyboard) for brainstorm
