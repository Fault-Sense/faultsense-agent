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

The full API reference is in [`skills/faultsense-instrumentation/SKILL.md`](skills/faultsense-instrumentation/SKILL.md). The quick reference table below covers the most common attributes.

### Quick Reference

| Attribute | Purpose | Example |
|---|---|---|
| `fs-assert` | Assertion key (required) | `"checkout/submit-order"` |
| `fs-trigger` | Event trigger (required) | `"click"`, `"submit"`, `"mount"`, `"invariant"` |
| `fs-assert-added` | Element appears in DOM | `".success-msg"` |
| `fs-assert-removed` | Element removed from DOM | `".modal-content"` |
| `fs-assert-updated` | Element/subtree mutated | `"#cart-count"` |
| `fs-assert-visible` | Element exists and visible | `".dashboard"` |
| `fs-assert-hidden` | Element exists but hidden | `".loading-spinner"` |
| `fs-assert-loaded` | Media finished loading | `"#hero-image"` |
| `fs-assert-stable` | Element NOT mutated | `"#panel"` |
| `fs-assert-emitted` | CustomEvent fires on document | `"payment:complete"` |
| `fs-assert-after` | Sequence check: parent passed | `"checkout/add-to-cart"` |
| `fs-assert-{type}-{condition}` | Conditional assertion | `fs-assert-added-success=".dashboard"` |
| `fs-assert-mutex` | Conditional mutex mode | `"type"`, `"each"`, `"conditions"` |
| `fs-assert-oob` | OOB: trigger on parent pass | `fs-assert-oob="todos/toggle"` |
| `fs-assert-oob-fail` | OOB: trigger on parent fail | `fs-assert-oob-fail="todos/toggle"` |
| `fs-assert-timeout` | Custom timeout (ms) | `"2000"` |
| `fs-assert-mpa` | Persist across page nav | `"true"` |

## Project Context

- The agent is open source and collector-agnostic. A hosted backend is a separate project.
- Market positioning (QA/testing tool) does not impact the agent's implementation or architecture.
- MPA (multi-page app) support is first-class — SPAs and MPAs should be equally supported.
- Conditional assertions use UI outcomes as the signal, not network responses. No server-side integration required.

## Notes

- **Queue/Storage refactor:** MPA-marked assertions currently bypass the in-memory queue and go directly to localStorage (`manager.ts:74`). Storage may be better modeled as an implementation detail of the queue. Flagged for future revisit.
- **Cross-type conditional mutex:** Conditional sibling groups default to `assertionKey + type`. Use `fs-assert-mutex` to link conditionals across types — e.g., `fs-assert-mutex="each"` makes `fs-assert-removed-success` + `fs-assert-added-error` mutually exclusive. See `"each"`, `"conditions"`, and selective modes.

## Timeout Model

Assertions resolve naturally when the DOM changes. No default per-assertion timer.

- **GC sweep** (`config.gcInterval`, default 30s) — a background timer cleans up stale assertions that never resolved.
- **SLA timeout** (`fs-assert-timeout="2000"`) — opt-in per-assertion timer for performance contracts.
- **Page unload** — assertions older than `config.unloadGracePeriod` (default 2s) are failed on page close. Fresh assertions are silently dropped (user navigated, not a failure). Uses `sendBeacon` for reliable delivery.
- **Re-trigger tracking** — when a trigger fires on a pending assertion, the timestamp is recorded in an `attempts[]` array on the assertion. Included in the collector payload for rage-click analysis.

## Error Context

JS errors do not instantly fail assertions. When an uncaught exception occurs, all pending assertions are tagged with `errorContext` (first error wins — subsequent errors do not overwrite). The assertion continues resolving normally via DOM observation, timeout, or GC.

- **Passes with errorContext:** the feature worked but a JS error occurred in the session — tells the collector "passed but investigate."
- **Fails with errorContext:** the feature broke and here's the likely cause.
- The collector derives human-readable failure messages from assertion metadata (type, selector, modifiers, timeout). No failure reason strings are generated by the agent.

## Configuration

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `releaseLabel` | string | Yes | — | App version or commit hash |
| `collectorURL` | string or function | Yes | — | Backend endpoint URL or custom collector function |
| `apiKey` | string | If URL | — | API key (required when collectorURL is a URL) |
| `timeout` | number | No | 1000 | Default assertion timeout in ms |
| `debug` | boolean | No | false | Enable console logging |
| `userContext` | `Record<string, any>` | No | — | Arbitrary context attached to all assertion payloads (e.g., userId, plan tier) |

## API Methods

- **`Faultsense.init(config)`** — initialize the agent with configuration options.
- **`Faultsense.cleanup()`** — tear down the agent, remove all listeners and observers.
- **`Faultsense.registerCleanupHook(fn)`** — register a function to run during cleanup.
- **`Faultsense.setUserContext(context)`** — replace the current user context. Does not merge — pass the complete context each time. Subsequent assertion payloads include the updated context.

```javascript
// At init
Faultsense.init({
  releaseLabel: '1.0.0',
  collectorURL: '...',
  userContext: { plan: 'pro' }
});

// After login
Faultsense.setUserContext({ userId: 'u_123', plan: 'pro' });
```

## Development

- `npm test` — run vitest (jsdom environment)
- `npm run build` — esbuild → `dist/faultsense-agent.min.js` (IIFE, minified)
