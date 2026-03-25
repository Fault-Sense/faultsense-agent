---
date: 2026-03-24
topic: faultsense-chrome-extension
---

# Faultsense Chrome Extension

## Problem Frame

There is no zero-install way to experience faultsense on a real website. Every prospect must read docs, instrument their own HTML, and set up a collector before seeing a single assertion fire. A Chrome extension that injects the agent onto any page — bypassing CSP restrictions that block bookmarklets — collapses "curious" to "seeing assertions on my own app" in under 60 seconds.

## Requirements

- R1. A Chrome extension (Manifest V3) that injects `faultsense-agent.min.js` and `faultsense-panel.min.js` into the current page when the user clicks the toolbar icon. Initializes the agent with the panel collector and opens the panel.
- R2. The panel collector gains an "Instrument" mode: a toggle button in the panel header that activates element selection on the page. When active, clicking any element opens an inline form in the panel to configure an assertion for that element.
- R3. The instrumentation form collects: assertion key (auto-suggested from element context), trigger event (defaulted from element type — click for buttons, submit for forms), assertion type (dropdown: added, removed, updated, visible, hidden, loaded), target selector (text input), and optional modifiers (text-matches, classlist, timeout).
- R4. Submitting the form sets the corresponding `fs-*` attributes on the selected element in the live DOM. The agent's MutationObserver picks up the new attributes, and subsequent triggers fire assertions that appear in the panel.
- R5. Works on any website including sites with strict Content Security Policy, because the agent is injected via a content script (not an external `<script>` tag).
- R6. If faultsense is already loaded on the page, the extension skips injection and activates Instrument mode on the existing panel.
- R7. During element selection mode, a visual highlight (outline or overlay) appears on the element under the cursor to indicate what will be selected.
- R8. Clicking the toolbar icon again on a page where faultsense is active toggles the panel visibility.

## Success Criteria

- A developer installs the extension, navigates to any website (including production sites with strict CSP), clicks the toolbar icon, instruments a button in under 30 seconds, clicks the button, and sees the assertion result in the panel.
- The entire experience works without DevTools open, without a backend collector, and without modifying source code.
- Works on localhost, staging, and any public website regardless of CSP policy.

## Scope Boundaries

- No AI-assisted suggestion or auto-instrumentation — the user manually chooses what to assert.
- No persistence of injected attributes across page reload. This is a try-it tool, not a production workflow.
- No export/copy of generated attributes to clipboard (nice-to-have for later, not v1).
- Chrome only for v1. No Firefox/Safari/Edge extension ports.
- The extension lives in the agent repo (e.g., `extension/` directory). The Instrument mode lives in the panel collector source.
- No changes to the core agent — only the panel collector and the new extension.
- No Chrome Web Store submission for v1 — loaded as an unpacked extension during development. Store submission is a follow-up.

## Key Decisions

- **Chrome extension over bookmarklet**: Bookmarklets are blocked by CSP on many production sites. The extension's content script injection bypasses CSP entirely, making "try it on any website" an honest claim.
- **Instrument mode inside the panel**: One Shadow DOM container, one floating widget. The panel is both the results view and the instrumentation tool.
- **Form-based, not wizard-based**: User fills in fields (with smart defaults), not a multi-step point-and-click flow. Simpler to build, teaches the attribute API directly.
- **Unpacked extension for v1**: Skip the Chrome Web Store review process. Developers can load the extension from the repo. Store submission is a follow-up when the UX is validated.

## Dependencies / Assumptions

- The panel collector must be extended with the Instrument mode UI — this is the bulk of the work and is shared with any future bookmarklet/injection approach.
- R6 requires the panel collector to expose a way to programmatically activate Instrument mode so the extension can trigger it when faultsense is already loaded.
- The extension bundles the agent and panel collector dist files directly (no CDN dependency at runtime).

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] Manifest V3 content script vs. scripting API for injection — content scripts run automatically on matching URLs, while `chrome.scripting.executeScript` injects on demand (toolbar click). On-demand is better for this use case.
- [Affects R2][Technical] How to handle the element selection click without triggering page navigation or form submission (likely `e.preventDefault()` + `e.stopPropagation()` during selection mode).
- [Affects R3][Needs research] Best UX for auto-suggesting the assertion key from element context.
- [Affects R7][Technical] How to render the selection highlight without triggering the agent's MutationObserver — likely a second Shadow DOM host or an overlay positioned via `getBoundingClientRect`.
- [Affects R1][Technical] Whether to inject the dist files as content scripts or use `chrome.scripting.executeScript` with the bundled files.

## Next Steps

→ `/ce:plan` for structured implementation planning
