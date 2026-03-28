---
date: 2026-03-28
topic: expanded-trigger-set
---

# Expanded Trigger Set: hover, keydown, focus, input

## Summary

Add four new trigger types to the agent: `hover`, `keydown` (with key filtering), `focus`, and `input`. The event listener infrastructure already handles arbitrary DOM events — the commented-out events in `supportedEvents` (config.ts:64-81) confirm this was anticipated. The work is primarily in aliasing, trigger parsing, key filtering, and fixing a stale-assertion bug in the re-trigger path.

---

## 1. New Triggers

### 1.1 `hover`

**Trigger value:** `fs-trigger="hover"`
**DOM event:** `mouseenter` (not `mouseover`)

`mouseover` bubbles and fires repeatedly as the cursor moves over child elements. `mouseenter` fires once when the cursor enters the element's bounds and does not bubble. Since we listen in capture phase on `document`, `mouseenter` will work correctly — capture phase receives non-bubbling events at the document level.

**Use cases:**
- Tooltip content loaded correctly after hover
- Preview panel populated on hover
- Hover-triggered dropdown menus rendered

**Example:**
```html
<div class="product-card"
  fs-assert="catalog/preview-on-hover"
  fs-trigger="hover"
  fs-assert-visible=".product-preview[text-matches=\\$\\d+\\.\\d{2}]">
  Product Name
</div>
```

### 1.2 `keydown` (with key filtering)

**Trigger value:** `fs-trigger="keydown"` (any key) or `fs-trigger="keydown:KEY"` (filtered)
**DOM event:** `keydown`

The colon syntax introduces a **trigger filter**. The trigger attribute value is parsed as `eventType:filter`. For `keydown`, the filter is matched against `event.key` (case-insensitive for letters, exact for special keys like `Escape`, `Enter`, `ArrowDown`).

**Semantic role:** `keydown` is for **keyboard shortcuts and navigation** — where you care about which key was pressed, not about value changes. Use `input` (not `keydown`) for form field typing behavior.

**Modifier key syntax:** `ctrl+s`, `shift+Enter`, `alt+d`, `meta+k`. Modifiers are checked against `event.ctrlKey`, `event.shiftKey`, `event.altKey`, `event.metaKey`. Multiple modifiers can combine: `ctrl+shift+s`. The key itself is always the last segment after the final `+`.

**The full trigger filter string (including the key) is stored as the assertion's `trigger` field.** So `fs-trigger="keydown:Escape"` produces `assertion.trigger = "keydown:Escape"`, not just `"keydown"`. The collector sees the specific key that was expected.

**Parsing rules:**
1. Split `fs-trigger` value on `:` — left side is trigger name, right side is key filter
2. If key filter contains `+`, split on `+` — last segment is the key, preceding segments are modifiers
3. Modifier names: `ctrl`, `shift`, `alt`, `meta` (maps to Cmd on Mac, Win on Windows)
4. Key matching uses `event.key` — e.g., `Escape`, `Enter`, `Tab`, `ArrowDown`, `a`, `s`
5. Letter keys are case-insensitive (`s` matches both `s` and `S`; modifier check handles Shift separately)

**Use cases:**
- Escape closes a modal
- Enter submits an inline edit
- Keyboard shortcuts trigger actions (Ctrl+S saves)

**Examples:**
```html
<!-- Escape closes modal -->
<div class="modal"
  fs-assert="settings/close-on-escape"
  fs-trigger="keydown:Escape"
  fs-assert-removed=".modal-content">
</div>

<!-- Enter submits inline edit -->
<input class="inline-edit"
  fs-assert="todos/inline-edit-save"
  fs-trigger="keydown:Enter"
  fs-assert-updated=".todo-text" />

<!-- Ctrl+S triggers save -->
<div id="editor"
  fs-assert="editor/keyboard-save"
  fs-trigger="keydown:ctrl+s"
  fs-assert-visible=".save-confirmation">
</div>
```

### 1.3 `focus`

**Trigger value:** `fs-trigger="focus"`
**DOM event:** `focusin` (not `focus`)

`focus` does not bubble. `focusin` does. Since we register listeners on `document`, we need a bubbling event. The trigger alias maps `focus` → `focusin`.

**Use cases:**
- Focus on a search input reveals autocomplete dropdown
- Focus on a form field shows contextual help
- Skip-to-content link focuses the main content area

