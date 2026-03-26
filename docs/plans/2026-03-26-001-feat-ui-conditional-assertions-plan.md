---
title: "feat: Replace network-conditional assertions with UI-conditional assertions"
type: feat
status: completed
date: 2026-03-26
origin: docs/brainstorms/2026-03-26-ui-conditional-assertions-requirements.md
---

# feat: Replace Network-Conditional Assertions with UI-Conditional Assertions

## Overview

Replace the HTTP-coupled conditional assertion system (`fs-assert-{type}-{status}`, `fs-assert-{type}-json-{key}`, `fs-resp-for` header linking) with a purely UI-based system: `fs-assert-{type}-{condition-key}={selector}` where condition keys are freeform strings chosen by the developer (e.g., `success`, `error`, `empty`).

This is a breaking change that eliminates server-side integration requirements, simplifies the assertion model, and aligns with the core value prop: declare correctness in HTML, resolve against real user sessions. (see origin: `docs/brainstorms/2026-03-26-ui-conditional-assertions-requirements.md`)

## Problem Statement / Motivation

1. **Server cooperation required.** `fs-resp-for` headers must be added to requests/responses to link network traffic to assertion keys — the biggest adoption friction.
2. **Framework incompatibility.** Next.js API routes, GraphQL, tRPC always return HTTP 200 even for errors, making status-based conditionals useless.
3. **Paradigm mismatch.** E2e tools don't gate on network — they assert UI outcomes. The UI itself is the signal.
4. **HTML attribute limitation.** You can't have two `fs-assert-added` attributes on one element. The suffix-based conditional system (`-200`, `-400`) solves this by creating distinct attribute names, and the new system preserves this with condition keys (`-success`, `-error`).

## Proposed Solution

### New Attribute Syntax

```html
<!-- Login: success vs error -->
<button fs-assert="auth/login" fs-trigger="click"
  fs-assert-added-success=".dashboard-welcome"
  fs-assert-added-error=".error-msg">Login</button>

<!-- Search: 3+ outcomes (switch-like) -->
<form fs-assert="search/execute" fs-trigger="submit"
  fs-assert-added-results=".result-card"
  fs-assert-added-empty=".no-results-msg"
  fs-assert-added-error=".search-error">

<!-- Mixed: unconditional + conditional on same element -->
<button fs-assert="cart/add" fs-trigger="click"
  fs-assert-added=".toast"
  fs-assert-updated-success="#cart-count[text-matches=\d+]"
  fs-assert-updated-error=".stock-error">Add to Cart</button>
```

### Resolution Semantics

Conditionals on the same element with the same base type form a **sibling group**. Resolution rules:

1. **Conditional passes:** selector matches + all modifiers pass → report pass with condition key, dismiss siblings
2. **Conditional fails:** selector matches + modifiers fail → fail with condition key and modifier failure reason, dismiss siblings (the selector matching is a definitive resolution trigger — modifiers determine the outcome)
3. **Group timeout:** no conditional resolved before timeout → one failure for the base type with reason "no conditional met", siblings dismissed
4. **Unconditional assertions** on the same element/type resolve independently, outside any sibling group

### What Gets Removed

- `fs-assert-{type}-{status}` (e.g., `fs-assert-added-200`)
- `fs-assert-{type}-json-{key}` (e.g., `fs-assert-added-json-todo`)
- `fs-resp-for` header/param linking
- `httpPending` gating on assertions
- HTTP response resolver (`src/resolvers/http.ts`)
- Network interceptor (`src/interceptors/network.ts`)
- All associated types, handlers, and test infrastructure

## Technical Considerations

### Sibling Group Data Model

The current codebase has no concept of "sibling groups." Sibling dismissal is handled inline in `httpResponseResolver` by filtering assertions with matching keys at resolution time. The new system needs an explicit group concept.

**Design:** Add `conditionKey?: string` to the `Assertion` interface. Group identity is derived from `assertionKey + type` where `conditionKey` is defined. Two utility functions:
- `getSiblingGroup(assertion, allAssertions)`: returns all assertions with same `assertionKey` and base `type` that have a `conditionKey`
- `dismissSiblings(assertion, allAssertions)`: dismisses all group members except the resolved one

**`findAssertion` identity:** Currently uses `assertionKey + type + response-status + response-json-key` to distinguish siblings. Must include `conditionKey` in identity matching to prevent deduplication from collapsing siblings into one assertion. (see `src/assertions/assertion.ts:4-15`)

### Condition Key Parsing

