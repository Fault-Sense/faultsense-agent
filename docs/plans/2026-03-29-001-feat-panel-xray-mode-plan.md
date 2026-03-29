---
title: "feat: Panel X-Ray Mode"
type: feat
status: active
date: 2026-03-29
origin: docs/brainstorms/2026-03-29-panel-xray-mode-requirements.md
---

# feat: Panel X-Ray Mode

## Overview

Add an X-Ray mode to the panel collector that overlays yellow dots on all instrumented elements and lets developers hover to inspect `fs-*` attributes directly in the panel — without opening DevTools. The panel gains a tab-based layout (Stream / X-Ray) and a toolbar toggle, keeping the assertion stream fully independent.

## Problem Statement

Developers instrumenting their app have no visual feedback about which elements carry `fs-*` attributes or what those attributes declare. They must use browser DevTools to find and read them. This slows instrumentation authoring and auditing. (see origin: `docs/brainstorms/2026-03-29-panel-xray-mode-requirements.md`)

## Proposed Solution

Extend `src/collectors/panel.ts` with three additions:

1. **Tab bar** below the header — Stream (default) and X-Ray tabs. Stream renders assertion rows as today. X-Ray shows the inspector view.
2. **Toolbar toggle** — an X-Ray icon in the header controls that activates/deactivates the dot overlay. Independent of tab selection.
3. **Dot overlay** — a separate Shadow DOM host element containing absolutely positioned yellow dots over every `[fs-assert]` element. Hovering a dot displays that element's `fs-*` attributes in the X-Ray tab.

## Technical Approach

### Architecture

All changes are confined to `src/collectors/panel.ts`. The panel collector remains a self-contained IIFE with zero imports from agent core (only `ApiPayload` from `types.ts`). No build config changes needed.

#### DOM Structure (updated)

```
#fs-panel-host (existing)
└── #shadow-root (open)
    ├── <style> (PANEL_CSS — extended)
    ├── .fs-panel
    │   ├── .fs-header
    │   │   ├── .fs-title ("FaultSense")
    │   │   └── .fs-controls
    │   │       ├── .fs-btn.fs-xray-toggle (X-Ray toggle — NEW)
    │   │       └── .fs-btn (minimize)
    │   ├── .fs-tabs (NEW)
    │   │   ├── .fs-tab[data-tab="stream"].active ("Stream")
    │   │   └── .fs-tab[data-tab="xray"] ("X-Ray")
    │   ├── .fs-tab-content[data-tab="stream"] (assertion rows — was .fs-body)
    │   └── .fs-tab-content[data-tab="xray"] (inspector view — NEW)
    └── .fs-badge (unchanged)

#fs-xray-host (NEW — separate element)
└── #shadow-root (open)
    ├── <style> (XRAY_CSS)
    └── .fs-xray-overlay (fixed, full viewport, pointer-events: none)
        └── .fs-xray-dot * N (absolute, pointer-events: auto)
```

#### Key Technical Decisions

**1. Dot overlay lives in a separate Shadow DOM host** (resolves deferred Q from origin R3)

A second host element `#fs-xray-host` with its own shadow root, appended to `document.body`. This follows the existing panel pattern, provides CSS isolation from the host page, and keeps dot cleanup independent. The overlay container is `position: fixed; inset: 0` with `pointer-events: none`; individual dots are `pointer-events: auto`.

**2. Pointer-events strategy: auto on dots with click forwarding** (resolves deferred Q from origin R3)

Dots use `pointer-events: auto` so they receive native `mouseenter`/`mouseleave` for the hover interaction. To avoid blocking app clicks, each dot listens for `click`/`mousedown`/`mouseup` and forwards them:

```
dot.style.display = 'none'
const realTarget = document.elementFromPoint(x, y)
dot.style.display = ''
realTarget.dispatchEvent(new MouseEvent(e.type, e))
```

This is the standard pattern used by browser DevTools overlays and React DevTools highlight.

**3. Self-contained element discovery** (resolves deferred Q from origin)

The panel collector runs its own `document.querySelectorAll('[fs-assert]')` and its own MutationObserver (observing `childList` + `subtree` on `document.body`). This keeps the panel fully decoupled from agent internals. The second MutationObserver has negligible overhead — browsers handle multiple observers efficiently.

**4. Detail card shows raw attributes + element identification** (resolves deferred Q from origin R4)

