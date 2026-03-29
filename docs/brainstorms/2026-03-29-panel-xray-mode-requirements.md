---
date: 2026-03-29
topic: panel-xray-mode
---

# Panel X-Ray Mode

## Problem Frame

Developers instrumenting their app with Faultsense have no way to visually audit which elements are instrumented or inspect what attributes are declared on them. They must view-source or use browser DevTools to find `fs-*` attributes. An X-Ray mode in the panel collector gives developers an at-a-glance overlay of all instrumented elements and a quick way to inspect their configuration without leaving the page.

## Requirements

- R1. **Tab-based panel layout.** The panel body gains two tabs: **Stream** (default, shows resolved assertions as today) and **X-Ray** (shows instrumentation inspector). Tabs are always visible regardless of X-Ray mode state.
- R2. **X-Ray toggle in toolbar.** A toolbar icon enables/disables X-Ray mode. When X-Ray mode is off, the icon is inactive. When on, the icon is active (visually distinct). Toggling X-Ray mode does not switch tabs automatically — the user controls which tab they view.
- R3. **Yellow dot overlay.** When X-Ray mode is on, a yellow dot/badge is positioned on every element in the page that has any `fs-*` attribute. Dots are presence-only indicators (always yellow, no status coloring). Dots must not interfere with the app's layout or event handling.
- R4. **Hover-to-inspect.** Hovering a yellow dot shows a detailed card in the X-Ray tab with all `fs-*` attributes declared on that element. The card displays attribute names and values in a readable format. Only one element is shown at a time (color-picker style — the panel reflects whatever the cursor is over).
- R5. **X-Ray tab states.** Three states:
  - **X-Ray off:** Empty state with prompt text and a button to enable X-Ray mode (clicking the button activates X-Ray mode, equivalent to clicking the toolbar toggle).
  - **X-Ray on, not hovering:** Prompt text: "Hover an element to inspect its assertions."
  - **X-Ray on, hovering a dot:** Detail card for that element.
- R6. **Stream independence.** The Stream tab continues to receive and display resolved assertions regardless of X-Ray mode or active tab. No buffering changes. Switching to the Stream tab while X-Ray is on works normally.
- R7. **Dynamic element tracking.** Dots must appear/disappear as elements with `fs-*` attributes are added to or removed from the DOM (MutationObserver). This handles SPA route changes and dynamically rendered content.
- R8. **Dot positioning.** Dots are positioned relative to their target element's bounding rect. They should reposition on scroll and resize. Dots for off-screen elements are not rendered (or hidden).

## Success Criteria

- A developer can toggle X-Ray mode, see all instrumented elements highlighted, hover any dot, and instantly see which `fs-*` attributes are on that element — without opening DevTools.
- The Stream tab is unaffected by X-Ray mode.
- Dots do not break page layout, steal clicks from underlying elements, or cause visual jank.

## Scope Boundaries

- No assertion status on dots (no green/red coloring). Status information lives in the Stream tab.
- No click-to-pin or click-to-select interaction on dots. Hover only.
- No filtering or search within the X-Ray tab.
- No editing of `fs-*` attributes from the panel.
- Dots overlay the host page, not the panel's Shadow DOM content.

## Key Decisions

- **Tabs over mode-switching:** The panel uses tabs (Stream / X-Ray) rather than replacing the assertion stream when X-Ray is active. This keeps the stream always accessible and avoids buffering complexity.
- **Presence-only dots:** Dots are always yellow. Encoding assertion status on dots would duplicate the Stream tab's role and add visual noise.
- **Single-element hover focus:** The X-Ray tab shows one element at a time on hover rather than listing all instrumented elements. Keeps the interaction simple and matches the color-picker mental model.

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] How should dots be rendered — a single overlay container with absolutely positioned markers, or individual elements attached near each target? Shadow DOM isolation considerations for the overlay.
- [Affects R4][Technical] What element metadata should the detail card include beyond raw `fs-*` attributes? (e.g., tag name, id, classes for identification context)
- [Affects R8][Technical] Throttling strategy for repositioning dots on scroll/resize to avoid layout thrashing.
- [Affects R3][Technical] How to handle overlapping dots when multiple instrumented elements are visually stacked.

## Next Steps

→ `/ce:plan` for structured implementation planning
