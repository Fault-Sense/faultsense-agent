# Faultsense — Marketing & Positioning

## Tagline

**E2E test assertions that run against real users, not fake environments.**

## One-liner

Faultsense is a lightweight browser agent that lets AI coding assistants instrument your app with E2E-style assertions that run in production — against every real user, on every release.

## The Problem

E2E tests are broken. They run in CI against test data, on fast networks, with no browser extensions, on clean devices. They pass. Then your checkout button doesn't work for 12% of users on mobile Safari because an ad blocker strips the payment iframe.

Your monitoring stack catches performance problems and thrown exceptions. It doesn't catch silent failures — features that don't error, they just quietly don't work.

You find out when a user complains. Or you don't find out at all.

## The Solution

Faultsense embeds test assertions directly in your HTML. When a user clicks a button, submits a form, or loads a page, Faultsense validates that the expected outcome actually happened — the right element appeared, the right content loaded, the API returned the right response.

When it didn't? You know immediately, which feature broke, for which users, on which release.

## How It Works

1. **Instrument** — Add `fs-*` attributes to your HTML, the same way you'd write a Playwright or Cypress assertion. Your AI coding assistant already knows how.
2. **Monitor** — The agent runs silently in production, validating assertions against real user sessions.
3. **Know** — Get pass/fail results per feature, per release, across all your users.

```html
<button
  fs-feature="checkout"
  fs-assert="submit-order"
  fs-trigger="click"
  fs-assert-visible=".order-confirmation"
  fs-assert-response-status="201">
  Place Order
</button>
```

This says: "When a user clicks Place Order, the order confirmation should appear and the API should return 201." If it doesn't, Faultsense reports a failure — with the feature name, the release, and what went wrong.

## The AI Angle

AI coding assistants already write E2E tests. They read your component, understand what it does, and generate Playwright assertions like `await expect(locator).toBeVisible()`.

Faultsense assertions are the same reasoning, simpler syntax. Instead of a test file with async/await chains, it's HTML attributes on the element itself:

| E2E Test (Playwright) | Faultsense |
|---|---|
| `await page.click('.submit-btn')` | `fs-trigger="click"` |
| `await expect(page.locator('.result')).toBeVisible()` | `fs-assert-visible=".result"` |
| `expect(response.status()).toBe(200)` | `fs-assert-response-status="200"` |

Tell your AI assistant "add faultsense assertions to this component" and it works — because it already knows how to reason about what should happen when a user interacts with your UI.

The difference: Playwright runs once in CI. Faultsense runs for every user, every session, every release.

## Why Not Just...

### "We have E2E tests"

Your E2E tests run in CI against test data, on a fast network, with no browser extensions, on a single viewport. They tell you "this worked in our lab." Faultsense tells you "this worked for Sarah on her iPhone 12 with an ad blocker on a 3G connection."

### "We have session replay (FullStory, LogRocket, Hotjar)"

Session replay detects frustration symptoms — rage clicks, dead clicks, error clicks. It tells you "something is probably broken" after users have already suffered. Faultsense tells you "this specific thing is definitely broken, and here's what should have happened." Proactive, not reactive.

### "We have RUM / performance monitoring (Datadog, Sentry, New Relic)"

RUM answers "is the app fast?" Faultsense answers "is the app correct?" A page can load in 200ms and still show the wrong content. Performance monitoring won't catch that.

### "We have error tracking (Sentry, Bugsnag)"

Error tracking catches thrown exceptions. The most dangerous bugs don't throw — they silently render the wrong data, skip a step, or fail to update the UI. Faultsense catches what error tracking can't: features that don't error, they just don't work.

### "We have synthetic monitoring (Datadog Synthetics)"

Synthetic monitors run scripted tests on a schedule in fake environments. Faultsense assertions run on every real user session in production — real networks, real data, real devices, real browser extensions.

## Who It's For

- **Teams replacing or augmenting E2E tests** — Same assertions, 100x the coverage, zero CI infrastructure.
- **Teams shipping fast and breaking things** — Know which features broke, for which users, before anyone files a ticket.
- **Teams with complex frontend logic** — Checkout flows, multi-step wizards, real-time data — the stuff that breaks silently.
- **Teams that care about correctness, not just uptime** — Your app can be "up" and still be broken for 10% of users.

## Key Facts

- **6.5 KB gzipped** — Lighter than a small image.
- **Zero dependencies** — Nothing to conflict with your stack.
- **Framework agnostic** — Works with React, Vue, Svelte, plain HTML, anything that renders to the DOM.
- **Collector agnostic** — Plug into any telemetry backend, or use the hosted option.
- **MPA and SPA support** — First-class support for both, including assertions that persist across page navigations.
- **Open source** — The agent is open source. A hosted backend is available for teams that don't want to build their own collector.

## Feature Health, Not Feature Flags

You track which features are enabled. Do you track which features are working?

Faultsense gives you a health score per feature, per release. Not "is it deployed" — "is it actually working for real users."

A feature isn't shipped when it's deployed. It's shipped when it works.