The hover detail card displays:
- Element tag name, id (if any), and first class (for identification context)
- All `fs-*` attributes as `name: value` pairs, grouped logically (key/trigger first, then types, then modifiers)

No parsing from agent core is imported. The panel reads attributes directly via `element.attributes` and filters for the `fs-` prefix.

**5. Scroll/resize repositioning via requestAnimationFrame** (resolves deferred Q from origin R8)

A single `scroll` listener (passive) and `resize` listener trigger a `requestAnimationFrame`-throttled repositioning pass. Each pass iterates visible dots, calls `getBoundingClientRect()` on the target element, and updates dot position. Dots whose targets are off-screen get `display: none`.

**6. Overlapping dots** (resolves deferred Q from origin R3)

No special handling for v1. Dots are small (10px) and positioned at the top-left corner of target elements. Overlapping is unlikely in practice and acceptable when it occurs — hovering any visible dot still works.

**7. Minimize hides dots, X-Ray state persists**

When the panel is minimized, the dot overlay is hidden (`display: none` on the overlay container). The `xrayActive` boolean is preserved. On restore, if X-Ray was active, dots reappear.

### Implementation Phases

#### Phase 1: Tab-Based Layout (R1, R6)

Refactor the panel body into a tabbed layout. The Stream tab contains the existing assertion rows. The X-Ray tab is initially empty.

**Files:** `src/collectors/panel.ts`

- Add `.fs-tabs` bar with two tab buttons below the header
- Wrap existing `panelBody` in `.fs-tab-content[data-tab="stream"]`
- Add `.fs-tab-content[data-tab="xray"]` container
- Tab switching: click handler toggles `.active` class and shows/hides content
- Stream tab is active by default
- CSS additions: tab bar styles, active tab indicator, tab content visibility
- Adjust `.fs-body` max-height to account for tab bar height (~32px)

**Acceptance criteria:**
- [ ] Two tabs visible: "Stream" and "X-Ray"
- [ ] Stream tab shows assertion rows as before (no behavioral change)
- [ ] Switching tabs toggles content visibility
- [ ] `panelBody` reference still works for `renderRow` (Stream content)

#### Phase 2: X-Ray Toggle + State (R2, R5)

Add the toolbar toggle button and the X-Ray tab's three content states.

**Files:** `src/collectors/panel.ts`

- Add `xrayActive: boolean = false` to module state
- Add X-Ray toggle button in `.fs-controls` (before minimize button)
- Toggle button: Unicode character or simple text icon (e.g., `⊙` or `X` in a circle), with `.active` class when on
- Click handler flips `xrayActive` and updates button appearance
- X-Ray tab content rendering based on state:
  - `xrayActive === false`: empty state with "Enable X-Ray to inspect instrumented elements" + enable button
  - `xrayActive === true`, not hovering: "Hover an element to inspect its assertions"
  - `xrayActive === true`, hovering: detail card (Phase 4)
- Enable button in empty state calls same toggle function as toolbar button

**Acceptance criteria:**
- [ ] Toggle button in toolbar enables/disables X-Ray mode
- [ ] Button shows active state when X-Ray is on
- [ ] X-Ray tab shows correct empty state when off
- [ ] X-Ray tab shows prompt text when on but not hovering
- [ ] Enable button in empty state activates X-Ray mode
- [ ] Toggling X-Ray does not switch active tab

#### Phase 3: Dot Overlay (R3, R7, R8)

Create the dot overlay and element discovery system.

**Files:** `src/collectors/panel.ts`

New module state:
- `xrayHostElement: HTMLElement | null`
- `xrayShadowRoot: ShadowRoot | null`
- `xrayOverlay: HTMLElement | null`
- `xrayObserver: MutationObserver | null`
- `dotMap: Map<Element, HTMLElement>` (target element → dot element)
- `rafId: number` (for scroll/resize repositioning)

Functions:

`createXrayOverlay()` — creates `#fs-xray-host`, attaches shadow root, inserts `XRAY_CSS`, creates the fixed overlay container.

`destroyXrayOverlay()` — removes `#fs-xray-host`, disconnects observer, cancels RAF, clears `dotMap`.

`scanElements()` — `document.querySelectorAll('[fs-assert]')`. For each element not already in `dotMap`, creates a dot. Removes dots for elements no longer in the DOM.