`parseDynamicTypes()` in `src/processors/elements.ts:124-159` currently matches suffixes against `statusSuffixPattern` and `jsonSuffixPattern`. Replace with a single `conditionKeySuffixPattern: /^[a-z][a-z0-9-]*$/` (lowercase alphanumeric + hyphens, must start with letter).

**Collision avoidance:** The parser iterates `domAssertions` (`added`, `removed`, `updated`, `visible`, `hidden`, `loaded`) and tries each as a prefix. `fs-assert-added-visible=".x"` matches `added` as the base type and `visible` as the condition key. This technically works but is confusing. Reserve `domAssertions` names plus `oob` as disallowed condition keys — emit a console warning in debug mode if used.

### Sibling Group Timeout

The current timeout system (`src/assertions/timeout.ts`) creates one timer per assertion. With three conditionals, three timers fire independently, producing three failures — violating R5.

**Design:** Create one shared timer per sibling group. When processing conditional assertions in `enqueueAssertions`, if a group already has a timer (from the first sibling), skip timer creation for subsequent siblings. When the shared timer fires, produce one group failure and dismiss all siblings. The timer can be tracked by a `groupTimeoutId` on the first assertion in the group, with siblings referencing it.

### No `updated` Type Carve-Out

All assertion types use the same resolution semantics: selector match is the resolution trigger, modifiers determine pass/fail. There is no special handling for `updated`. If a developer uses `fs-assert-updated-success="#status[text-matches=Done]"` and `#status` mutates to "Loading...", the selector matches and the modifier fails — the conditional fails immediately and siblings are dismissed.

This is the developer's responsibility to scope correctly. If they want to wait for a specific mutation, they should use a more specific selector or modifier that only matches the final state. The sibling group naturally waits for one condition to be met. Faultsense should not add implicit retry behavior that obscures what the developer declared.

### OOB Interaction

OOB assertions match on `assertionKey` alone via `passedKeys` in `settle()`. With conditionals, `auth/login` passing with condition `error` (the error message appeared correctly) would trigger OOB listeners for `auth/login`.

**Design:** Accept this behavior for now. OOB triggers on any conditional pass for the referenced key. Document clearly. Developers wanting condition-specific OOB can use distinct assertion keys (`auth/login-success` vs `auth/login-error`). Adding `fs-assert-oob-updated="auth/login:success"` syntax is a future enhancement, not in scope.

### Payload Changes

Add `condition_key?: string` as a new field on `ApiPayload` (alongside existing `assertion_type`). Remove `response-status` and `response-json-key` from `assertion_type_modifiers`. Dismissed siblings are NOT sent to the collector (matches current behavior — `getAssertionsToSettle` filters out dismissed assertions).

### Network Interceptor: Keep Code, Remove Import

The network interceptor (`src/interceptors/network.ts`) monkey-patches `fetch` and `XMLHttpRequest`. With `fs-resp-for` and `httpPending` removed, it's not used by the agent. **Keep the file in the repo** (it may be useful for future features like client-side context signals), but **remove the import and invocation** from `src/index.ts`. Since it's not imported, it won't be included in the bundle — zero bundle size impact. The error interceptor (`src/interceptors/error.ts`) is separate and unaffected.

## System-Wide Impact

- **Interaction graph:** `parseDynamicTypes` → `createAssertions` (sets conditionKey) → `enqueueAssertions` (groups siblings, shared timeout) → `elementResolver`/`immediateResolver`/`documentResolver` (resolve + dismiss siblings) → `settle` (send to collector, trigger OOB) → `toPayload` (include condition_key)
- **Error propagation:** Group timeout failure replaces individual conditional timeouts. One failure event instead of N.
- **State lifecycle risks:** Sibling dismissal must be atomic — if two conditionals resolve in the same mutation batch, the first processed wins and the second is dismissed before settling.
- **API surface parity:** Collectors/backends must handle new `condition_key` field and absence of `response-status`/`response-json-key`. `AGENT_PAYLOAD_SPEC.md` needs updating.

## Acceptance Criteria

### Functional Requirements

