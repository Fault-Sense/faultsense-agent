---
title: "feat: Add panel collector for visual assertion debugging"
type: feat
status: completed
date: 2026-03-24
origin: docs/brainstorms/2026-03-24-assertion-panel-collector-requirements.md
---

# feat: Add panel collector for visual assertion debugging

## Overview

Add a `panelCollector` — a new collector that renders settled assertions to a floating DOM panel, giving developers visual feedback on their `fs-*` instrumentation without opening DevTools or configuring a backend. Both the new `panelCollector` and the existing `consoleCollector` are extracted from the main agent bundle into separate IIFE builds, keeping the production agent lean.

## Problem Statement

Developers instrumenting pages with `fs-*` attributes have no visual feedback on whether their assertions work. The only client-side option is `consoleCollector`, which requires DevTools to be open and outputs collapsed console groups that are easy to miss. A floating panel visible on the page itself is a more natural feedback loop for validating instrumentation. (See origin: `docs/brainstorms/2026-03-24-assertion-panel-collector-requirements.md`)

Additionally, both collectors are development tools that should not add unnecessary size to the production agent bundle. Extracting them into separate builds keeps the core agent focused on assertion processing.

## Proposed Solution

### Architecture

**Two key decisions shape this implementation:**

**1. Separate IIFE builds for collectors.** Each collector gets its own entry point and esbuild output. The main agent bundle (`faultsense-agent.min.js`) no longer includes any collector code. Collectors self-register on `window.Faultsense.collectors` when their script loads. The agent resolves `data-collector-url` string values by looking up registered collectors at init time.

**2. Shadow DOM for the panel.** It simultaneously solves three problems:
- **Style isolation (R4):** Panel styles neither inherit from nor leak to the host page.
- **MutationObserver isolation:** The agent's MutationObserver on `document.body` does not see mutations inside a shadow root, eliminating the feedback loop where panel DOM updates trigger unnecessary resolver passes.
- **Selector collision prevention:** Assertion selectors (`document.querySelector`) cannot match elements inside the shadow root, preventing the panel from accidentally satisfying unrelated assertions.

### Build Architecture

```
src/index.ts          → dist/faultsense-agent.min.js        (IIFE, Faultsense)
src/collectors/console.ts → dist/faultsense-console.min.js  (IIFE, self-registering)
src/collectors/panel.ts   → dist/faultsense-panel.min.js    (IIFE, self-registering)
```

Usage:

```html
<!-- Production: agent only, no collector overhead -->
<script id="fs-agent" src="faultsense-agent.min.js"
  data-api-key="..." data-release-label="v1.2" data-collector-url="https://..."></script>

<!-- Development: agent + panel collector -->
<script id="fs-agent" src="faultsense-agent.min.js"
  data-release-label="dev" data-collector-url="panel" data-debug="true"></script>
<script src="faultsense-panel.min.js"></script>

<!-- Development: agent + console collector -->
<script id="fs-agent" src="faultsense-agent.min.js"
  data-release-label="dev" data-collector-url="console"></script>
<script src="faultsense-console.min.js"></script>

<!-- Programmatic: -->
<script src="faultsense-agent.min.js"></script>
<script src="faultsense-panel.min.js"></script>
<script>
  Faultsense.init({
    collectorURL: Faultsense.collectors.panel,
    releaseLabel: 'dev'
  });
</script>
```

### Implementation

#### Phase 1: Extract collectors into separate builds

**Create `src/collectors/console.ts`** — Move `consoleCollector` from `src/utils/collectors.ts` to its own entry point.

The collector script self-registers on the `Faultsense` global:

```typescript
// src/collectors/console.ts
import { ApiPayload } from "../types";

const consoleCollector = (payload: ApiPayload) => {
  // ... existing consoleCollector implementation
};

// Self-register on the Faultsense global (short name matches data-collector-url value)
window.Faultsense = window.Faultsense || {};
window.Faultsense.collectors = window.Faultsense.collectors || {};
window.Faultsense.collectors.console = consoleCollector;
```