`positionDots()` — iterates `dotMap`, calls `getBoundingClientRect()` on each target, positions dot at top-left corner of the rect. Hides dots for off-screen or zero-size elements.

`startXray()` — called when `xrayActive` flips to true. Calls `createXrayOverlay()`, `scanElements()`, `positionDots()`. Sets up MutationObserver on `document.body` (`{ childList: true, subtree: true }`) that calls `scanElements()` + `positionDots()` on mutations. Adds scroll/resize listeners that trigger `requestAnimationFrame(positionDots)`.

`stopXray()` — called when `xrayActive` flips to false. Calls `destroyXrayOverlay()`.

Dot CSS:
```css
.fs-xray-dot {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #eab308; /* yellow-500 */
  border: 1.5px solid #ca8a04; /* yellow-600 */
  pointer-events: auto;
  cursor: crosshair;
  z-index: 1;
  box-shadow: 0 0 0 2px rgba(234, 179, 8, 0.3);
  transition: transform 0.1s ease;
}
.fs-xray-dot:hover {
  transform: scale(1.4);
}
```

Click forwarding on each dot:
```typescript
for (const eventType of ["click", "mousedown", "mouseup", "contextmenu"]) {
  dot.addEventListener(eventType, (e) => {
    e.stopPropagation();
    dot.style.display = "none";
    const realTarget = document.elementFromPoint(e.clientX, e.clientY);
    dot.style.display = "";
    if (realTarget) {
      realTarget.dispatchEvent(new MouseEvent(e.type, e));
    }
  });
}
```

**Acceptance criteria:**
- [ ] Yellow dots appear on all `[fs-assert]` elements when X-Ray is on
- [ ] Dots disappear when X-Ray is off
- [ ] Dots reposition on scroll and resize
- [ ] Off-screen dots are hidden
- [ ] Dynamically added elements get dots; removed elements lose dots
- [ ] Clicking through a dot reaches the underlying element
- [ ] Dots don't affect host page layout (no reflow)

#### Phase 4: Hover-to-Inspect (R4, R5)

Wire up dot hover events to the X-Ray tab's detail card.

**Files:** `src/collectors/panel.ts`

New module state:
- `hoveredElement: Element | null`

Each dot gets `mouseenter`/`mouseleave` handlers:
- `mouseenter`: set `hoveredElement` to the target element from `dotMap`, render detail card in X-Ray tab
- `mouseleave`: clear `hoveredElement`, show prompt text in X-Ray tab

`renderDetailCard(element: Element)` — reads all attributes from the element, filters for `fs-` prefix, renders into the X-Ray tab content area:

```
<div class="fs-xray-card">
  <div class="fs-xray-element">
    <button#submit-btn>
  </div>
  <div class="fs-xray-attrs">
    <div class="fs-xray-attr">
      <span class="fs-xray-attr-name">fs-assert</span>
      <span class="fs-xray-attr-value">checkout/submit</span>
    </div>
    <div class="fs-xray-attr">
      <span class="fs-xray-attr-name">fs-trigger</span>
      <span class="fs-xray-attr-value">click</span>
    </div>
    ...
  </div>
</div>
```

Attribute display order: `fs-assert` first, `fs-trigger` second, then assertion types (`fs-assert-*`), then modifiers (`fs-assert-timeout`, `fs-assert-mpa`, `fs-assert-mutex`), then OOB/sequence (`fs-assert-oob`, `fs-assert-oob-fail`, `fs-assert-after`).

**Acceptance criteria:**
- [ ] Hovering a dot shows detail card in X-Ray tab
- [ ] Card shows element tag, id, and class for identification
- [ ] Card shows all fs-* attributes with names and values
- [ ] Moving mouse off dot restores prompt text
- [ ] Attributes are displayed in logical order
- [ ] If X-Ray tab is not active when hovering, detail card renders silently (visible when user switches to X-Ray tab)

#### Phase 5: Minimize Integration + Cleanup

Wire up X-Ray state with the existing minimize/restore lifecycle.

**Files:** `src/collectors/panel.ts`

- Update `minimize()`: if `xrayActive`, hide the overlay (`xrayOverlay.style.display = 'none'`). Do not change `xrayActive`.
- Update `restore()`: if `xrayActive`, show the overlay, trigger `positionDots()` (positions may have changed while minimized).
- Update `cleanupPanel()`: call `destroyXrayOverlay()`, reset `xrayActive = false`, `hoveredElement = null`.
- Register cleanup for the xray host in the same cleanup hook.