**Example:**
```html
<input id="search"
  fs-assert="search/autocomplete-ready"
  fs-trigger="focus"
  fs-assert-visible=".autocomplete-dropdown">
```

### 1.4 `input`

**Trigger value:** `fs-trigger="input"`
**DOM event:** `input`

Fires when the **value changes** in form controls. Covers typing, paste, autofill, voice input, emoji picker, drag-and-drop text. Fires AFTER the value has updated. Does NOT fire on keys that don't change the value (arrows, Shift, Ctrl, etc.).

**Semantic role:** `input` is for **form field behavior** — asserting that the UI responds correctly to value changes. This is distinct from `keydown` which is for keyboard shortcuts. Use `input` when you care that the value changed; use `keydown` when you care which key was pressed.

**Use cases:**
- Character counter updates as user types
- Live validation message appears/disappears
- Search-as-you-type results populate
- Autocomplete suggestions appear
- Format masking applies correctly

**Examples:**
```html
<!-- Character counter updates as user types -->
<textarea id="bio"
  fs-assert="profile/char-counter-update"
  fs-trigger="input"
  fs-assert-updated="#char-count[text-matches=\\d+/280]">
</textarea>

<!-- Search-as-you-type shows results -->
<input fs-assert="search/live-results" fs-trigger="input"
  fs-assert-visible=".search-results">

<!-- Autocomplete suggestions appear -->
<input fs-assert="address/autocomplete" fs-trigger="input"
  fs-assert-added=".suggestion-dropdown">

<!-- Real-time validation indicator -->
<input type="email" fs-assert="signup/email-feedback" fs-trigger="input"
  fs-assert-visible=".email-validation-icon">

<!-- Format masking (value-matches on self) -->
<input fs-assert="checkout/phone-format" fs-trigger="input"
  fs-assert-updated="[value-matches=^\\(\\d{3}\\) \\d{3}-\\d{4}$]">
```

---

## 2. Trigger Aliasing

### Current state

`eventTriggerAliases` (config.ts:84-86) maps event types to additional trigger names to check:

```ts
export const eventTriggerAliases: Record<string, string[]> = {
  error: ["load"],
};
```

In `handleEvent` (manager.ts:161): `const triggers = eventTriggerAliases[event.type] || [event.type]` — this maps the incoming DOM event type to the trigger name(s) to look for in `fs-trigger`.

### Single source of truth

Define `triggerEventMap` as the canonical map from developer-facing trigger names to DOM event names. Derive `eventTriggerAliases` from it:

```ts
/** Maps fs-trigger attribute values to actual DOM event names to register */
export const triggerEventMap: Record<string, string> = {
  hover: "mouseenter",
  focus: "focusin",
  error: "load",   // existing alias, now in the same map
};

// Derived: invert triggerEventMap for runtime lookup
export const eventTriggerAliases: Record<string, string[]> = {};
for (const [trigger, event] of Object.entries(triggerEventMap)) {
  if (!eventTriggerAliases[event]) eventTriggerAliases[event] = [event];
  eventTriggerAliases[event].push(trigger);
}
```

`supportedEvents` gets the actual DOM event names:

```ts
export const supportedEvents = [
  "click", "dblclick", "change", "blur", "submit", "load", "error",
  "mouseenter",  // hover trigger
  "focusin",     // focus trigger
  "input",
  "keydown",
];
```

`supportedTriggers` gets the developer-facing names:

```ts
export const supportedTriggers = [
  "mount", "unmount", "invariant",
  "hover", "focus",          // aliased triggers
  ...supportedEvents,        // direct triggers (click, keydown, input, etc.)
];
```

---

## 3. Key Filtering for `keydown`

### Trigger parsing

General trigger parsing function that extracts the base trigger and optional filter:

```ts
interface ParsedTrigger {
  base: string;       // "keydown", "hover", "click", etc.
  filter?: string;    // "Escape", "ctrl+s", undefined
}

function parseTrigger(raw: string): ParsedTrigger {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) return { base: raw };
  return {
    base: raw.substring(0, colonIdx),
    filter: raw.substring(colonIdx + 1),
  };
}
```

### Key filter matching

