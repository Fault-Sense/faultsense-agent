---
date: 2026-03-28
topic: context-signals
---

# Client-Side Context Signals: Online/Offline Triggers + Storage Modifiers

## Problem Frame

Faultsense assertions currently trigger on user actions (clicks, submits), lifecycle events (mount, unmount), and continuous monitoring (invariant). Two gaps remain in the trigger model: (1) network connectivity changes — the app goes offline or comes back online, and the UI should reflect that; (2) client-side storage state — an action should persist data to localStorage/sessionStorage, and assertions have no way to verify that. These are context signals that gate or enrich assertions without requiring server-side integration.

URLs are already covered by `fs-assert-route` and are out of scope here.

---

## Part 1: Online/Offline Triggers

### Requirements

- R1. **`fs-trigger="online"` and `fs-trigger="offline"`** — Two new trigger values. Elements with these triggers create assertions when the browser's network state changes. `online` fires when connectivity is restored (`navigator.onLine` transitions to `true`). `offline` fires when connectivity is lost (`navigator.onLine` transitions to `false`).

- R2. **Window-level event registration** — `online` and `offline` are `window` events, not `document` events. They cannot go through the existing `supportedEvents` + `document.addEventListener` + `handleEvent` path because `handleEvent` guards on `event.target instanceof HTMLElement` (manager.ts:158). Instead, register `window.addEventListener('online', ...)` and `window.addEventListener('offline', ...)` separately in `init()`, alongside the existing `pagehide`/`beforeunload` listeners.

- R3. **Handler implementation** — On `online`/`offline` fire, query the DOM for all elements with the matching trigger (`document.querySelectorAll('[fs-trigger="online"]')` or `'[fs-trigger="offline"]'`) and call `assertionManager.processElements(elements, ["online"])` (or `["offline"]`). This mirrors how `mount`/`load`/`invariant` elements are processed on init (index.ts:71-78) — no changes to the element processor or assertion pipeline needed.

- R4. **Initial state check** — On agent init, if `navigator.onLine === false`, immediately process all `fs-trigger="offline"` elements. This handles the case where the page loads while already offline (the `offline` event won't fire because the state didn't change). Conversely, do NOT auto-process `online` elements on init even if `navigator.onLine === true` — online is the default expected state and auto-firing would create noise. Online triggers should only fire on a *recovery* transition.

- R5. **Add to `supportedTriggers`** — Add `"online"` and `"offline"` to the `supportedTriggers` array in config.ts (line 88) so the element processor accepts them. Do NOT add them to `supportedEvents` — they are not document-level DOM events and should not go through `handleEvent`.

- R6. **Cleanup** — The cleanup function returned by `init()` must remove the `online`/`offline` window listeners.

### Usage Examples

```html
<!-- Offline banner: assert it becomes visible when connectivity drops -->
<div id="offline-banner" class="hidden"
  fs-assert="connectivity/offline-banner"
  fs-trigger="offline"
  fs-assert-visible="#offline-banner">
  You are offline
</div>

<!-- Reconnection recovery: assert dashboard reloads on reconnect -->
<div id="dashboard"
  fs-assert="connectivity/dashboard-recovery"
  fs-trigger="online"
  fs-assert-updated="#dashboard[text-matches=.+]"
  fs-assert-timeout="5000">
</div>

<!-- Offline-capable feature: assert local save works while offline -->
<button
  fs-assert="docs/offline-save"
  fs-trigger="click"
  fs-assert-added=".save-confirmation">
  Save Draft
</button>
<!-- Separate OOB: verify the offline indicator stays visible during save -->
<div id="offline-indicator"
  fs-assert="docs/offline-indicator-persists"
  fs-assert-oob="docs/offline-save"
  fs-assert-visible="#offline-indicator">
</div>
```

### Implementation Notes