**Update `src/utils/collectors.ts`** — Remove the `consoleCollector` implementation. The agent no longer bundles any collector code. This file can be removed entirely, or kept as an empty export if other internal code references it.

**Update `src/index.ts`** — Two changes:

**(a) Collector resolution in `extractConfigFromScriptTag()`** — Replace the hardcoded `"console"` check with a dynamic lookup on the collector registry:

```typescript
// Replace hardcoded collector resolution
if (collectorUrl && !collectorUrl.startsWith("http") && !collectorUrl.startsWith("//")) {
  // Look up registered collector by name
  const registered = window.Faultsense?.collectors?.[collectorUrl];
  if (registered) {
    resolvedCollectorUrl = registered;
  }
}
```

This resolves `"console"` → `window.Faultsense.collectors.console`, `"panel"` → `window.Faultsense.collectors.panel`, falls through to treat the value as a URL if no match, and works for any future collector without modifying the agent.

If the lookup fails (collector script not loaded), log a warning: `"[Faultsense]: No collector registered for '${collectorUrl}'. Did you forget to load the collector script?"`.

**(b) Merge the `window.Faultsense` global instead of overwriting it.** The current `if (!window.Faultsense)` guard (line 143) skips setup entirely if the global exists. With separate collector scripts that may load before or after the agent, this must become a merge:

```typescript
window.Faultsense = window.Faultsense || {};
window.Faultsense.cleanup = cleanupFn;
window.Faultsense.collectors = window.Faultsense.collectors || {};
```

This ensures:
- If the agent loads first: creates the global, collector scripts add to it later
- If a collector loads first: agent merges `cleanup` onto the existing global without overwriting `collectors`

**Update collector self-registration** — Collectors register using the short name that matches `data-collector-url`:

```typescript
// In each collector's IIFE
window.Faultsense = window.Faultsense || {};
window.Faultsense.collectors = window.Faultsense.collectors || {};
window.Faultsense.collectors.console = consoleCollector;  // matches data-collector-url="console"
// or
window.Faultsense.collectors.panel = panelCollector;      // matches data-collector-url="panel"
```

**Update `src/types.ts`** — Make the `collectors` type extensible and use short names:

```typescript
collectors?: Record<string, CollectorFunction>;
```

**Update `package.json`** — Add build commands for each collector:

```json
{
  "scripts": {
    "build": "npm run build:agent && npm run build:collectors",
    "build:agent": "esbuild src/index.ts --bundle --target=es2022 --outfile=./dist/faultsense-agent.min.js --global-name=Faultsense --format=iife --minify",
    "build:console": "esbuild src/collectors/console.ts --bundle --target=es2022 --outfile=./dist/faultsense-console.min.js --format=iife --minify",
    "build:panel": "esbuild src/collectors/panel.ts --bundle --target=es2022 --outfile=./dist/faultsense-panel.min.js --format=iife --minify",
    "build:collectors": "npm run build:console && npm run build:panel"
  },
  "files": [
    "dist/faultsense-agent.min.js",
    "dist/faultsense-console.min.js",
    "dist/faultsense-panel.min.js",
    "README.md",
    "LICENSE",
    "assets/"
  ]
}
```

**Update `src/index.ts` cleanup path** — Since the agent no longer imports collector code, cleanup of collector-owned DOM needs a convention. Add a cleanup hook registration:

```typescript
// In index.ts, module scope
const cleanupHooks: (() => void)[] = [];

// Exposed on window.Faultsense for collectors to register
window.Faultsense.registerCleanupHook = (fn: () => void) => { cleanupHooks.push(fn); };

// In the cleanup function returned by init()
cleanupHooks.forEach(fn => fn());
cleanupHooks.length = 0;
```