```ts
interface KeyFilter {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

function parseKeyFilter(filter: string): KeyFilter {
  const parts = filter.split("+");
  const key = parts.pop()!;
  return {
    key,
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    meta: parts.includes("meta"),
  };
}

function matchesKeyFilter(event: KeyboardEvent, filter: KeyFilter): boolean {
  const keyMatch = event.key.toLowerCase() === filter.key.toLowerCase();
  return (
    keyMatch &&
    event.ctrlKey === filter.ctrl &&
    event.shiftKey === filter.shift &&
    event.altKey === filter.alt &&
    event.metaKey === filter.meta
  );
}
```

### Where filtering runs

Key filtering happens during element processing, before assertion creation. The flow:

1. `handleEvent` receives a `keydown` event
2. `isProcessableElement` parses the trigger base to match against the event type
3. If the trigger has a key filter, check it against the event — if it doesn't match, the element is not processable (no assertion created)
4. The full trigger value (including filter) is stored as `assertion.trigger`

---

## 4. Impact on `isProcessableElement`

Current implementation (elements.ts:211-221):

```ts
function isProcessableElement(element: HTMLElement, triggers: string[]): boolean {
  if (element.hasAttribute(assertionTriggerAttr)) {
    return triggers.includes(
      element.getAttribute(assertionTriggerAttr) as string
    );
  }
  return false;
}
```

This does an exact string match: `triggers.includes("keydown:Escape")` would fail because `triggers` contains `["keydown"]`.

**Required change:** Parse the element's `fs-trigger` value to extract the base trigger, then match against the base. The full trigger value (including filter) is preserved — it flows into the assertion's `trigger` field via `parseAssertions` → `processDetails`.

```ts
function isProcessableElement(
  element: HTMLElement,
  triggers: string[],
  event?: Event
): boolean {
  const raw = element.getAttribute(assertionTriggerAttr);
  if (!raw) return false;
  const { base, filter } = parseTrigger(raw);
  if (!triggers.includes(base)) return false;

  // Key filter check: only create assertion if the key matches
  if (filter && event instanceof KeyboardEvent) {
    return matchesKeyFilter(event, parseKeyFilter(filter));
  }

  return true;
}
```

The `event` parameter is optional — only passed in event mode (from `handleEvent`). Mount/invariant processing doesn't pass an event.

---

## 5. Prerequisite: Fix Stale Re-Trigger Resolution

### The problem

High-frequency triggers (`input`, `hover`, unfiltered `keydown`) expose a bug in the existing re-trigger path. When an event fires on an element that already has a pending assertion (`manager.ts:107-110`):

```ts
} else if (existingAssertion && isAssertionPending(existingAssertion)) {
  // Re-trigger on a pending assertion — track the attempt timestamp
  if (!existingAssertion.attempts) existingAssertion.attempts = [];
  existingAssertion.attempts.push(Date.now());
}
```

The **only** thing that happens is a timestamp gets pushed. No re-evaluation. The assertion goes stale.

**Concrete failure case:**

```html
<input fs-assert="search/valid-input" fs-trigger="input"
  fs-assert-visible="[value-matches=.{3,}]">
```

1. User types "a" → assertion created → `immediateResolver` checks → value "a" doesn't match → stays pending
2. User types "b" → re-trigger → `attempts.push(Date.now())` → **no re-evaluation**
3. User types "c" → re-trigger → value is now "abc" which matches, but nothing checks it
4. GC eventually fails the assertion

This is a general bug — not specific to new triggers — but low-frequency triggers (`click`, `change`) rarely expose it because the assertion usually resolves on the first event or via a subsequent DOM mutation.

### The fix

On re-trigger of a pending assertion, also run `checkImmediateResolved`:

```ts
} else if (existingAssertion && isAssertionPending(existingAssertion)) {
  if (!existingAssertion.attempts) existingAssertion.attempts = [];
  existingAssertion.attempts.push(Date.now());
  checkImmediateResolved(existingAssertion);  // <-- re-evaluate
}
```

And extend `checkImmediateResolved` to handle all DOM assertion types (currently only handles `visible`/`hidden`/`route`):

```ts
const checkImmediateResolved = (assertion: Assertion): void => {
  Promise.resolve().then(() => {
    if (isAssertionPending(assertion)) {
      let deferredResult: CompletedAssertion | null = null;

      // Check any DOM assertion against current document state
      if (domAssertions.includes(assertion.type)) {
        const documentResults = immediateResolver([assertion], config);
        if (documentResults.length > 0) {
          deferredResult = documentResults[0];
        }
      }

      if (assertion.type === "route") {
        const routeResults = routeResolver([assertion], config);
        if (routeResults.length > 0) {
          deferredResult = routeResults[0];
        }
      }

      if (deferredResult) {
        settle([deferredResult]);
      }
    }
  });
};
```