The change is small — roughly:
1. Two entries in `supportedTriggers` (config.ts)
2. Two `window.addEventListener` calls in `init()` with handlers that call `processElements` (index.ts)
3. An initial `navigator.onLine === false` check in `init()` (index.ts)
4. Corresponding cleanup in the teardown function (index.ts)

No changes to the assertion manager, element processor, resolvers, or types.

---

## Part 2: Storage Modifiers

### Context

Client-side storage (localStorage, sessionStorage) is a critical persistence layer for SPAs and offline-capable apps. After a user action (add to cart, save draft, toggle preference), the correct outcome often includes data being written to storage. Currently, Faultsense can only verify DOM outcomes — it has no visibility into whether storage was correctly updated.

### Approach A: Inline Modifier (`[storage=key:pattern]`)

```html
<button fs-assert="cart/add-item" fs-trigger="click"
  fs-assert-updated="#cart-count[storage=cart_items:.+]">
  Add to Cart
</button>
```

A new inline modifier checked at resolution time alongside existing modifiers (text-matches, classlist, etc.).

**Parse/resolve integration:**
- Add `"storage"` to `inlineModifiers` array in config.ts (line 49).
- Add a `storage` entry in `modifiersMap` in resolvers/dom.ts (line 75). The modifier function reads `localStorage.getItem(key)` and tests against the pattern.
- Value format: `key:pattern` where key is the storage key and pattern is a regex. Colon-delimited because `=` is already the modifier key/value separator.

**Interception requirements:**
- None for this approach. The modifier is a point-in-time check at resolution — it reads storage when the DOM assertion resolves. No need to intercept `setItem` because we're checking state, not observing writes.

**Composition with existing features:**
- Works with any assertion type that goes through `modifiersMap` (added, removed, updated, visible, hidden, stable).
- Works with conditionals: `fs-assert-updated-success="#count[storage=cart_items:.+]"`.
- Works with OOB: storage check runs when OOB assertion resolves.
- Self-referencing works: `fs-assert-updated="[storage=cart_items:.+]"` checks the element itself + storage.

**Pros:**
- Minimal implementation — one new modifier function, one config entry.
- No interception needed — pure read at resolution time.
- Composes naturally with all existing features.
- Familiar syntax — same bracket notation as text-matches, classlist.

**Cons:**
- Race condition risk: DOM may update before storage write completes (or vice versa). The modifier checks storage at the moment the DOM assertion resolves, which might be too early.
- No standalone storage assertion — storage is always subordinate to a DOM change.
- Can't assert storage was cleared (key removed) vs. never set — both return `null`.

### Approach B: Condition Key Pattern (`storage-{key}` as condition key)

```html
<button fs-assert="cart/add-item" fs-trigger="click"
  fs-assert-grouped=""
  fs-assert-added-persisted=".cart-items[storage=cart_items:.+]"
  fs-assert-added-transient=".cart-items">
  Add to Cart
</button>
```

**Parse/resolve integration:**
- Reuses the existing conditional assertion system. `persisted` and `transient` are just freeform condition keys.
- The storage check is still an inline modifier (same as Approach A), but the conditional structure lets you distinguish "added with storage" vs "added without storage."

**Interception requirements:**
- Same as Approach A — none. Modifier reads storage at resolution time.

**Composition:**
- This is really just Approach A with conditionals layered on top. The condition key pattern doesn't change the storage mechanism — it's orthogonal.

**Pros:**
- Lets you express "persisted vs. transient" as mutually exclusive outcomes.

**Cons:**
- Overloads condition keys for something that isn't really a conditional outcome — it's a modifier check. The assertion either has the item in storage or it doesn't; that's not the same as "success vs. error."
- Requires `fs-assert-grouped` and doubles the assertion count for what's really a single check.
- Misleading semantics: condition keys represent UI outcome branches (dashboard appeared vs. error appeared). Storage presence isn't an outcome branch — it's a verification on a single outcome.

### Approach C: Storage as Its Own Assertion Type (`fs-assert-stored`)