**Acceptance criteria:**
- [ ] Minimizing hides dots, restoring brings them back
- [ ] X-Ray state persists across minimize/restore
- [ ] `cleanupPanel()` fully tears down X-Ray DOM and listeners
- [ ] Re-creation after cleanup works correctly

### Tests

**File:** `tests/collectors/panel.test.ts`

New test helpers:
- `getXrayHost()` — `document.getElementById("fs-xray-host")`
- `getXrayShadowRoot()` — xray host's shadow root
- `getXrayDots()` — `querySelectorAll(".fs-xray-dot")` in xray shadow root
- `getXrayToggle()` — `querySelector(".fs-xray-toggle")` in panel shadow root
- `getActiveTab()` — `querySelector(".fs-tab.active")` in panel shadow root
- `getTabContent(name)` — `querySelector(`.fs-tab-content[data-tab="${name}"]`)` in panel shadow root

New test groups:

```
describe("tab layout")
  - should show Stream and X-Ray tabs
  - should default to Stream tab active
  - should switch tab content on click
  - should render assertion rows in Stream tab (unchanged behavior)

describe("X-Ray toggle")
  - should add toggle button to toolbar
  - should default to inactive
  - should toggle xray state on click
  - should show active style when on

describe("X-Ray tab states")
  - should show empty state with enable button when X-Ray off
  - should activate X-Ray when empty state button clicked
  - should show prompt text when X-Ray on and not hovering

describe("dot overlay")
  - should create xray host when X-Ray enabled
  - should add dots for elements with fs-assert attribute
  - should remove xray host when X-Ray disabled
  - should update dots when elements added to DOM
  - should remove dots when elements removed from DOM

describe("hover-to-inspect")
  - should show detail card on dot mouseenter
  - should show element tag and id in card
  - should list all fs-* attributes
  - should clear card on dot mouseleave
  - should show prompt text after mouseleave

describe("minimize with X-Ray")
  - should hide overlay on minimize
  - should show overlay on restore if X-Ray was active
  - should not show overlay on restore if X-Ray was inactive

describe("cleanup with X-Ray")
  - should remove xray host on cleanup
  - should disconnect xray observer on cleanup
```

## Acceptance Criteria

- [ ] Panel has two tabs: Stream and X-Ray (R1)
- [ ] X-Ray toggle in toolbar enables/disables dot overlay (R2)
- [ ] Yellow dots appear on all `[fs-assert]` elements when active (R3)
- [ ] Hovering a dot shows fs-* attributes in X-Ray tab detail card (R4)
- [ ] X-Ray tab shows correct state for off / on-idle / on-hovering (R5)
- [ ] Stream tab unaffected by X-Ray mode (R6)
- [ ] Dots track dynamically added/removed elements (R7)
- [ ] Dots reposition on scroll/resize, hidden when off-screen (R8)
- [ ] Dots do not interfere with app clicks (click forwarding works)
- [ ] Minimize hides dots, restore brings them back
- [ ] Cleanup fully tears down all X-Ray DOM and listeners
- [ ] All existing panel tests continue to pass
- [ ] New tests cover all X-Ray functionality

## Scope Boundaries

Per origin document:
- No assertion status coloring on dots
- No click-to-pin or click-to-select on dots
- No filtering or search in X-Ray tab
- No editing of fs-* attributes
- No iframe support (dots only for elements in the top-level document)

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-29-panel-xray-mode-requirements.md](docs/brainstorms/2026-03-29-panel-xray-mode-requirements.md) — Key decisions carried forward: tabs over mode-switching, presence-only yellow dots, single-element hover focus (color-picker style).

### Internal References

- Panel collector: `src/collectors/panel.ts` (entire file — extending)
- Panel tests: `tests/collectors/panel.test.ts` (extending)
- Config constants: `src/config.ts:10-14` (attribute prefix patterns, referenced but not imported)
- Agent MutationObserver: `src/index.ts:67-76` (parallel observer pattern)
- Element discovery: `src/processors/elements.ts` (reference for fs-* attribute parsing, not imported)
- Build config: `package.json:34` (panel build command — no changes needed)
