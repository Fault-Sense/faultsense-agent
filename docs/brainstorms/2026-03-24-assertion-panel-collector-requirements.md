---
date: 2026-03-24
topic: assertion-panel-collector
---

# Assertion Panel Collector

## Problem Frame

Developers instrumenting pages with `fs-*` attributes have no visual feedback on whether their assertions are working. The only client-side option is `consoleCollector`, which outputs to DevTools console as collapsed groups — easy to miss, hard to scan, and requires DevTools to be open. Developers need to validate instrumentation without a backend collector, and a floating panel visible on the page itself is a more natural fit for this workflow.

## Requirements

- R1. A new collector function (`panelCollector`) that renders settled assertions to a floating panel injected into the page DOM, providing the same information as `consoleCollector` in a visual format.
- R2. Each settled assertion displays: assertion key, status (passed/failed/dismissed), assertion type, target selector, trigger event, modifiers (if any), and failure/dismissal reason (if any).
- R3. The panel is injected into the DOM only when the first assertion settles — no DOM footprint until there's something to show.
- R4. The panel's styles are isolated from the host page so it neither inherits nor leaks styles.
- R5. The panel is positioned fixed in a screen corner, stays visible during scroll, and is minimizable/dismissable so it doesn't permanently obstruct the page.
- R6. Activated the same way as `consoleCollector` — by passing it as the `collectorURL` value (e.g., `collectorURL: Faultsense.collectors.panelCollector`) or via `data-collector-url="panel"` on the script tag.
- R7. Zero cost when not in use — no DOM, no styles, no event listeners unless the collector function is invoked.

## Success Criteria

- A developer can validate their `fs-*` instrumentation by seeing assertion results on-page without opening DevTools or configuring a backend collector.
- The panel displays equivalent diagnostic information to what `consoleCollector` logs to the console.
- The panel does not interfere with the host page's layout, styles, or functionality.

## Scope Boundaries

- No live pending-state tracking or elapsed-time timers — assertions appear in the panel only when they settle.
- No inline badges or element highlighting — panel only.
- No new internal API surface (lifecycle hooks, manager changes) — this is a collector function consuming the existing `CollectorFunction` interface.
- No persistence across page navigations (MPA assertions that settle on the next page will appear in the next page's panel naturally).

## Key Decisions

- **Collector function, not a new subsystem**: Same integration pattern as `consoleCollector`. This keeps the implementation surface small and avoids coupling to manager internals.
- **Full context per assertion**: Show everything available on the payload rather than a minimal summary — this is a debugging tool and developers need diagnostic detail.
- **Lazy DOM injection**: No panel until the first assertion settles, so pages without assertions pay zero cost.

## Outstanding Questions

### Deferred to Planning
- [Affects R4][Technical] Best approach for style isolation — Shadow DOM, scoped class prefixes, or inline styles?
- [Affects R5][Technical] Exact panel positioning, sizing, and minimize/dismiss UX.
- [Affects R2][Technical] Visual treatment for different assertion statuses (color coding, icons, grouping).

## Next Steps

→ `/ce:plan` for structured implementation planning