**Performance:** One `document.querySelector` + modifier evaluation per re-trigger, deferred to microtask. For `input` at ~30 events/sec, this is negligible for a single assertion check. The microtask batching means multiple re-triggers in the same frame coalesce naturally.

**This fix should be implemented regardless of whether the new triggers are added.** It's a correctness bug in the existing re-trigger path that happens to be masked by low event frequency.

---

## 6. Noise Mitigation

### `input` events

The `input` event fires on every value change. But the existing re-trigger mechanism already collapses rapid-fire triggers: the first `input` creates the assertion, subsequent `input` events on the same element hit the re-trigger path (record attempt + re-evaluate). No new assertions pile up.

With the re-trigger fix from Section 5, each re-trigger also re-evaluates the assertion. If it now passes, it settles. If not, it stays pending with an updated `attempts[]`.

**No agent-level debouncing needed.** The re-trigger path is the natural debounce.

### `hover` events

`mouseenter` does not bubble and fires once per element entry. Well-behaved by default. The concern is hover over many elements in a list (50 product cards with `fs-trigger="hover"`).

**Document that hover assertions on list items create one assertion per hovered item.** Each hover is a distinct user intent. GC sweep cleans up unresolved ones.

### `focus` events

Low noise. Users focus one element at a time. No special mitigation needed.

### Unfiltered `keydown`

`fs-trigger="keydown"` (no filter) fires on every keypress. Same re-trigger behavior as `input` — recommend filtered keydown for most use cases, document the volume implications for unfiltered.

---

## 7. Implementation Plan

### Step 1: Trigger parsing utility

Create `src/utils/triggers.ts`:
- `parseTrigger(raw: string): ParsedTrigger`
- `parseKeyFilter(filter: string): KeyFilter`
- `matchesKeyFilter(event: KeyboardEvent, filter: KeyFilter): boolean`

### Step 2: Fix re-trigger resolution (prerequisite)

In `manager.ts`:
- Add `checkImmediateResolved(existingAssertion)` to the pending re-trigger branch
- Extend `checkImmediateResolved` to handle all DOM assertion types

### Step 3: Config changes

- Add `mouseenter`, `focusin`, `input`, `keydown` to `supportedEvents`
- Add `triggerEventMap` as single source of truth
- Derive `eventTriggerAliases` from `triggerEventMap`
- Add `hover`, `focus` to `supportedTriggers`

### Step 4: Update `isProcessableElement`

- Parse trigger value to extract base before matching
- Accept optional `Event` parameter for key filter checking
- Store full trigger value (with filter) on assertion's `trigger` field

### Step 5: Wire event parameter through event processing

- Pass `event` from `handleEvent` through `eventProcessor` to `isProcessableElement`

### Step 6: Cleanup verification

- The cleanup function already iterates `supportedEvents` to remove listeners — no change needed

### Step 7: Tests

- Trigger parsing: `parseTrigger("keydown:Escape")` → `{ base: "keydown", filter: "Escape" }`
- Key filter parsing: `parseKeyFilter("ctrl+shift+s")` → `{ key: "s", ctrl: true, shift: true, ... }`
- Key filter matching against KeyboardEvent mocks
- `isProcessableElement` with filtered triggers
- Integration: `hover` trigger fires on `mouseenter`
- Integration: `focus` trigger fires on `focusin`
- Integration: `keydown:Escape` only creates assertion when Escape is pressed
- Integration: `input` triggers re-evaluate on subsequent keystrokes
- Re-trigger re-evaluation: pending assertion resolves on second event when condition is now met

---

## 8. Open Questions

1. **Should `hover` also register `mouseleave` for cleanup?** If a user hovers a card and the assertion doesn't resolve, hovering away doesn't cancel it — GC handles it eventually. Is that sufficient?

2. **Key filter: strict modifier matching?** Current spec requires exact modifier match (`ctrl+s` fails if Shift is also held). Is this correct, or should extra modifiers be ignored?

3. **`mouseenter` capture phase behavior:** Verify across browsers that capture-phase `mouseenter` on `document` fires correctly. MDN confirms it should, but test in Safari/Firefox.
