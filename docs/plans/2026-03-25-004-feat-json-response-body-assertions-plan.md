---
title: "feat: JSON response body assertions for 200-only frameworks"
type: feat
status: completed
date: 2026-03-25
origin: docs/brainstorms/2026-03-25-response-body-assertions-requirements.md
---

# feat: JSON response body assertions for 200-only frameworks

## Overview

Add `json[key]` as a new response-conditional suffix that gates DOM assertions on the presence of a top-level key in the JSON response body. This enables assertions for frameworks that always return HTTP 200 (TanStack Start, tRPC, GraphQL) where success/error is distinguished by response body content, not status code. (see origin: `docs/brainstorms/2026-03-25-response-body-assertions-requirements.md`)

## Problem Statement

Current response-conditional assertions (`fs-assert-added-200`, `fs-assert-added-4xx`) gate on HTTP status codes. Frameworks using RPC patterns return 200 for everything:

```json
// Success
{ "todo": { "id": "4", "text": "Buy milk" } }

// Validation error — also HTTP 200
{ "error": "Todo text cannot be empty" }
```

Developers cannot differentiate these with status-based conditions.

## Proposed Solution

New suffix `json[key]` in the same slot as status codes:

```html
<!-- Gate on response body having a "todo" key (success path) -->
<button fs-assert-added-json[todo]=".todo-item" ...>Add</button>

<!-- Gate on response body having an "error" key (error path) -->
<button fs-assert-added-json[error]=".add-error" ...>Add</button>
```

Both require `fs-resp-for` linking (same as status conditions). Multiple json conditions on one element create independent assertions — when one matches, siblings are dismissed. (see origin: R1-R4)

## Technical Approach

### Changes by file

#### 1. `src/config.ts` — Add json suffix pattern

```typescript
// New pattern alongside statusSuffixPattern
export const jsonSuffixPattern = /^json\[([^\]]+)\]$/;
```

#### 2. `src/processors/elements.ts:parseDynamicTypes` — Parse json[key] suffixes

Currently at line 133, after the status suffix check fails, add a json suffix check:

```typescript
// After: if (statusSuffixPattern.test(statusPart)) { ... }
// Add:
const jsonMatch = statusPart.match(jsonSuffixPattern);
if (jsonMatch) {
  const { selector, modifiers } = parseTypeValue(attr.value);
  types.push({
    type: domType,
    value: selector,
    modifiers: { ...modifiers, "response-json-key": jsonMatch[1] },
  });
}
```

This stores the json key in `modifiers["response-json-key"]` — parallel to how status stores in `modifiers["response-status"]`. The assertion starts with `httpPending: true` (same as status conditions).

#### 3. `src/resolvers/http.ts` — Match json conditions

Extend `isHttpResponseForAssertion` to also match assertions with `response-json-key` modifier:

```typescript
function getResponseJsonKey(assertion: Assertion): string | undefined {
  return assertion.modifiers["response-json-key"];
}
```

The main `httpResponseResolver` needs to:
1. Parse `responseText` as JSON once per call (lazy, cached in closure)
2. For assertions with `response-json-key`, check if the parsed JSON has the key (truthy value)
3. If matched, release to DOM resolvers (set `httpPending = false`), dismiss siblings
4. If JSON parse fails, fail all json-conditional assertions for that response