- [ ] `fs-assert-{type}-{condition-key}={selector}` creates conditional assertions with freeform condition keys
- [ ] Sibling group resolution: first conditional to pass wins, others dismissed
- [ ] Conditional fail: selector match + modifier failure fails that specific conditional, dismisses siblings
- [ ] Group timeout: if no conditional resolves, one failure reported with "no conditional met"
- [ ] Unconditional and conditional assertions coexist independently on the same element/type
- [ ] 3+ conditionals work (switch-like pattern)
- [ ] All existing modifiers (`text-matches`, `classlist`, attribute checks) work on conditionals
- [ ] MPA mode works with conditional assertions (serialize/restore `conditionKey`)
- [ ] OOB assertions trigger on any conditional pass for the referenced key
- [ ] `fs-resp-for` header linking removed
- [ ] `httpPending` gating removed
- [ ] HTTP response resolver removed
- [ ] Network interceptor kept in repo but removed from imports/bundle
- [ ] `AGENT_PAYLOAD_SPEC.md` updated with new `condition_key` field
- [ ] `CLAUDE.md` updated with new conditional syntax and removal of network-conditional docs
- [ ] Debug mode warns if condition key collides with reserved names

### Testing Requirements

- [ ] Unit tests for conditional parsing (`parseDynamicTypes` with condition keys)
- [ ] Unit tests for sibling resolution (first-pass-wins, dismiss others)
- [ ] Unit tests for conditional fail (selector match + modifier fail)
- [ ] Unit tests for conditional fail (selector match + modifier failure fails and dismisses siblings)
- [ ] Unit tests for group timeout (one failure, siblings dismissed)
- [ ] Unit tests for mixed unconditional + conditional
- [ ] Unit tests for 3+ conditionals (switch pattern)
- [ ] Unit tests for MPA serialization with `conditionKey`
- [ ] Unit tests for OOB triggered by conditional pass
- [ ] Unit tests for reserved condition key warning
- [ ] Remove all existing network conditional tests (`tests/assertions/network/`)

## Implementation Phases

### Phase 1: Data Model + Parsing (Foundation)

Add the `conditionKey` concept and parse the new attribute syntax. No behavior changes yet — existing tests still pass because the old parsing is kept alongside the new until Phase 3.

**Tasks:**
1. Add `conditionKey?: string` to `Assertion` interface in `src/types.ts`
2. Add `conditionKeySuffixPattern` to `src/config.ts`, add reserved key list
3. Update `parseDynamicTypes()` in `src/processors/elements.ts` to recognize condition key suffixes (add new matching alongside existing status/json matching)
4. Update `findAssertion()` in `src/assertions/assertion.ts` to include `conditionKey` in identity match
5. Add `condition_key` to `ApiPayload` in `src/types.ts` and `toPayload()` in `src/assertions/server.ts`
6. Add reserved key validation with debug-mode console warning

**Files:**
- `src/types.ts` — `Assertion` interface, `ApiPayload`, `AssertionModifiers`
- `src/config.ts` — new pattern, reserved keys list
- `src/processors/elements.ts` — `parseDynamicTypes()`
- `src/assertions/assertion.ts` — `findAssertion()`
- `src/assertions/server.ts` — `toPayload()`

**Tests:**
- `tests/attributes.test.ts` — add tests for condition key parsing
- New `tests/assertions/conditionals/parsing.test.ts`

### Phase 2: Sibling Resolution + Group Timeout (Core Behavior)

Implement sibling group resolution in the DOM resolvers and shared group timeout.

**Tasks:**
1. Add `getSiblingGroup()` and `dismissSiblings()` utility functions in `src/assertions/assertion.ts`
2. Update `elementResolver` in `src/resolvers/dom.ts` to handle conditional assertions:
   - When a conditional's selector matches and modifiers pass → complete as passed, dismiss siblings
   - When a conditional's selector matches and modifiers fail → for `added`/`removed`/`visible`/`hidden`: complete as failed, dismiss siblings. For `updated`: skip (retry on next mutation)
3. Update `immediateResolver` and `documentResolver` in `src/resolvers/dom.ts` with same logic
4. Update `enqueueAssertions` in `src/assertions/manager.ts` to create shared group timeouts:
   - First conditional in a group gets the timeout timer
   - Subsequent siblings skip timer creation
   - On timeout: produce one group failure, dismiss siblings
5. Update `handleAssertion` in `src/resolvers/dom.ts` to return sibling dismissals alongside the resolved assertion
6. Update MPA serialization in `src/assertions/storage.ts` to include `conditionKey`

**Files:**
- `src/assertions/assertion.ts` — group utilities
- `src/resolvers/dom.ts` — resolver changes (elementResolver, immediateResolver, documentResolver, handleAssertion)
- `src/assertions/manager.ts` — group timeout in `enqueueAssertions`
- `src/assertions/timeout.ts` — group timeout failure message
- `src/assertions/storage.ts` — MPA serialization

