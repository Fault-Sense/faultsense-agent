---
date: 2026-03-28
topic: user-context
---

# User Context on Assertions

## Problem Frame

When an assertion fails in production, the collector knows *what* failed (assertion key, type, selector) and *where* (user agent from the HTTP request). But it doesn't know *who* — which user, account, plan tier, or A/B test group experienced the failure. Without user context, triaging assertion failures requires cross-referencing with separate analytics or logging systems. Every major production monitoring tool (Sentry, Datadog RUM, LogRocket) provides user context attachment — it's table stakes.

## Requirements

- R1. Developers can pass a `userContext` object (`Record<string, any>`) in the Faultsense init configuration. This context is attached to all assertion payloads (pass and fail).
- R2. `Faultsense.setUserContext(context)` is exposed as a public API method, allowing the context to be updated after init (e.g., after login). Merges with or replaces the existing context.
- R3. The collector payload includes a `user_context` field containing the context object. Omitted when no context has been set.
- R4. The context is a plain object with string keys and any JSON-serializable values. The agent does not validate or transform the values — it passes them through as-is.

## Success Criteria

- A developer can pass `{ userId: "u_123", plan: "pro" }` at init and see it in every assertion payload
- A developer can call `Faultsense.setUserContext({ userId: "u_456" })` after login and subsequent assertions carry the updated context
- The panel collector displays user context when present

## Scope Boundaries

- No PII filtering or scrubbing — the developer is responsible for what they include
- No size limits on the context object in the agent — the collector can enforce limits server-side
- No automatic context collection (browser fingerprint, IP, etc.) — explicit manual instrumentation only, consistent with Faultsense's philosophy

## Key Decisions

- **All assertions, not just failures:** Attaching to all payloads gives the collector full session context for correlation. The collector can filter if needed, but can't retroactively add context to passes already sent.
- **Updatable via API, not callback:** `setUserContext()` is simpler than a callback function and covers the main use case (login/logout). A callback would be called on every assertion resolution, which adds overhead for a rare need.

## Outstanding Questions

### Deferred to Planning
- [Affects R2][Technical] Should `setUserContext` merge with existing context (shallow merge) or replace it entirely?

## Next Steps

→ `/ce:plan` for structured implementation planning