The panel collector registers its cleanup hook when it creates the panel DOM.

**Update `apiKey` bypass** — The agent currently injects a synthetic `apiKey` for the `consoleCollector` function reference (line 129). With dynamic resolution, change this to bypass `apiKey` for any function-type collector:

```typescript
apiKey: script.getAttribute("data-api-key") || (typeof resolvedCollectorUrl === 'function' ? "dev-collector" : undefined),
```

#### Phase 2: Build the panel collector

**Create `src/collectors/panel.ts`** — The panel collector implementation.

Contains:
- Module-scoped state: shadow root reference, payload buffer, minimized/dismissed flags
- `panelCollector` function conforming to `(payload: ApiPayload) => void`
- Private functions: `createPanel()`, `renderRow(payload)`, `minimize()`, `dismiss()`, `restore()`
- Self-registration on `window.Faultsense.collectors.panel`
- Cleanup hook registration via `window.Faultsense.registerCleanupHook`

**Collector function behavior** — On each `panelCollector(payload)` call:
1. If panel does not exist → call `createPanel()`, then render the row
2. If panel exists and is visible → prepend the row (most recent at top)
3. If panel is minimized → buffer the payload, increment counter badge
4. If panel is dismissed → buffer the payload, show a floating "N new" badge

**`createPanel()`:**
1. Create a `<div id="fs-panel-host">` and append to `document.body`
2. Attach open shadow root (`attachShadow({ mode: 'open' })`)
3. Inject `<style>` inside shadow root with all panel CSS
4. Build panel structure: header (title + minimize/close buttons), scrollable body
5. Fixed-position, bottom-right corner, ~360px wide, max ~400px tall, overflow scroll
6. Register cleanup hook to remove the host element

**Each assertion row displays** (see origin R2):
- Assertion key (bold, primary identifier)
- Status: passed/failed with color indicator (green/red)
- Type + selector (e.g., `added → .success-message`)
- Trigger event
- Modifiers (if any, compact format)
- Failure reason (if failed, shown in muted text)
- Timestamp (relative, e.g., "2s ago")

Display order: most recent at top (reverse chronological). Scrollable, no row eviction limit.

### Panel Lifecycle States

```
[not created] → first payload → [visible]
[visible] → minimize click → [minimized] (badge shows count)
[minimized] → click badge → [visible] (shows all buffered)
[visible] → dismiss click → [dismissed] (floating badge)
[dismissed] → click badge → [visible] (shows all buffered)
[any state] → Faultsense.cleanup() → [removed from DOM]
```

## Technical Considerations

**Script loading order:** The collector script must load before the agent's `DOMContentLoaded` handler fires. Since both are synchronous `<script>` tags, order is guaranteed by HTML spec — the agent script runs first but defers init to `DOMContentLoaded`, and the collector script registers itself immediately. By the time `DOMContentLoaded` fires, the collector is registered on `window.Faultsense.collectors`.

**Shadow DOM browser support:** Supported in all modern browsers (Chrome 53+, Firefox 63+, Safari 10.1+, Edge 79+). Since this is a development tool, legacy support is irrelevant.

**Bundle size impact:** The main agent bundle gets *smaller* by removing `consoleCollector`. Each collector is loaded only when needed. The panel collector will be ~3-5KB minified (CSS + DOM construction). The console collector is <1KB.

**Synchronous rendering in collector callback:** `sendToFunction` calls the collector synchronously within `settle()`. The panel collector should do minimal synchronous work — create/append DOM elements, no layout-forcing reads. Shadow DOM mutations don't trigger the parent MutationObserver.

**`releaseLabel` silent failure:** If `releaseLabel` is missing, `sendToFunction` silently returns without calling the collector. Not in scope for this feature, but worth noting in collector documentation.

**Backward compatibility:** The `Faultsense.collectors.consoleCollector` API continues to work — it's just loaded from a separate script instead of bundled. The `data-collector-url="console"` pattern works identically. The only breaking change: users must add a separate `<script>` tag for the collector they want.