```html
<button fs-assert="cart/item-persisted" fs-trigger="click"
  fs-assert-stored="localStorage:cart_items[value-matches=.+]">
  Add to Cart
</button>
```

**Parse/resolve integration:**
- New assertion type `stored` added to the type system (types.ts, config.ts).
- New resolver (`resolvers/storage.ts`) that checks storage state.
- Value format: `storageType:key[modifiers]` where storageType is `localStorage` or `sessionStorage`.
- Reuse existing modifier infrastructure for `value-matches` on the storage value (treat the stored string as the "element" for modifier checking — would need adapter).

**Interception requirements:**
- To detect storage changes reactively (like `updated` detects DOM mutations), this would need `Storage.prototype.setItem`/`removeItem` interception. Without interception, the resolver must poll or check on a timer — which conflicts with the "assertions resolve naturally" model.
- Cross-tab `storage` events only fire for changes from OTHER tabs, not the current tab. Same-tab detection requires interception.

**Composition:**
- Works as a standalone assertion type alongside DOM assertions.
- Can use conditionals: `fs-assert-stored-success="localStorage:token[value-matches=.+]"` + `fs-assert-added-error=".error-msg"`.
- Can be used with OOB.

**Pros:**
- Clean separation: storage assertions are first-class, not bolted onto DOM assertions.
- Can assert storage independently of DOM changes.
- Could support `removed`-like semantics (key was deleted).

**Cons:**
- Significant implementation surface: new type, new resolver, storage interception, adapter for modifiers.
- The `setItem` interception pattern (proxy `Storage.prototype.setItem`) is fragile — some environments freeze Storage prototypes, and it must be installed before any application code runs.
- Overengineered for v1 — most storage assertions pair with a DOM change anyway.
- Modifier reuse is awkward: `value-matches` is designed for `HTMLElement.value`, not arbitrary strings. Would need a shim or separate modifier set.

### Recommendation: Approach A (Inline Modifier)

**Rationale:**

Approach A wins on simplicity, composability, and alignment with the existing architecture. The core insight: storage state is a *verification on an outcome*, not an outcome itself. The user action produces a DOM change (the cart count updates) AND a side effect (storage is written). The DOM change is the primary signal; storage correctness is a secondary check — exactly what modifiers are for.

Approach C is the right answer if storage assertions need to stand alone (assert storage without any DOM change). That's a real use case but a rare one, and the implementation cost is high. If standalone storage assertions become necessary later, Approach C can be added without conflicting with Approach A — they serve different purposes.

Approach B is not recommended — it misuses condition keys for something that isn't a conditional outcome.

**Proposed modifier syntax:**

```
[storage=key:pattern]                    — localStorage (default), regex match
[storage=session:key:pattern]            — sessionStorage, regex match
[storage=key]                            — assert key exists (non-null)
[storage-absent=key]                     — assert key does NOT exist (is null)
```

The `storage` modifier key goes into `inlineModifiers` (config.ts) and `modifiersMap` (resolvers/dom.ts). `storage-absent` is a separate modifier for the negation case. Both are point-in-time reads at resolution — no interception.

### Storage Interception (Deferred)

If timing issues arise (DOM resolves before storage write), a `Storage.prototype.setItem` interceptor can be added later to trigger re-checks. The interceptor would follow the same pattern as `interceptNavigation` (navigation.ts):

```typescript
export function interceptStorage(handler: (key: string) => void): () => void {
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key: string, value: string) {
    originalSetItem.call(this, key, value);
    handler(key);
  };
  return () => { Storage.prototype.setItem = originalSetItem; };
}
```

This is explicitly deferred — not part of v1. Point-in-time reads at DOM resolution time will cover the majority of cases because frameworks typically update storage and DOM in the same synchronous block or microtask.

### Edge Cases