```typescript
export function httpResponseResolver(
  requestInfo: RequestInfo,
  responseInfo: ResponseInfo,
  assertions: Assertion[]
): CompletedAssertion[] {
  const actualStatus = responseInfo.status;
  const completed: CompletedAssertion[] = [];

  // Find all response-conditional assertions for this request
  const responseAssertions = assertions.filter(a =>
    isHttpResponseForAssertion(a, requestInfo, responseInfo)
  );
  if (responseAssertions.length === 0) return completed;

  // Separate status-conditional and json-conditional assertions
  const statusAssertions = responseAssertions.filter(a => getResponseStatus(a));
  const jsonAssertions = responseAssertions.filter(a => getResponseJsonKey(a));

  // Handle status conditions (existing logic, unchanged)
  if (statusAssertions.length > 0) {
    // ... existing findMatchingAssertion logic ...
  }

  // Handle json conditions
  if (jsonAssertions.length > 0) {
    let parsedBody: Record<string, unknown> | null = null;
    try {
      parsedBody = JSON.parse(responseInfo.responseText);
    } catch {
      // Invalid JSON — fail all json assertions
      for (const a of jsonAssertions) {
        const failed = completeAssertion(a, false, "Response body is not valid JSON");
        if (failed) completed.push(failed);
      }
      return completed;
    }

    // Find the json assertion whose key exists and is truthy in the body
    const matched = jsonAssertions.find(a => {
      const key = getResponseJsonKey(a)!;
      return parsedBody !== null && key in parsedBody && parsedBody[key];
    });

    if (matched) {
      matched.httpPending = false;
      for (const sibling of jsonAssertions) {
        if (sibling === matched) continue;
        const dismissed = dismissAssertion(sibling);
        if (dismissed) completed.push(dismissed);
      }
    } else {
      const declaredKeys = jsonAssertions.map(a => getResponseJsonKey(a)).join(', ');
      for (const a of jsonAssertions) {
        const failed = completeAssertion(a, false,
          `Response body does not contain any declared key (${declaredKeys})`
        );
        if (failed) completed.push(failed);
      }
    }
  }

  return completed;
}
```

#### 4. `src/resolvers/http.ts:isHttpResponseForAssertion` — Recognize json assertions

Extend the guard to also match assertions with `response-json-key`:

```typescript
export function isHttpResponseForAssertion(...): boolean {
  if (!getResponseStatus(assertion) && !getResponseJsonKey(assertion)) return false;
  // ... rest of fs-resp-for matching unchanged
}
```

#### 5. `src/assertions/manager.ts` — Include json-pending assertions in http filtering

Currently `getPendingHttpAssertions` filters by `httpPending`. Assertions with `response-json-key` will already have `httpPending: true` from the processor (same path as status assertions). No change needed here.

#### 6. `src/collectors/panel.ts` — Display json condition in panel rows

Currently shows `response-status` in the detail line. Also show `response-json-key` when present:

```
added → .todo-item · click · [json:todo]
```

### Demo updates

Update `examples/todolist-tanstack/src/components/AddTodo.tsx` to use json conditions:

```html
<button
  fs-assert="todos/add-item"
  fs-trigger="click"
  fs-assert-added-json[todo]=".todo-item"
  fs-assert-added-json[error]=".add-error"
  fs-assert-timeout="2000">
  Add
</button>
```

And add `fs-resp-for` header to the `addTodo` server function call.

## Acceptance Criteria

- [ ] `fs-assert-added-json[key]=".selector"` parses correctly and creates an assertion with `httpPending: true`
- [ ] `json[key]` conditions require `fs-resp-for` linking (same as status conditions)
- [ ] When response body has the declared key (truthy), assertion releases to DOM resolvers
- [ ] When response body doesn't have the key, assertion fails with descriptive message
- [ ] Multiple json conditions on one element — matching one dismisses siblings
- [ ] Invalid JSON response — all json assertions fail with "not valid JSON" message
- [ ] Panel collector displays `[json:key]` in assertion detail
- [ ] Todolist demo add-todo uses `json[todo]` and `json[error]` conditions
- [ ] Existing status-conditional assertions unaffected (all existing tests pass)
- [ ] New tests cover: json key match, json key miss, invalid JSON, multiple json conditions, mixed status + json on same element

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-25-response-body-assertions-requirements.md](docs/brainstorms/2026-03-25-response-body-assertions-requirements.md) — Key decisions carried forward: JSON key existence only (not value matching), reuse suffix slot, json conditions are independent from status conditions.

### Internal References

- `src/config.ts:26` — `statusSuffixPattern` regex (needs sibling `jsonSuffixPattern`)
- `src/processors/elements.ts:123-148` — `parseDynamicTypes` (needs json suffix branch)
- `src/resolvers/http.ts:75-117` — `httpResponseResolver` (needs json matching logic)
- `src/resolvers/http.ts:37-52` — `isHttpResponseForAssertion` (needs json key guard)
- `src/interceptors/network.ts:52` — `responseText` capture (already available)
- `src/types.ts:50-54` — `ResponseInfo` interface (has `responseText` field)
- `src/collectors/panel.ts` — panel row rendering (needs json key display)
- `tests/assertions/network/status.test.ts` — existing response-conditional tests (pattern for new tests)