## System-Wide Impact

- **Interaction graph:** `settle()` → `sendToCollector()` → `sendToFunction()` → `panelCollector()` → Shadow DOM mutations (invisible to parent MutationObserver). No new internal callbacks.
- **Error propagation:** `sendToFunction` wraps collector calls in try/catch (server.ts:38-40). Panel errors won't crash the agent.
- **State lifecycle risks:** Panel state is module-scoped in the collector's IIFE. `cleanup()` invokes registered hooks to remove panel DOM. No orphaned state.
- **API surface parity:** `Faultsense.collectors` becomes a dynamic registry. Both `consoleCollector` and `panelCollector` available when their scripts are loaded.

## Acceptance Criteria

### Collector extraction
- [ ] `consoleCollector` moved to `src/collectors/console.ts` with its own IIFE build
- [ ] Main agent bundle (`faultsense-agent.min.js`) no longer contains any collector code
- [ ] `data-collector-url="console"` resolves by looking up `window.Faultsense.collectors.console`
- [ ] `Faultsense.collectors` type is extensible (`Record<string, CollectorFunction>`)
- [ ] `window.Faultsense` initialization uses merge pattern (works regardless of script load order)
- [ ] Unresolved collector name logs a warning (collector script not loaded)
- [ ] Existing `consoleCollector` tests pass with the new build structure
- [ ] `npm run build` produces all three bundles

### Panel collector
- [ ] `panelCollector` available at `Faultsense.collectors.panel` when script is loaded
- [ ] `data-collector-url="panel"` activates the panel collector
- [ ] Panel appears on first settled assertion, not before (lazy injection)
- [ ] Each row shows: key, status (color-coded), type, selector, trigger, modifiers, reason, timestamp
- [ ] Panel is fixed-position, scrollable, does not interfere with host page layout
- [ ] Panel styles fully isolated via Shadow DOM — no inheritance or leakage
- [ ] Panel DOM does not trigger the agent's MutationObserver or satisfy assertion selectors
- [ ] Panel is minimizable with a counter badge for new assertions while minimized
- [ ] Panel is dismissable with a floating badge for new assertions after dismissal
- [ ] `Faultsense.cleanup()` removes panel DOM via registered cleanup hook

### Tests
- [ ] Console collector: self-registration, payload logging (adapted from existing tests)
- [ ] Panel collector: panel creation on first payload, row rendering, minimize/restore, dismiss/restore, cleanup hook

## Dependencies & Risks

- **No blockers.** Uses existing `CollectorFunction` interface and esbuild.
- **Breaking change:** Users of `consoleCollector` need to add a separate script tag. Since this is a v0.x project, breaking changes are acceptable. Document in CHANGELOG.
- **Risk: loading order.** If the collector script is loaded *after* `DOMContentLoaded`, the agent won't find the registered collector. Mitigated by documenting that collector scripts must be synchronous `<script>` tags loaded before or alongside the agent.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-24-assertion-panel-collector-requirements.md](../brainstorms/2026-03-24-assertion-panel-collector-requirements.md) — Key decisions: collector function pattern (not new subsystem), full diagnostic context per row, lazy DOM injection.
- **Existing collector pattern:** `src/utils/collectors.ts:35-51` — `consoleCollector` implementation
- **Collector dispatch:** `src/assertions/server.ts:22-42` — `sendToFunction` path
- **Script tag config:** `src/index.ts:112-157` — `extractConfigFromScriptTag` and auto-init
- **Type declarations:** `src/types.ts:149-158` — `Window.Faultsense` global type
- **Cleanup function:** `src/index.ts:86-109` — current cleanup path
- **Ideation context:** `docs/ideation/2026-03-24-open-ideation.md` — idea #4 (Assertion Authoring Overlay)