- **Storage quota exceeded** — `setItem` throws `QuotaExceededError`. The modifier should catch this and treat the assertion as a storage check failure (the value wasn't persisted), not an agent error.
- **Private browsing / storage disabled** — Some browsers throw on `localStorage` access in private mode. The modifier must wrap `getItem` in a try/catch. If storage is inaccessible, the modifier fails (storage condition not met) with a descriptive failure reason.
- **sessionStorage vs localStorage** — Both supported via the `session:` prefix. Default is localStorage since it's the more common persistence target.
- **Cross-tab storage events** — The browser `storage` event fires only for changes from other tabs. Not relevant for v1 (point-in-time reads), but relevant if interception is added later — the interceptor handles same-tab writes, and `window.addEventListener('storage', ...)` could handle cross-tab writes.
- **JSON values** — Storage values are always strings. Pattern matching via regex handles JSON (e.g., `[storage=cart_items:\[.+\]]` matches a non-empty JSON array). No JSON parsing in the modifier — keep it simple.
- **Key naming collisions** — The colon delimiter in `key:pattern` means storage keys containing colons need escaping or a different delimiter. Colons in storage keys are rare but possible. If this becomes an issue, switch to a pipe delimiter or allow quoting.

### What NOT to Build

- **Cookie assertions** — `document.cookie` is a semicolon-delimited string with no change events. Parsing is fragile, httpOnly cookies are invisible to JS, and SameSite/Secure flags add complexity. Cookies are a server concern; storage is a client concern.
- **IndexedDB assertions** — Async API, complex schema, transaction model. Way too much surface area. If users need IndexedDB verification, they should use a custom collector function.
- **Storage event triggers** — Don't add `fs-trigger="storage"` as a trigger type. Storage changes are side effects of user actions, not user actions themselves. The right model is: trigger on the action, verify storage as a modifier on the outcome.

---

## Success Criteria

- `fs-trigger="online"` and `fs-trigger="offline"` create assertions on connectivity state changes
- Offline elements are auto-processed on init if `navigator.onLine === false`
- Online/offline listeners are properly cleaned up on teardown
- `[storage=key:pattern]` modifier checks localStorage at DOM resolution time
- `[storage=session:key:pattern]` modifier checks sessionStorage
- `[storage-absent=key]` modifier verifies a key does not exist
- Storage access failures (quota, private browsing) produce modifier failures, not agent errors
- No `Storage.prototype` interception in v1

## Scope Boundaries

- No URL gates (covered by `fs-assert-route`)
- No cookie or IndexedDB support
- No storage triggers (storage is a modifier, not a trigger)
- No `Storage.prototype.setItem` interception in v1 — point-in-time reads only
- No storage-only assertion type (Approach C) — storage is always paired with a DOM assertion via modifier

## Key Decisions

- **Online/offline are window-level triggers** processed via `querySelectorAll` + `processElements`, not through `handleEvent`. Same pattern as mount/load/invariant initial processing.
- **Storage is a modifier, not an assertion type.** Storage state is a secondary verification on a DOM outcome. Modifiers are the right abstraction.
- **Point-in-time reads, no interception.** Storage is checked when the DOM assertion resolves. Interception is deferred until timing issues prove this insufficient.
- **localStorage is the default.** `session:` prefix opts into sessionStorage. Mirrors how most apps use storage.

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Technical] Should online/offline handlers debounce? Flaky connections can produce rapid online/offline oscillation. A short debounce (e.g., 500ms) would prevent assertion spam, but adds complexity and delays legitimate triggers.
- [Affects Approach A][Technical] The colon delimiter in `[storage=key:pattern]` conflicts with storage keys that contain colons. Is this a real-world concern? If so, should we use a different delimiter (pipe `|`) or support quoting?
- [Affects Approach A][Technical] Should `[storage=key]` (existence check, no pattern) match empty strings? `localStorage.getItem(key)` returns `""` for explicitly-set empty values vs `null` for unset keys. Proposed: existence check passes for any non-null value, including empty string.

## Next Steps

-> `/ce:plan` for structured implementation planning
