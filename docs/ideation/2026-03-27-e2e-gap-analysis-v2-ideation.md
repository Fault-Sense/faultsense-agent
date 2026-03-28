---
date: 2026-03-27
topic: e2e-gap-analysis-v2
focus: Second gap analysis — identify remaining test patterns that e2e frameworks can verify but Faultsense cannot, now that invariants, route, stable, property primitives, and OOB-on-fail are implemented
---

# Ideation: E2E Gap Analysis v2

## Codebase Context

**Project:** Faultsense Agent v0.4.0 — lightweight, zero-dependency TypeScript browser agent. Ships as IIFE bundle. Source in `src/` with pipeline: processors → assertions → resolvers → interceptors → collectors.

**Implemented since v1 gap analysis (2026-03-26):**
- Continuous invariants (`fs-trigger="invariant"`)
- Route assertions (`fs-assert-route` with regex, SPA + MPA)
- Stable assertions (`fs-assert-stable`, inverted `updated`)
- Property primitives: `value-matches`, `checked`, `disabled`, `count`/`count-min`/`count-max`
- OOB on fail (`fs-assert-oob-fail`)
- UI-conditional assertions (replaced network assertions — freeform condition keys, no server integration)
- Cross-type grouping (`fs-assert-grouped`)

**Current assertion types:** added, removed, updated, visible, hidden, loaded, stable, route

**Current triggers:** click, dblclick, change, blur, submit, load, error, mount, unmount, invariant

**Current modifiers:** text-matches, classlist, attrs-match, value-matches, checked, disabled, count/count-min/count-max

