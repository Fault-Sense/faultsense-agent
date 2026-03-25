---
date: 2026-03-24
topic: agentic-loop-storyboard
---

# Agentic Loop Storyboard

## Problem Frame

The faultsense debug panel shows assertion results client-side — but the panel is a demo/debug tool, not the production experience. Visitors who see the panel and nothing else will think faultsense is a browser devtool, not a production monitoring system with an AI-driven remediation loop. The storyboard bridges this gap by visualizing the full production workflow: detect → alert → AI diagnose → AI fix → verify.

## Requirements

- R1. A scroll-triggered animated sequence on the faultsense.org landing page that visualizes the full agentic loop in 5 steps: (1) assertion payload sent to backend, (2) alert fires, (3) AI agent receives failure context, (4) AI generates a code fix, (5) fix deploys and assertion goes green.
- R2. Each step reveals as the visitor scrolls. The visitor controls the pace. Steps should feel snappy — no slow-loading animations or unnecessary delays. Each step transitions in as the visitor scrolls to it.
- R3. Visual style is minimal and data-focused. No mock UIs of specific tools (no Slack screenshots, no GitHub PR recreations). Instead, show the actual data flowing: a JSON payload, an alert message, a failure summary, a code diff snippet, a green status indicator. Emphasis on the information, not the chrome around it.
- R4. The storyboard uses a representative example (e.g., a checkout assertion that detects a silently dropped coupon code) that is thematically consistent with the rest of the landing page but works independently. It is NOT coupled to the ghost mode reveal — it can be linked, embedded, or viewed standalone.
- R5. Each step includes a brief annotation (1 sentence) explaining what is happening in plain language, so the narrative is self-explanatory without surrounding page context.
- R6. The final step (assertion goes green) should feel like a resolution — a clear visual "fixed" signal that creates closure.
- R7. The entire sequence lives within a single page section. It does not take over the full viewport or require the visitor to leave the normal page flow.

## Success Criteria

- A visitor who has never heard of faultsense can scroll through the storyboard and understand the full value proposition: faultsense detects silent failures, alerts the team, and enables AI-driven remediation — all without the visitor needing to interact with a panel, write code, or understand HTML attributes.
- The storyboard is sharable as a standalone section (linkable via anchor, embeddable in blog posts).
- Time to scroll through all 5 steps: 10-20 seconds of natural scrolling.

## Scope Boundaries

- No real backend calls — the storyboard is entirely a frontend animation with hardcoded example data.
- No interactive elements within the storyboard (no buttons, inputs, or hover states beyond scroll). The scroll IS the interaction.
- No dependency on the ghost mode reveal or the debug panel. The storyboard is a self-contained section.
- No specific tool branding (Slack, GitHub, PagerDuty) — keep the alerting and CI/CD steps generic.
- This is a landing page section, not a standalone page or microsite.

## Key Decisions

- **Scroll-triggered, not auto-playing**: Visitor controls the pace. Respects the reader. More engaging than a passive animation.
- **Data-focused, not tool-focused**: Show the payload, the alert text, the diff — not mock UIs of Slack or GitHub. This avoids implying specific integrations and keeps the focus on faultsense's value.
- **Loosely coupled to the page**: Works standalone. Uses a representative failure example. Can be linked from blog posts, docs, or tweets without requiring the full landing page context.
- **All 5 steps are real product capabilities**: The detect → alert → AI diagnose → AI fix → verify loop is shipped, not aspirational.

## Dependencies / Assumptions

- This is a section of the faultsense.org landing page (separate repo). No changes to the agent repo are required.
- The example failure data (assertion key, payload, diff) should be realistic and consistent with the agent's actual `ApiPayload` schema.

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] Scroll-trigger library or approach — CSS scroll-driven animations, Intersection Observer, or a library like GSAP ScrollTrigger.
- [Affects R3][Needs research] Best way to render a code diff snippet in a minimal, data-focused style without a full syntax highlighter.
- [Affects R4][Technical] The representative failure example — what assertion key, what failure, what fix? Should be relatable to a wide audience (checkout/e-commerce is a good candidate).

## Next Steps

→ `/ce:plan` for structured implementation planning
