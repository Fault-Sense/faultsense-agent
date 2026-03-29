---
date: 2026-03-28
topic: status-reason-removal
---

# Remove statusReason, Add errorContext

## Problem Frame

The `statusReason` field in the assertion payload contains human-readable failure messages that are almost entirely derivable from assertion metadata (`type`, `typeValue`, `modifiers`, `timeout`). Maintaining these messages creates busywork — every new assertion type or modifier needs a reason string in two places (`dom.ts` and `timeout.ts`), and missing entries produce "Unknown assertion type" errors (as seen with `emitted`). The one genuinely useful signal — uncaught JS exceptions that caused a failure — deserves its own dedicated field.

## Requirements

- R1. Remove `statusReason` from the `Assertion` interface and the collector payload (`status_reason` field). All current statusReason generation code is deleted.
- R2. Add `errorContext` field to `Assertion` and the collector payload. Populated only when an uncaught JS exception (`window.onerror` or `unhandledrejection`) contributed to the assertion failure. Contains the error message and optionally the source/line info.
- R3. The `errorContext` field is `undefined`/omitted when no JS error is associated with the failure.
- R4. The global error interceptor (`interceptErrors`) links the error to any pending assertions that subsequently fail, rather than to all pending assertions.

## Success Criteria

- No `statusReason` or `status_reason` in agent source or payload
- `errorContext` populated when a JS error causes assertion failure
- ~1KB bundle size reduction from removed string literals
- New assertion types/modifiers no longer need failure message strings

## Scope Boundaries

- The collector backend is a separate project. This brainstorm covers the agent payload change only.
- Human-readable failure messages are the collector's responsibility going forward.
- The panel collector (debug tool) may show `errorContext` if present but does not need to generate derived failure messages.

## Key Decisions

- **Remove vs repurpose:** Remove `statusReason` entirely rather than repurposing it. Clean break, no ambiguity about what the field means.
- **Dedicated field:** `errorContext` is a separate field, not overloading `statusReason`. Makes the schema self-documenting.

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Technical] What shape should `errorContext` have? Options: plain string (error message), or structured `{ message, source, line, column }`.
- [Affects R4][Technical] How should the error interceptor associate errors with specific assertions? Currently `globalErrorResolver` fails ALL pending assertions on any error. Should `errorContext` attach to the specific assertion that was active when the error occurred, or to all assertions that fail within a time window after the error?

## Next Steps

→ `/ce:plan` for structured implementation planning
