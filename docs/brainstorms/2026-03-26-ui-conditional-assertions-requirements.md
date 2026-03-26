---
date: 2026-03-26
topic: ui-conditional-assertions
---

# UI-Conditional Assertions

## Problem Frame

Faultsense's conditional assertion system (`fs-assert-{type}-{status}`, `fs-assert-{type}-json-{key}`) is coupled to HTTP responses. This creates three problems:

1. **Server cooperation required.** The `fs-resp-for` header must be added to requests or responses to link network traffic to assertion keys. This is the biggest adoption friction in the API.
2. **Framework incompatibility.** Many frameworks (Next.js API routes, GraphQL, tRPC) always return HTTP 200 even for application-level errors, making status-based conditionals useless. The `-json-{key}` fallback works but requires knowledge of response body structure.
3. **Paradigm mismatch.** Traditional e2e testing tools don't gate assertions on network responses — they assert on UI outcomes. Faultsense's core value prop is "move your e2e assertions into production HTML." Requiring network interception contradicts that simplicity.

The insight: **the UI itself is the signal.** When a login succeeds, the dashboard appears. When it fails, an error message appears. Developers already know which DOM outcomes correspond to which conditions — they don't need HTTP status codes to differentiate them.

## Requirements

- R1. **Conditional assertion syntax.** Support `fs-assert-{type}-{condition-key}={selector}` where `{condition-key}` is a freeform alphanumeric string chosen by the developer (e.g., `success`, `error`, `empty`, `timeout`, `premium`). Multiple condition keys on the same element and type form a **sibling group**.

- R2. **Sibling resolution: first-match wins.** Within a sibling group (same element, same base type, different condition keys), the first conditional whose selector matches resolves the group. All other conditionals in the group are dismissed.

- R3. **Individual conditional pass.** A conditional passes when its selector matches AND all its modifiers are satisfied. The conditional is reported as passed with its condition key. Siblings are dismissed.

- R4. **Individual conditional fail.** A conditional fails when its selector matches BUT one or more modifiers fail. The conditional is reported as failed with its condition key and the modifier failure reason. Siblings are dismissed. (The selector match is the resolution trigger; modifiers determine pass/fail.)

- R5. **Group timeout failure.** If no conditional in a sibling group has its selector match before the assertion timeout, one failure is reported for the base type with reason "no conditional met." Individual conditionals are not reported as individual failures.

- R6. **Unconditional and conditional mixing.** An element can have both unconditional (`fs-assert-added=".toast"`) and conditional (`fs-assert-added-error=".error-msg"`) assertions for the same base type. Unconditional assertions resolve independently. Conditional assertions race within their sibling group.

- R7. **Remove network-conditional system.** Remove `fs-assert-{type}-{status}`, `fs-assert-{type}-json-{key}`, `fs-resp-for` header linking, `httpPending` gating, and the HTTP response resolver. The network interceptor remains for any non-conditional uses but assertion resolution is purely UI-based.

- R8. **Condition key in payload.** The assertion payload sent to the collector must include the condition key so the backend can distinguish which outcome occurred. This replaces the response-status and response-json-key fields currently in the payload.

- R9. **Modifiers work on conditionals.** All existing modifiers (`text-matches`, `classlist`, attribute checks) work on conditional assertions the same way they work on unconditional assertions.

## Success Criteria

- A login form can have `fs-assert-added-success=".dashboard"` and `fs-assert-added-error=".error-msg"` with no server-side integration required
- Switching from the old system to the new system requires only changing attribute names (no new infrastructure)
- The network interceptor code related to assertion gating (`fs-resp-for`, `httpPending`, HTTP resolver) is removed
- More than two conditionals work (switch-like): `fs-assert-added-success`, `fs-assert-added-error`, `fs-assert-added-empty`, `fs-assert-added-rate-limited` on the same element

## Scope Boundaries

- **In scope:** New conditional syntax, sibling resolution semantics, removal of network-conditional system, payload changes
- **Out of scope:** Client-side context signals (URL gates, storage gates, offline triggers) — these are separate features that complement but don't depend on this change
- **Out of scope:** Changes to OOB assertions — OOB triggers on parent pass/fail are orthogonal
- **Out of scope:** New assertion types (route, stable, invariant) — these are additive features

## Key Decisions

- **Freeform condition keys:** Developers choose any alphanumeric string. No constrained set. This maximizes flexibility and avoids Faultsense prescribing domain semantics.
- **Remove rather than deprecate:** The network-conditional system is removed entirely. This is a breaking change but the API is pre-1.0 and the simplification is worth it. The old system has no use case that the new system can't cover (if the UI looks the same for two different HTTP statuses, the developer can add distinguishing modifiers like `text-matches`).
- **Selector match is the resolution trigger:** A conditional resolves (pass or fail) when its selector appears in the DOM. Modifiers determine the outcome. This means a conditional waiting for `.error-msg` won't resolve until `.error-msg` actually exists — it won't fail just because `.dashboard` appeared first (that's handled by sibling dismissal).
- **Allow unconditional + conditional mixing:** An element can have `fs-assert-added=".toast"` alongside `fs-assert-added-success=".dashboard"`. The unconditional resolves on its own; the conditionals race in their group. These are independent assertion instances.

## Dependencies / Assumptions

- The existing sibling dismissal infrastructure (from the HTTP conditional system) can be adapted for UI conditionals
- The `parseDynamicTypes()` regex patterns in `elements.ts` need to change from matching status codes/json prefixes to matching freeform condition keys
- Collectors/backends consuming the payload will need to handle the new condition key field and the absence of response-status/response-json-key fields

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] How should the `parseDynamicTypes()` regex change? Current patterns match `\d{3}|\d{1}xx` (status) and `json-.+` (json-key). The new pattern needs to match any alphanumeric-with-hyphens string while avoiding collisions with future assertion type names.
- [Affects R4][Technical] For `updated` type conditionals, a mutation check runs on every DOM change. If the selector matches but modifiers fail on the first mutation, should it fail immediately (like `added`) or keep checking subsequent mutations? This may need type-specific behavior.
- [Affects R5][Technical] How should the group timeout failure be represented in the payload? Options: a synthetic assertion with the base type and no condition key, or a special status reason on one of the conditional assertions.
- [Affects R7][Needs research] Audit all usages of `httpPending`, `response-status`, `response-json-key`, `fs-resp-for` across the codebase and tests to ensure clean removal.
- [Affects R8][Technical] What should the payload field name be? `conditionKey`? `condition`? Should dismissed siblings appear in the payload at all?

## Next Steps

-> `/ce:plan` for structured implementation planning