**Tests:**
- New `tests/assertions/conditionals/resolution.test.ts` — sibling pass/dismiss, fail/dismiss
- New `tests/assertions/conditionals/timeout.test.ts` — group timeout
- New `tests/assertions/conditionals/modifier-fail.test.ts` — selector match + modifier failure fails conditional
- New `tests/assertions/conditionals/mixed.test.ts` — unconditional + conditional coexistence
- New `tests/assertions/conditionals/switch.test.ts` — 3+ conditionals

### Phase 3: Remove Network-Conditional System (Cleanup)

Remove all network-conditional code and the network interceptor.

**Tasks:**
1. Remove `statusSuffixPattern`, `jsonSuffixPattern`, `httpResponseHeaderKey` from `src/config.ts`
2. Remove status/json matching branches from `parseDynamicTypes()` in `src/processors/elements.ts`
3. Remove `httpPending` from `Assertion` interface in `src/types.ts`
4. Remove `getPendingHttpAssertions()` from `src/assertions/assertion.ts`
5. Remove `!a.httpPending` guard from `getPendingDomAssertions()` in `src/assertions/assertion.ts`
6. Remove `response-status` and `response-json-key` from `AssertionModifiers` type and from `findAssertion()` identity
7. Remove `httpPending` assignment from `createAssertions()` in `src/processors/elements.ts`
8. Delete `src/resolvers/http.ts` entirely
9. Keep `src/interceptors/network.ts` in repo but remove all imports/references to it
10. Remove `handleHttpResponse`, `handleHttpError` from `src/assertions/manager.ts`
11. Remove `interceptNetwork()` call and cleanup from `src/index.ts`
12. Remove HTTP-related types from `src/types.ts` (`RequestInfo`, `ResponseInfo`, `HttpErrorInfo`, handler types)
13. Remove `shouldProcessResponse`, `extractParamXRespFor` helpers
14. Delete all tests in `tests/assertions/network/`
15. Update `AGENT_PAYLOAD_SPEC.md` — remove `response-status`/`response-json-key`, add `condition_key`
16. Update `CLAUDE.md` — replace network-conditional docs with UI-conditional docs
17. Update `llms-full.txt` if it exists — same documentation changes

**Files deleted:**
- `src/resolvers/http.ts`
- `tests/assertions/network/status.test.ts`
- `tests/assertions/network/association.test.ts`
- `tests/assertions/network/error.test.ts`
- `tests/assertions/network/json-body.test.ts`

**Files modified:**
- `src/config.ts`, `src/types.ts`, `src/processors/elements.ts`, `src/assertions/assertion.ts`, `src/assertions/manager.ts`, `src/assertions/timeout.ts`, `src/index.ts`
- `AGENT_PAYLOAD_SPEC.md`, `CLAUDE.md`, `llms-full.txt`

## Alternative Approaches Considered

1. **Keep network conditionals alongside UI conditionals.** Rejected — adds complexity, two ways to do the same thing, and the old system has no use case the new one can't cover. (see origin: Key Decisions, "Remove rather than deprecate")
2. **Deprecate first, remove later.** Rejected — pre-1.0 API, no external adopters at scale, breaking clean is better than carrying two systems.
3. **Use URL/storage gates instead of removing network conditionals.** Rejected — URL/storage gates are complementary features (see ideation doc), not replacements. The core insight is that the UI itself is sufficient as the signal.

## Dependencies & Prerequisites

- No external dependencies
- Collectors/backends consuming `ApiPayload` must be updated to handle `condition_key` field and absence of `response-status`/`response-json-key`
- The todolist demo and any example code using network conditionals must be updated

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-26-ui-conditional-assertions-requirements.md](docs/brainstorms/2026-03-26-ui-conditional-assertions-requirements.md) — Key decisions carried forward: freeform condition keys, remove-not-deprecate, selector match as resolution trigger, allow unconditional+conditional mixing

### Internal References

- Sibling dismissal pattern: `src/resolvers/http.ts:112-133`
- Dynamic type parsing: `src/processors/elements.ts:124-159`
- Assertion identity: `src/assertions/assertion.ts:4-15`
- httpPending gate: `src/assertions/assertion.ts:21-27`
- Network interceptor: `src/interceptors/network.ts`
- OOB settle hook: `src/assertions/manager.ts:204-219`
- Timeout system: `src/assertions/timeout.ts`
- E2E gap analysis: `docs/ideation/2026-03-26-e2e-gap-analysis-ideation.md`