**Still not implemented from v1:** Client-side context signals (idea #5 — URL/storage/network gates)

**Fundamental paradigm difference:** E2e tests CONTROL the browser (fill forms, click, navigate with known inputs). Faultsense OBSERVES real users (encodes expectations about what should happen when users take actions, branches on UI outcomes). No state setup, no test fixtures. The value is 100x coverage from real users vs synthetic scripts.

## Ranked Ideas

### 1. Expanded Trigger Set (hover, keydown, focus, input)

**Description:** Add commonly-needed event triggers that are currently missing:
- `hover` (mouseenter) — tooltips, dropdown menus, preview cards, mega-navs
- `keydown` with key filter (`fs-trigger="keydown:Escape"`) — modal close, keyboard shortcuts, form submission via Enter
- `focus` / `focusin` — focus-driven UI activation, skip-to-content links
- `input` — real-time validation feedback, search-as-you-type, character counters

These are standard DOM events the existing event listener infrastructure already supports. They need to be added to `supportedEvents` in config.ts, with optional key filtering for keyboard events. The `handleEvent` path in `manager.ts` processes any registered event — no new resolution logic needed.

**Rationale:** The single biggest source of recipe gaps in the comparison below. Hover-triggered UI (tooltips, dropdowns), keyboard navigation (Escape to close, Tab to navigate, Enter to submit), focus-driven behavior, and real-time input validation are among the most common Playwright test patterns. Faultsense literally cannot observe any of them because the events aren't registered. The implementation cost is near-zero — the event infrastructure exists, these events just aren't in the list.

**Downsides:** `hover` and `input` are high-frequency events that could create noise if instrumented broadly. Key filtering for `keydown` adds parse complexity (colon syntax for key names). `input` fires on every keystroke — may need internal debouncing or rate limiting.

**Confidence:** 90%
**Complexity:** Low
**Status:** Unexplored

---

### 2. Multi-Step Sequential Assertions (`fs-assert-after`)

**Description:** A mechanism to express ordered expectations across a user journey. An element with `fs-assert-after="checkout/submit"` only activates its assertions after the referenced parent assertion passes. Unlike OOB (which doesn't chain), `fs-assert-after` allows multi-level sequences: A → B → C → D. Each step only becomes "live" when its predecessor passes.

This encodes the journey itself, not just individual destinations. A user landing on step 3 via deep link wouldn't satisfy the sequence — step 1 and step 2 must have passed first.

**Rationale:** The #1 structural gap between e2e tests and Faultsense. Every Playwright test is implicitly sequential (`await` chains). Faultsense assertions are independent and stateless. Multi-step checkout, wizard flows, onboarding funnels, and complex form submissions — the highest-value user journeys — cannot be expressed as cohesive flows. Three independent ideation agents generated this idea. Was excluded from v1 analysis for separate evaluation.

**Downsides:** Assertion lifecycle becomes more complex (pending → waiting-for-parent → active → resolved). Deep chains that never complete consume memory until GC. Cross-page sequences require MPA persistence of the chain state. The chain model may be too rigid for flows with optional/skippable steps.

**Confidence:** 85%
**Complexity:** Medium-High
**Status:** Unexplored

---

### 3. Focus Modifier (`[focused=true]`)

**Description:** A new modifier that checks `document.activeElement === element` (or `element.matches(':focus-within')` for containers with `[focused-within=true]`). Enables asserting that after a user action, focus moved to the correct element — modal focus traps, form error auto-focus after validation, skip-to-content links, dialog return focus.

Implementation follows the same pattern as `checked` and `disabled` — a property read in the modifier map, evaluated at resolution time.

**Rationale:** Playwright's `toHaveFocus()` / `toBeFocused()` is one of the most-used accessibility assertions. Focus management is one of the hardest things to get right in SPAs — modals that don't trap focus, form validation that doesn't focus the first error field, dialogs that return focus to the wrong element on close. These are silent UX failures that produce zero errors. The current modifier set checks text, class, attrs, value, checked, disabled, count — but never focus state.

**Downsides:** `document.activeElement` is not observable via MutationObserver — only reliable during event-triggered resolution (same limitation as `value-matches`). Focus state is transient and can change between trigger and resolution.

**Confidence:** 85%
**Complexity:** Low
**Status:** Unexplored

---

### 4. Client-Side Context Signals (Storage + URL Gates)

**Description:** Extends the assertion gating model to observable client-side signals beyond HTTP:
- `[storage=key:pattern]` modifier — gate DOM assertion on localStorage/sessionStorage value matching a pattern
- `[url=/pattern]` modifier — gate DOM assertion on current URL matching (complementary to `fs-assert-route`, which asserts URL *is* the outcome; URL gate asserts URL *as a precondition* for a DOM check)
- `fs-trigger="online"` / `fs-trigger="offline"` — trigger assertions on network state change

The login form problem solved without server integration: `fs-assert-added-success=".dashboard[url=/dashboard]"` and `fs-assert-added-error=".error-msg[url=/login]"` — the URL is the disambiguation signal.

**Rationale:** Highest-ranked unimplemented idea from v1 gap analysis. Solves the biggest adoption friction: distinguishing success/error paths without `fs-resp-for` server headers. Storage assertions close the gap with Playwright's `page.evaluate(() => localStorage.getItem(...))` — verifying durable side effects, not just transient UI. Online/offline triggers let Faultsense assert degraded-mode UX that no synthetic test can replicate (real users actually go offline).

**Downsides:** Intercepting `Storage.setItem` adds interception surface area. Storage events don't fire within the same tab (need proxy). Multiple gate types increase parse complexity.

**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

---

### 5. Custom Event Assertions (`fs-assert-emitted`)

**Description:** An assertion type that resolves when a specified CustomEvent is dispatched on the target element or `document`. Write `fs-assert-emitted="cart:updated"` to assert the event fired. The `event.detail` payload can be checked with a modifier: `fs-assert-emitted="cart:updated[detail-matches=items:\d+]"`.

Implementation: register a one-shot `addEventListener` for the specified event name on the target element when the assertion is created. On event, run detail modifiers, resolve pass/fail. Cleanup listener on resolution or GC.

**Rationale:** Web components (Lit, Stencil), micro-frontends, and increasingly React apps communicate state through CustomEvents. Playwright can listen with `page.evaluate(() => addEventListener(...))`. Faultsense only observes DOM mutations and native events — if a component dispatches `payment:complete` but the DOM update is delayed or missing, there's no way to assert the event fired. This bridges the framework-internal-state gap. Especially relevant for micro-frontend architectures where components communicate via events, not shared DOM.

**Downsides:** Cannot `addEventListener('*')` — event names must be known upfront (fits the manual instrumentation model). High-frequency custom events could cause noise. Listener management adds cleanup complexity.

**Confidence:** 70%
**Complexity:** Medium
**Status:** Unexplored

---

### 6. Attribute Regex Matching

**Description:** Upgrade the `attrs-match` modifier from exact string comparison (`el.getAttribute(key) === value`) to regex matching (`new RegExp(value).test(el.getAttribute(key))`), matching the pattern already used by `text-matches`. Write `fs-assert-updated="#card[data-state=loaded|ready]"` or `fs-assert-visible=".user[data-role=admin|editor]"`.

Implementation: ~3 lines changed in `resolvers/dom.ts` where `attrs-match` evaluates — replace `=== value` with `new RegExp(value).test(...)`.

**Rationale:** Modern frameworks expose state through `data-*` attributes (`data-state="loaded-v2"`, `data-status="success-123"`). Exact matching fails when attribute values include dynamic segments. Playwright uses regex for attribute assertions: `expect(el).toHaveAttribute('data-state', /loaded/)`. The modifier infrastructure already supports regex everywhere (text-matches) except attribute values — this is an inconsistency.

**Downsides:** Minimal. Minor risk of developers writing regex metacharacters when they mean literal strings (dots, pipes). Could add an explicit `[data-state~=pattern]` syntax to distinguish regex from exact match if needed.

**Confidence:** 95%
**Complexity:** Low
**Status:** Unexplored

---

## Playwright vs Faultsense Recipe Comparison

### Legend
- **Full parity** — Faultsense can express the same correctness check
- **Partial** — expressible with workarounds or missing some aspect
- **Gap** — cannot be expressed with current Faultsense capabilities

---

### 1. Login Success

**Playwright:**
```js
await page.fill('#email', 'user@test.com');
await page.fill('#password', 'valid');
await page.click('#login');
await expect(page).toHaveURL('/dashboard');
await expect(page.locator('.welcome')).toBeVisible();
```

**Faultsense:**
```html
<form fs-assert="auth/login" fs-trigger="submit"
  fs-assert-grouped=""
  fs-assert-route-success="/dashboard"
  fs-assert-added-error=".error-msg"
  fs-assert-timeout="5000">
```

**Status:** Full parity — UI-conditional assertions branch on which outcome appears. Route assertion verifies navigation.

**Note:** Faultsense doesn't control which user logs in. The conditional structure handles both outcomes from real users. The assertion fires for every user who submits the form.

---

### 2. Login Failure

**Playwright:**
```js
await page.fill('#email', 'invalid@test.com');
await page.fill('#password', 'wrong');
await page.click('#login');
await expect(page.locator('.error-msg')).toBeVisible();
await expect(page).toHaveURL('/login');
```

**Faultsense:** Same instrumentation as Recipe 1 — the `fs-assert-added-error=".error-msg"` conditional handles the failure case. When a real user enters bad credentials and the error message appears, that conditional wins and the success conditional is dismissed.

**Status:** Full parity

---

### 3. Form Validation (empty required fields)

**Playwright:**
```js
await page.click('#submit'); // submit without filling
await expect(page.locator('.field-error')).toHaveCount(3);
await expect(page.locator('#email-error')).toHaveText(/required/);
```

**Faultsense:**
```html
<form fs-assert="signup/validate" fs-trigger="submit"
  fs-assert-visible=".field-error[count-min=1][text-matches=required]">
```

**Status:** Full parity — `count-min` verifies multiple errors appeared, `text-matches` checks content.

---

### 4. Search Results

**Playwright:**
```js
await page.fill('#search', 'widget');
await expect(page.locator('.result-card')).toHaveCount(10);
```

**Faultsense:**
```html
<form fs-assert="search/execute" fs-trigger="submit"
  fs-assert-added=".result-card[count-min=1]">
```

**Status:** Full parity — `count-min` verifies results appeared.

---

### 5. Search with Autocomplete

**Playwright:**
```js
await page.fill('#search', 'wid');
await expect(page.locator('.suggestion')).toBeVisible();
await page.click('.suggestion:first-child');
await expect(page.locator('#search')).toHaveValue('widget');
```

**Faultsense:**
```html
<!-- Step 1: typing triggers suggestions — GAP: no "input" trigger -->
<!-- Step 2: clicking suggestion fills input -->
<div class="suggestion-list"
  fs-assert="search/select-suggestion"
  fs-trigger="click"
  fs-assert-updated="#search[value-matches=.{3,}]">
```

**Status:** Partial — can assert clicking a suggestion fills the input, but cannot trigger on typing (no `input` event trigger). **Gap: needs `fs-trigger="input"`.**

---

### 6. Add to Cart

**Playwright:**
```js
await page.click('.add-to-cart');
await expect(page.locator('#cart-count')).toHaveText('1');
```

**Faultsense:**
```html
<button fs-assert="cart/add-item" fs-trigger="click"
  fs-assert-updated="#cart-count[text-matches=\d+]">Add to Cart</button>
```

**Status:** Full parity

---

### 7. Remove from Cart

**Playwright:**
```js
const initialCount = await page.locator('.cart-item').count();
await page.click('.remove-item');
await expect(page.locator('.cart-item')).toHaveCount(initialCount - 1);
```

**Faultsense:**
```html
<button fs-assert="cart/remove-item" fs-trigger="click"
  fs-assert-removed=".cart-item">Remove</button>

<!-- OOB: verify count updated -->
<span id="cart-count"
  fs-assert="cart/count-updated"
  fs-assert-oob="cart/remove-item"
  fs-assert-visible="[text-matches=\d+]">
```

**Status:** Partial — can assert an item was removed and count updated, but cannot assert *relative* count change (N-1). Faultsense asserts the resulting state, not the delta.

---

### 8. Multi-Step Checkout

**Playwright:**
```js
await page.click('#next-step');
await expect(page.locator('.step-2')).toBeVisible();
await page.click('#next-step');
await expect(page.locator('.step-3')).toBeVisible();
await page.click('#place-order');
await expect(page.locator('.confirmation')).toBeVisible();
```

**Faultsense:**
```html
<!-- Each step is independent — no ordering guarantee -->
<button fs-assert="checkout/step-1-next" fs-trigger="click"
  fs-assert-visible=".step-2">Next</button>
<button fs-assert="checkout/step-2-next" fs-trigger="click"
  fs-assert-visible=".step-3">Next</button>
<button fs-assert="checkout/place-order" fs-trigger="click"
  fs-assert-added=".confirmation">Place Order</button>
```

**Status:** Partial — each step is asserted independently, but there's no way to assert the *sequence* was followed correctly. A user jumping from step 1 to step 3 via URL manipulation would satisfy the individual assertions. **Gap: needs `fs-assert-after` for sequential dependency.**

---

### 9. Modal Open/Close

**Playwright:**
```js
await page.click('#open-modal');
await expect(page.locator('.modal')).toBeVisible();
await page.click('.modal-close');
await expect(page.locator('.modal')).not.toBeVisible();
```

**Faultsense:**
```html
<button fs-assert="dialog/open" fs-trigger="click"
  fs-assert-added=".modal">Open</button>
<button class="modal-close" fs-assert="dialog/close" fs-trigger="click"
  fs-assert-removed=".modal">Close</button>
```

**Status:** Full parity

---

### 10. Toggle (Checkbox/Switch)

**Playwright:**
```js
await page.click('#dark-mode');
await expect(page.locator('#dark-mode')).toBeChecked();
```

**Faultsense:**
```html
<input id="dark-mode" type="checkbox"
  fs-assert="settings/toggle-dark-mode" fs-trigger="click"
  fs-assert-updated="[checked=true]">
```

**Status:** Full parity — `checked` modifier reads `.checked` property.

---

### 11. Accordion/Expand-Collapse

**Playwright:**
```js
await page.click('.accordion-header');
await expect(page.locator('.accordion-body')).toBeVisible();
await page.click('.accordion-header');
await expect(page.locator('.accordion-body')).not.toBeVisible();
```

**Faultsense:**
```html
<div class="accordion-header"
  fs-assert="faq/toggle-section" fs-trigger="click"
  fs-assert-grouped=""
  fs-assert-visible-open=".accordion-body"
  fs-assert-hidden-closed=".accordion-body">
```

**Status:** Full parity — conditional assertions handle both expand and collapse states.

---

### 12. Tab Navigation

**Playwright:**
```js
await page.click('[data-tab="settings"]');
await expect(page.locator('#settings-panel')).toBeVisible();
await expect(page.locator('#profile-panel')).not.toBeVisible();
```

**Faultsense:**
```html
<button data-tab="settings"
  fs-assert="tabs/switch-to-settings" fs-trigger="click"
  fs-assert-visible="#settings-panel">
```

**Status:** Full parity — `visible` confirms the correct panel is shown.

---

### 13. Infinite Scroll / Lazy Load

**Playwright:**
```js
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await expect(page.locator('.item')).toHaveCount(20); // 10 more loaded
```

**Faultsense:**
```html
<!-- GAP: no scroll trigger -->
<!-- Could use invariant to monitor count growth -->
<div class="feed"
  fs-assert="feed/items-present" fs-trigger="invariant"
  fs-assert-visible=".item[count-min=1]">
```

**Status:** Partial — invariant can verify items exist, but cannot trigger on scroll events. Cannot assert that scrolling *caused* more items to load. **Gap: needs scroll-based trigger or IntersectionObserver integration.**

---

### 14. Sorting a Table

**Playwright:**
```js
await page.click('th.name-col');
await expect(page.locator('td.name-col').first()).toHaveText('Alice');
```

**Faultsense:**
```html
<th class="name-col"
  fs-assert="table/sort-by-name" fs-trigger="click"
  fs-assert-updated="td.name-col[text-matches=\\w+]">Name</th>
```

**Status:** Partial — can assert content updated after sort click, but cannot assert *ordering* (that Alice comes before Bob). Faultsense checks that elements changed, not their relative order.

---

### 15. Filtering a List

**Playwright:**
```js
await page.selectOption('#category-filter', 'electronics');
await expect(page.locator('.product-card')).toHaveCount(5);
```

**Faultsense:**
```html
<select id="category-filter"
  fs-assert="products/filter-category" fs-trigger="change"
  fs-assert-updated=".product-card[count-min=1]">
```

**Status:** Full parity — `change` trigger + `count-min` verifies filtering produced results.

---

### 16. File Upload

**Playwright:**
```js
await page.setInputFiles('#file-input', 'photo.png');
await expect(page.locator('.preview-image')).toBeVisible();
await page.click('#upload-btn');
await expect(page.locator('.upload-success')).toBeVisible();
```

**Faultsense:**
```html
<input id="file-input" type="file"
  fs-assert="upload/file-selected" fs-trigger="change"
  fs-assert-visible=".preview-image">
<button id="upload-btn"
  fs-assert="upload/submit" fs-trigger="click"
  fs-assert-grouped=""
  fs-assert-added-success=".upload-success"
  fs-assert-added-error=".upload-error">Upload</button>
```

**Status:** Full parity — `change` on file input detects selection, conditional on upload button handles success/error.

---

### 17. Drag and Drop Reorder

**Playwright:**
```js
await page.dragAndDrop('.item:nth-child(1)', '.item:nth-child(3)');
await expect(page.locator('.item:nth-child(1)')).toHaveText('Item C');
```

**Faultsense:**
```html
<!-- GAP: no drag/drop trigger events -->
<!-- Could partially observe via mutation after drop -->
```

**Status:** Gap — no `dragstart`, `dragend`, or `drop` event triggers. Drag-and-drop is a complex multi-event sequence with no single trigger point in the current model. **Gap: needs drag event triggers.**

Note: Adding `drop` to `supportedEvents` would partially address this (assert post-drop state), but the full drag-and-drop flow verification requires sequence support.

---

### 18. Tooltip on Hover

**Playwright:**
```js
await page.hover('.info-icon');
await expect(page.locator('.tooltip')).toBeVisible();
```

**Faultsense:**
```html
<!-- GAP: no hover trigger -->
```

**Status:** Gap — `mouseenter`/`mouseover` are not in `supportedEvents`. **Gap: needs `fs-trigger="hover"`.**

---

### 19. Keyboard Shortcut

**Playwright:**
```js
await page.keyboard.press('Control+s');
await expect(page.locator('.save-indicator')).toBeVisible();
```

**Faultsense:**
```html
<!-- GAP: no keydown trigger -->
```

**Status:** Gap — no keyboard event triggers exist. **Gap: needs `fs-trigger="keydown:ctrl+s"`.**

---

### 20. Toast/Notification (auto-dismiss)

**Playwright:**
```js
await page.click('#save');
await expect(page.locator('.toast')).toBeVisible();
await expect(page.locator('.toast')).not.toBeVisible({ timeout: 5000 });
```

**Faultsense:**
```html
<button fs-assert="settings/save" fs-trigger="click"
  fs-assert-added=".toast">Save</button>

<!-- OOB: verify toast auto-dismisses -->
<div class="toast-container"
  fs-assert="settings/toast-dismissed"
  fs-assert-oob="settings/save"
  fs-assert-hidden=".toast"
  fs-assert-timeout="6000">
```

**Status:** Full parity — OOB chains the dismiss check after the toast appears. `hidden` + timeout verifies auto-dismiss.

---

### 21. Loading State (spinner → content)

**Playwright:**
```js
await page.click('#load-data');
await expect(page.locator('.spinner')).toBeVisible();
await expect(page.locator('.spinner')).not.toBeVisible();
await expect(page.locator('.data-table')).toBeVisible();
```

**Faultsense:**
```html
<button fs-assert="dashboard/load-data" fs-trigger="click"
  fs-assert-added=".data-table">Load Data</button>

<!-- OOB: verify spinner cleared after data loads -->
<div class="spinner-container"
  fs-assert="dashboard/spinner-cleared"
  fs-assert-oob="dashboard/load-data"
  fs-assert-hidden=".spinner">
```

**Status:** Partial — can assert the final state (data visible, spinner hidden) but cannot assert the *ordering* (spinner appeared first, then disappeared, then data appeared). The individual outcomes are verified but not the sequence. **Partial gap: full sequence needs `fs-assert-after`.**

---

### 22. Error Boundary / Fallback

**Playwright:**
```js
await page.evaluate(() => { throw new Error('Component crash'); });
await expect(page.locator('.error-fallback')).toBeVisible();
```

**Faultsense:**
```html
<!-- Primary assertion that may fail -->
<div fs-assert="feature/widget-render" fs-trigger="mount"
  fs-assert-visible=".widget-content"
  fs-assert-timeout="3000">

<!-- OOB on fail: verify fallback shown -->
<div class="error-fallback"
  fs-assert="feature/fallback-shown"
  fs-assert-oob-fail="feature/widget-render"
  fs-assert-visible="">
```

**Status:** Full parity — OOB-on-fail is designed exactly for this pattern.

---

### 23. Responsive Layout

**Playwright:**
```js
await page.setViewportSize({ width: 375, height: 667 });
await expect(page.locator('.sidebar')).not.toBeVisible();
await expect(page.locator('.hamburger')).toBeVisible();
```

**Faultsense:**
```html
<!-- No viewport control — observes whatever device the real user has -->
<!-- Invariant can check that layout is internally consistent -->
<nav fs-assert="layout/nav-consistent" fs-trigger="invariant"
  fs-assert-visible="#main-nav">
```

**Status:** Partial — can assert layout invariants (nav always visible) but cannot assert viewport-specific behavior (at 375px, sidebar hidden). This is a fundamental paradigm difference: Faultsense doesn't control the viewport. Real users on mobile devices *will* trigger the responsive layout naturally. An invariant verifies the result is correct on whatever device they're on.

---

### 24. Real-Time Update (WebSocket)

**Playwright:**
```js
await page.evaluate(() => ws.send(JSON.stringify({ type: 'new-message' })));
await expect(page.locator('.message')).toHaveCount(6);
```

**Faultsense:**
```html
<!-- Can observe the DOM outcome but not the WebSocket trigger -->
<div class="message-list"
  fs-assert="chat/messages-present" fs-trigger="invariant"
  fs-assert-visible=".message[count-min=1]">
```

**Status:** Partial — invariant can verify messages are always present, but cannot trigger an assertion on WebSocket message arrival. Cannot assert "when a new WS message arrives, a new `.message` element should be added." **Gap: needs custom event or WS interception.**

---

### 25. Undo Action

**Playwright:**
```js
await page.click('.delete-item');
await expect(page.locator('.undo-toast')).toBeVisible();
await page.click('.undo-btn');
await expect(page.locator('.deleted-item')).toBeVisible(); // restored
```

**Faultsense:**
```html
<button fs-assert="items/delete" fs-trigger="click"
  fs-assert-grouped=""
  fs-assert-removed-success=".item"
  fs-assert-added-error=".error-msg">Delete</button>

<!-- OOB: undo toast appears after successful delete -->
<div class="undo-toast"
  fs-assert="items/undo-toast"
  fs-assert-oob="items/delete"
  fs-assert-visible=".undo-toast">

<!-- Undo button assertion -->
<button class="undo-btn"
  fs-assert="items/undo-restore" fs-trigger="click"
  fs-assert-added=".item">Undo</button>
```

**Status:** Full parity — OOB chains the undo toast check, separate assertion on the undo button verifies restore. Each step is independently asserted. (Full *sequence* verification would need `fs-assert-after`.)

---

### 26. Pagination

**Playwright:**
```js
await page.click('.next-page');
await expect(page.locator('.page-indicator')).toHaveText('Page 2');
await expect(page.locator('.result-row')).toHaveCount(10);
```

**Faultsense:**
```html
<button class="next-page"
  fs-assert="results/paginate-next" fs-trigger="click"
  fs-assert-updated=".page-indicator[text-matches=Page \\d+]">Next</button>

<!-- OOB: verify results loaded -->
<div class="results-container"
  fs-assert="results/page-loaded"
  fs-assert-oob="results/paginate-next"
  fs-assert-visible=".result-row[count-min=1]">
```

**Status:** Full parity

---

### 27. Copy to Clipboard

**Playwright:**
```js
await page.click('.copy-btn');
const clipboard = await page.evaluate(() => navigator.clipboard.readText());
expect(clipboard).toBe('copied-text');
```

**Faultsense:**
```html
<!-- Can assert UI feedback, not clipboard content -->
<button class="copy-btn"
  fs-assert="share/copy-link" fs-trigger="click"
  fs-assert-added=".copied-feedback">Copy</button>
```

**Status:** Partial — can assert the UI feedback ("Copied!" tooltip/toast) but cannot verify actual clipboard content. This is acceptable — the UI feedback is the user-facing correctness signal.

---

### 28. Navigation Guard (unsaved changes)

**Playwright:**
```js
await page.fill('#editor', 'unsaved text');
await page.click('.nav-link');
await expect(page.locator('.unsaved-dialog')).toBeVisible();
```

**Faultsense:**
```html
<a class="nav-link"
  fs-assert="editor/nav-guard" fs-trigger="click"
  fs-assert-grouped=""
  fs-assert-added-dirty=".unsaved-dialog"
  fs-assert-route-clean="/other-page">
```

**Status:** Partial — can assert the dialog appears when navigating away (the `dirty` conditional), but cannot distinguish "user had unsaved changes" from "user had no changes." The conditional resolves based on whichever outcome happens first. This is actually the correct Faultsense model — for users who *do* have unsaved changes, the dialog should appear. **Full parity for the observable behavior.**

---

### 29. OAuth Redirect

**Playwright:**
```js
await page.click('#google-login');
await expect(page).toHaveURL(/accounts\.google\.com/);
// ... (mock or real OAuth)
await expect(page).toHaveURL('/dashboard');
```

**Faultsense:**
```html
<button id="google-login"
  fs-assert="auth/oauth-start" fs-trigger="click"
  fs-assert-route="/dashboard"
  fs-assert-mpa="true"
  fs-assert-timeout="15000">Login with Google</button>
```

**Status:** Full parity — MPA mode persists the assertion across the OAuth redirect, route assertion verifies the final destination. Timeout accounts for the multi-page OAuth flow.

---

### 30. Idle Timeout / Session Expiry

**Playwright:**
```js
await page.waitForTimeout(30000); // simulate idle
await expect(page.locator('.session-warning')).toBeVisible();
```

**Faultsense:**
```html
<!-- Invariant monitors for the warning to appear -->
<div class="session-container"
  fs-assert="auth/session-warning-shown" fs-trigger="invariant"
  fs-assert-visible=".session-warning">
```

**Status:** Full parity — invariant naturally catches the session warning whenever it appears, regardless of timing. This is actually *better* than Playwright's approach (which requires guessing the timeout duration).

---

### Recipe Gap Summary

| Status | Count | Recipes |
|--------|-------|---------|
| **Full parity** | 18 | Login success/failure, form validation, search, add/remove cart, modal, toggle, accordion, tabs, filtering, file upload, toast, error fallback, undo, pagination, copy feedback, OAuth, session expiry, nav guard |
| **Partial** | 8 | Autocomplete (no `input` trigger), cart remove (no delta), checkout (no sequence), sorting (no order check), lazy load (no scroll trigger), loading state (no sequence), responsive (no viewport control), WebSocket (no WS trigger) |
| **Gap** | 4 | Drag-and-drop (no drag events), tooltip on hover (no `hover` trigger), keyboard shortcut (no `keydown` trigger), real-time updates (no WS/custom event trigger) |

### Gaps Closed by Survivor Ideas

| Survivor Idea | Recipes It Would Close |
|---------------|----------------------|
| **#1 Expanded Triggers** | Tooltip (hover), keyboard shortcut (keydown), autocomplete (input), drag-and-drop (partial — drop event) |
| **#2 Multi-Step Sequences** | Checkout flow, loading state sequence |
| **#3 Focus Modifier** | — (no recipe explicitly tested focus, but would enable Playwright's `toBeFocused()` pattern) |
| **#4 Context Signals** | — (enables zero-server-integration conditional patterns) |
| **#5 Custom Events** | Real-time updates (WebSocket → CustomEvent bridge) |
| **#6 Attribute Regex** | — (strengthens existing modifier patterns) |

---

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Content Absence (empty/populated) | `count=0` and `count-min=1` already express this; API bloat for a semantic alias |
| 2 | CSS Transition/Animation Completion | Cosmetic concern, not semantic correctness; `transitionend` unreliable on interrupted transitions |
| 3 | Form State Snapshot (checked-count) | Per-element modifiers + OOB cover most cases; `form.checkValidity()` is narrow |
| 4 | fs-trigger="idle" | "Idle" is ambiguous and unreliable to detect; would generate false signals |
| 5 | Data attribute regex | Real gap but too incremental for standalone idea — folded into idea #6 (attribute regex) |
| 6 | Assertion Templates (fs-assert-ref) | Framework templating already solves attribute duplication in components |
| 7 | Implicit Trigger Inference | Makes API less explicit; harder to debug; undermines manual instrumentation moat |
| 8 | fs-trigger="mutation" | Overlaps with `invariant` and `mount`; use case too narrow |
| 9 | fs-assert-never | Semantically identical to `invariant` + `hidden`; redundant type |
| 10 | Selector-Free Mode improvements | Too incremental; risks breaking existing behavior |
| 11 | Scroll/Viewport Assertions | Low signal-to-noise in production; `visible` covers most cases |
| 12 | Download Assertions | No reliable JS signal for download initiation |
| 13 | Temporal Ordering ([before]/[after]) | Subsumed by multi-step sequential assertions which handle ordering more completely |
| 14 | Assertion Composition (AND/OR) | Over-engineered; OOB + conditionals cover multi-condition cases |
| 15 | Network Outcome (URL-pattern) | Conflicts with "UI is the signal" philosophy; context signals solve same problem better |
| 16 | Scope Assertions (multi-outcome) | Appealing DX but adds parsing complexity; OOB keeps assertions decoupled |

## Session Log
- 2026-03-27: v2 gap analysis — 24 raw ideas from 3 sub-agents (3 agents failed to API errors/timeout), ~22 after dedup, 6 survivors. Comprehensive 30-recipe Playwright comparison produced. 4 of 6 surviving ideas from v1 analysis are now implemented.
- 2026-03-28: All 6 survivors selected for brainstorming. User refinements: (1) assert-after is simple — check completed assertions map at trigger time; (2) context signals narrowed to online/offline + storage (URL covered by route); (3) assert-emitted should explore both assertion type and trigger; (4) attribute regex confirmed.
