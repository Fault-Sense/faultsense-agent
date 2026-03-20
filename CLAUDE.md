# Faultsense Agent

Lightweight, zero-dependency browser agent that monitors feature health through real-time assertions declared via `fs-*` HTML attributes.

## Core Value Props

- **Semantic correctness:** Asserting that the *right* thing happened, not just that *something* happened.
- **Business logic verification:** Validating that features produce correct outcomes for real users in the field.
- **Negative assertions:** Detecting when something that should NOT have happened did (e.g., unexpected error states).
- **Feature health across releases:** Tracking whether specific features work or break as code ships.

These are the differentiators. No other production monitoring tool declaratively asserts correctness against real user sessions. Dead-click/rage-click detection, frustration heuristics, and ARIA contract monitoring are out of scope — they detect symptoms, not semantic failures, and other tools already cover them. Do not dilute the core value prop by chasing heuristic signals.

Explicit manual instrumentation is the moat, not a limitation. The value is directly proportional to the instrumentation effort — developers must think about what "correct" means and encode it. That's why no one else does this. The pitch: "you already think about correctness in your E2E tests — move those declarations into your HTML and get 100x the coverage against real users."

## How Faultsense Differentiates

- **vs. Session Replay (FullStory, LogRocket, Hotjar, PostHog):** These detect frustration symptoms after the fact — rage clicks, dead clicks, error clicks. They tell you "something is probably broken." Faultsense tells you "this specific thing is definitely broken, and here's what should have happened."
- **vs. Synthetic Monitoring (Datadog Synthetics, New Relic):** These run scripted tests in fake environments on a schedule. Faultsense runs assertions against real user sessions in production — real networks, real data, real device conditions.
- **vs. RUM (Datadog RUM, Sentry, New Relic Browser):** These measure performance (Core Web Vitals, load times, error rates). They answer "is the app fast?" not "is the app correct?" Faultsense answers correctness.
- **vs. E2E Tests (Playwright, Cypress):** These verify correctness but only in CI against test data. Faultsense verifies the same things but in the field, against every real user session, across every release.
- **vs. Error Tracking (Sentry, Bugsnag):** These catch thrown exceptions. Faultsense catches silent failures — features that don't error but simply don't produce the correct outcome.

## Instrumentation Guide

When asked to add Faultsense assertions to a component, reason about it the same way you'd write an E2E test: identify the user action (trigger), determine the expected outcome (assertion type + selector), and add optional checks (modifiers). The full API reference is in `llms-full.txt` at the repo root.

### Quick Reference

| Attribute | Purpose | Example |
|---|---|---|
| `fs-assert` | Assertion key (required) | `"checkout/submit-order"` |
| `fs-trigger` | Event trigger (required) | `"click"`, `"submit"`, `"mount"` |
| `fs-assert-added` | Element appears in DOM | `".success-msg"` |
| `fs-assert-removed` | Element removed from DOM | `".modal-content"` |
| `fs-assert-updated` | Element/subtree mutated | `"#cart-count"` |
| `fs-assert-visible` | Element exists and visible | `".dashboard"` |
| `fs-assert-hidden` | Element exists but hidden | `".loading-spinner"` |
| `fs-assert-loaded` | Media finished loading | `"#hero-image"` |
| `fs-assert-{type}-{status}` | Response-conditional | `fs-assert-added-200=".success"` |
| `fs-assert-timeout` | Custom timeout (ms) | `"2000"` |
| `fs-assert-mpa` | Persist across page nav | `"true"` |

### Inline Modifiers (in assertion type value)

Modifiers are chained in the value using CSS-like bracket syntax:

```html
fs-assert-updated='#count[text-matches=\d+]'
fs-assert-updated='#logo[src=/img/new.png][alt=New Logo]'
fs-assert-updated='.panel[classlist=active:true,hidden:false]'
```

- `[text-matches=pattern]` — text content regex/string match
- `[classlist=class:true,class:false]` — class presence check
- `[attr=value]` — any other bracket is an attribute check (replaces attrs-match)

### Assertion Key Convention

Use `/` to group related assertions hierarchically, like file paths or package names:

```
fs-assert="checkout/add-to-cart"
fs-assert="checkout/submit-order"
fs-assert="profile/media/upload-photo"
fs-assert="auth/login"
```

The key must be stable across releases. Human-readable labels can be configured on the collector side.

### Placement

- Attributes go on the element the user interacts with (the `event.target`)
- For forms: `fs-trigger="submit"` on the `<form>` or `fs-trigger="click"` on the button
- `fs-*` attributes must reach the DOM — in React/Vue/Svelte, use native elements or forward props

### Key Mistakes to Avoid

- **Don't put `fs-trigger` on a parent wrapper** — only the exact event target is processed
- **Network assertions need `fs-resp-for`** — without the header/param linking request to assertion key, the assertion times out
- **Network assertions are DOM assertions gated by HTTP status** — `fs-assert-added-200=".success"` means "when response is 200, assert .success is added." The assertion type is always a DOM type.
- **Multiple response conditions on one element** — `fs-assert-added-200` and `fs-assert-added-4xx` create independent assertions. When one matches, siblings are dismissed silently.
- **`added` vs `updated`** — `added` = element doesn't exist yet; `updated` = element exists, content changes
- **`visible` vs `added`** — `visible` checks layout dimensions of existing element; `added` checks for new element in DOM
- **Every element needs** `fs-assert` + `fs-trigger` + at least one assertion type

## Project Context

- The agent is open source and collector-agnostic. A hosted backend is a separate project.
- Market positioning (QA/testing tool) does not impact the agent's implementation or architecture.
- MPA (multi-page app) support is first-class — SPAs and MPAs should be equally supported.
- Network responses are pivot points for DOM assertions, not assertions themselves. `fs-resp-for` HTTP header (on request or response) links a response to an assertion key — no server-side SDK needed. Keep this simple.

## Notes

- **Queue/Storage refactor:** MPA-marked assertions currently bypass the in-memory queue and go directly to localStorage (`manager.ts:74`). Storage may be better modeled as an implementation detail of the queue. Flagged for future revisit.

## Development

- `npm test` — run vitest (jsdom environment)
- `npm run build` — esbuild → `dist/faultsense-agent.min.js` (IIFE, minified)
