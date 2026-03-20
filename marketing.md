# Faultsense — Marketing & Positioning

## H1 Options

**Option A:** E2E Tests That Run in the Field

**Option B:** Your AI Already Writes Tests. Now They Run in Production.

**Option C:** Ship E2E Coverage Without Writing Tests

## Description Options

**Option A (AI-forward):**
Let your AI coding assistant instrument your app with production-grade E2E assertions. Faultsense validates that features work correctly for every real user, on every release — not just in CI.

**Option B (problem-forward):**
E2E tests pass in CI and fail in the real world. Faultsense runs the same assertions against real user sessions — real networks, real devices, real browser extensions. Your AI assistant handles the instrumentation.

**Option C (outcome-forward):**
Know exactly which features are broken, for which users, on which release — before anyone files a ticket. AI instruments the assertions. Real users validate them.

---

## Tagline

**Your AI writes the assertions. Real users run them.**

## One-liner

Faultsense is a lightweight browser agent that validates feature correctness in production. AI coding assistants instrument the assertions automatically — the same reasoning they use to write E2E tests, but the assertions run against every real user session.

## The Problem

E2E tests are broken. They run in CI against test data, on fast networks, with no browser extensions, on clean devices. They pass. Then your checkout button doesn't work for 12% of users on mobile Safari because an ad blocker strips the payment iframe.

Your monitoring stack catches performance problems and thrown exceptions. It doesn't catch silent failures — features that don't error, they just quietly don't work.

You find out when a user complains. Or you don't find out at all.

## The Solution

Faultsense embeds assertions directly in your app. When a user clicks a button, submits a form, or loads a page, the agent validates that the expected outcome actually happened — the right element appeared, the right content loaded, the API triggered the right UI change.

When it didn't? You know immediately — which feature, which users, which release.

## How It Works

1. **Ask your AI** — Tell your coding assistant to add Faultsense assertions to a component. It already knows how — same reasoning as writing Playwright tests.
2. **Deploy** — The agent runs silently in production, validating assertions against real user sessions.
3. **Know** — Get pass/fail results per assertion, per release, across all your users.

### What the AI generates

```html
<button
  fs-assert="checkout/submit-order"
  fs-trigger="click"
  fs-assert-added-201=".order-confirmation"
  fs-assert-added-4xx=".error-message[text-matches=try again]">
  Place Order
</button>
```

This says: "When a user clicks Place Order: if the API returns 201, the order confirmation should appear. If 4xx, an error message with 'try again' should appear." If neither happens, Faultsense reports a failure.

Your AI coding assistant generates this from reading your component — the same way it writes Playwright or Cypress tests. You review it, ship it, and every real user session validates it.

## The AI Angle

AI coding assistants already write E2E tests. They read your component, understand what it does, and generate assertions. Faultsense is the same reasoning, deployed to production:

| What your AI does today | What it does with Faultsense |
|---|---|
| Writes `await expect(locator).toBeVisible()` | Adds `fs-assert-visible=".result"` |
| Writes `expect(response.status()).toBe(200)` | Adds `fs-assert-added-200=".success"` |
| Runs once in CI against test data | Runs for every user, every session, every release |
| Catches bugs before deploy | Catches bugs after deploy, in the real world |

**You don't need to learn a new API.** Tell your AI "add faultsense assertions to this component" and it works. The assertions are just HTML attributes — your AI already knows how to reason about what should happen when a user interacts with your UI.

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

## Progressive Example: Asserting a Todo Delete

Start simple, then layer on more precise assertions as your confidence needs grow.

### Level 1: Did the UI respond?

Assert that clicking "Remove" actually removes the todo item from the DOM.

```html
<button
  fs-assert="todos/remove-item"
  fs-trigger="click"
  fs-assert-removed=".todo-item">
  Remove
</button>
```

This catches the basics — the button works, the item disappears. But it doesn't know *why* it disappeared. What if the API failed and the UI just hid it anyway?

### Level 2: Did the server accept it?

Assert that the item is removed only when the API confirms the deletion with a 201.

```html
<button
  fs-assert="todos/remove-item"
  fs-trigger="click"
  fs-assert-removed-201=".todo-item">
  Remove
</button>
```

Now you know the delete was real — the server accepted it AND the UI reflected it. If the API returns 500, the assertion fails with the actual status.

### Level 3: Does the optimistic update recover correctly?

Modern apps remove the item immediately (optimistic update) then wait for the server. If the server rejects it, the item should revert. Assert the full lifecycle:

```html
<button
  fs-assert="todos/remove-item"
  fs-trigger="click"
  fs-assert-removed=".todo-item"
  fs-assert-visible-4xx=".todo-item[text-matches=Buy groceries]">
  Remove
</button>
```

Three things are asserted:
- `fs-assert-removed` — The item is removed immediately (optimistic update works)
- `fs-assert-visible-4xx` — If the API returns 4xx, the item reappears
- `[text-matches=Buy groceries]` — And it still has the original text (rollback is correct)

This is the kind of assertion no E2E test catches — real users, real networks, real failure recovery.

## Who It's For

- **Teams that use AI coding assistants** — Your AI already writes tests. Faultsense gives those assertions a place to run in the real world.
- **Teams replacing or augmenting E2E tests** — Same assertions, 100x the coverage, zero CI infrastructure.
- **Teams shipping fast** — Know which features broke, for which users, before anyone files a ticket.
- **Teams with complex frontend logic** — Checkout flows, multi-step wizards, real-time data — the stuff that breaks silently.

## Key Facts

- **6.5 KB gzipped** — Lighter than a small image.
- **Zero dependencies** — Nothing to conflict with your stack.
- **AI-instrumented** — Your coding assistant generates the assertions. No new API to learn.
- **Framework agnostic** — Works with React, Vue, Svelte, plain HTML, anything that renders to the DOM.
- **Collector agnostic** — Plug into any telemetry backend, or use the hosted option.
- **MPA and SPA support** — First-class support for both, including assertions that persist across page navigations.
- **Open source** — The agent is open source. A hosted backend is available for teams that don't want to build their own collector.

## Feature Health, Not Feature Flags

You track which features are enabled. Do you track which features are working?

Faultsense gives you a health score per feature, per release. Not "is it deployed" — "is it actually working for real users."

A feature isn't shipped when it's deployed. It's shipped when it works.
