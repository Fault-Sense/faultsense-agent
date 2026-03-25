---
date: 2026-03-25
topic: response-body-assertions
---

# Response Body Assertions + Dynamic Assertion Guidance

## Problem Frame

Faultsense gates DOM assertions on HTTP status codes (`fs-assert-added-200`, `fs-assert-added-4xx`). Modern frameworks (TanStack Start, tRPC, GraphQL, REST APIs with envelope patterns) often return HTTP 200 for both success and error responses, with the distinction in the response body (`{ error: "..." }` vs `{ data: {...} }`). Developers using these frameworks cannot use response-conditional assertions at all.

Separately, bidirectional interactions (toggles, checkboxes) expose a skill gap: the classlist modifier only validates one direction. The solution isn't a new modifier — it's teaching developers to use dynamic attribute values that reflect the expected next state.

## Requirements

- R1. A new response-conditional suffix `json[key]` that gates DOM assertions on the presence of a top-level key in the JSON response body. Syntax: `fs-assert-added-json[error]=".error-msg"` — assertion activates when the response body is JSON and contains a truthy `error` key.
- R2. `json[key]` conditions follow the same linking pattern as status conditions — they require `fs-resp-for` to associate the request/response with the assertion key.
- R3. `json[key]` conditions coexist with status conditions on the same element. When both are declared, status is checked first; if status matches, the json condition on that branch is also checked. If a json condition is declared without a status prefix, it applies to any status.
- R4. Multiple json conditions on one element create independent assertions (same as multiple status conditions). When one matches, siblings are dismissed.
- R5. The interceptor already captures `responseText`. The json resolver parses it once per response and caches the result. Invalid JSON means all json conditions for that response fail.
- R6. Update the Faultsense skill to document dynamic assertion values for toggle/bidirectional interactions. Example: `fs-assert-updated={`.todo-item[classlist=completed:${!todo.completed}]`}` — the app sets the expected next state dynamically.

## Success Criteria

- A developer using TanStack Start (200-only RPC) can assert different DOM outcomes based on response body content.
- The todolist demo's add-todo flow uses `json[error]` and `json[todo]` conditions to assert both the success and validation-error paths.
- The skill teaches dynamic attribute values for toggles, eliminating false failures on bidirectional interactions.

## Scope Boundaries

- Key existence only — no nested path traversal, no value matching, no JSONPath. Keep it simple; extend later if needed.
- No changes to the classlist modifier itself — dynamic attributes handle toggles.
- No new attributes — reuses the existing suffix slot on assertion types.

## Key Decisions

- **JSON key existence, not value matching**: Covers 90%+ of cases (tRPC error objects, GraphQL `errors` array, REST envelope `{ error }` vs `{ data }`). Value matching adds syntax complexity for marginal gain.
- **Reuse the suffix slot**: `json[key]` occupies the same position as `200`, `4xx` in `fs-assert-{type}-{suffix}`. This keeps the API surface consistent — the suffix is always "what condition must the response satisfy."
- **Dynamic attributes for toggles**: The app already knows the current state. Teaching developers to compute the expected next state in the attribute value is simpler and more flexible than adding toggle semantics to the modifier system.

## Dependencies / Assumptions

- The interceptor's `responseText` capture is reliable and available when the http resolver runs (confirmed — already used for response size checks).
- JSON parsing of response bodies is safe — responses from RPC frameworks are always JSON. Non-JSON responses (HTML, binary) are handled by the "invalid JSON → fail" rule.

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] Should the suffix be `json[key]` or `body[key]`? `json` is more specific and signals the parsing behavior. `body` is more generic but might imply raw text matching.
- [Affects R3][Technical] Exact precedence when both status and json conditions are declared. Does `fs-assert-added-200-json[todo]` mean "200 AND has todo key"? Or are they independent branches?
- [Affects R5][Technical] Response text caching strategy — parse once per response in the interceptor, or lazily in the resolver?
- [Affects R1][Needs research] How does the `json[key]` suffix interact with the existing status suffix regex parser in `config.ts`? The current pattern is `/^(\d{3}|\d{1}xx)$/` — this needs extension.

## Next Steps

→ `/ce:plan` for structured implementation planning
