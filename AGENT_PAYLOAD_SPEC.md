# Faultsense Agent Payload Specification

Reference for building a collector backend that receives data from the faultsense browser agent.

## Endpoint

The agent sends individual assertion results via **`navigator.sendBeacon`** to the configured collector URL. Each assertion is sent as a **separate request** with `Content-Type: application/json`.

Falls back to `fetch` POST in environments without `sendBeacon`.

### Authentication

The `api_key` field in the POST body is the authentication mechanism. The agent will not send requests if `apiKey` is missing or empty.

---

## Payload Schema

Each POST body is a single JSON object:

```json
{
  "api_key": "your-api-key",
  "assertion_key": "checkout/submit-order",
  "assertion_trigger": "click",
  "assertion_type": "added",
  "assertion_type_value": ".success-message",
  "assertion_type_modifiers": {
    "text-matches": "Order confirmed"
  },
  "attempts": [],
  "condition_key": "success",
  "element_snapshot": "<button fs-assert=\"checkout/submit-order\" fs-trigger=\"click\" fs-assert-added-success=\".success-message\">Submit</button>",
  "release_label": "v2.4.1",
  "status": "passed",
  "timestamp": "2026-03-24T14:30:00.000Z",
  "user_context": { "userId": "u_123", "plan": "pro" }
}
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `api_key` | `string` | The configured API key for authentication. Always present (may be empty for function collectors). |
| `assertion_key` | `string` | Developer-defined key identifying the assertion. Uses `/`-delimited hierarchy (e.g., `"checkout/add-to-cart"`). Stable across releases. |
| `assertion_trigger` | `string` | Trigger that created the assertion. Values: `"click"`, `"submit"`, `"mount"`, `"invariant"`, `"event:cart-updated"`, or any supported trigger. |
| `assertion_type` | `string` enum | The type of assertion. One of: `"added"`, `"removed"`, `"updated"`, `"visible"`, `"hidden"`, `"loaded"`, `"stable"`, `"emitted"`, `"after"`. |
| `assertion_type_value` | `string` | CSS selector or target identifier (e.g., `".success-message"`, `"#cart-count"`). For `emitted`, this is the event name. For `after`, this is the parent assertion key(s). |
| `assertion_type_modifiers` | `object` | Key-value map of modifiers applied to the assertion. All values are strings. See [Modifiers](#modifiers) below. Can be empty `{}`. |
| `attempts` | `number[]` | Timestamps (ms since epoch) of re-trigger events on this assertion while it was pending. Empty array if no re-triggers. Used for rage-click detection. |
| `condition_key` | `string` | The freeform developer-defined condition key (e.g., `"success"`, `"error"`, `"empty"`). Empty string for unconditional assertions. |
| `element_snapshot` | `string` | Full `outerHTML` of the DOM element that the assertion was declared on. Includes all `fs-*` attributes as they appeared at assertion creation time. |
| `release_label` | `string` | Developer-configured release identifier. Always present. |
| `status` | `string` enum | Assertion outcome. One of: `"passed"`, `"failed"`. |
| `timestamp` | `string` | ISO 8601 timestamp of when the assertion was **created** (trigger fired), not when it resolved. |
| `user_context` | `object` or `undefined` | Developer-provided context from `Faultsense.init({ userContext })` or `Faultsense.setUserContext()`. Arbitrary key-value pairs. Absent if no user context is configured. |
| `error_context` | `object` or `undefined` | Present only when an uncaught JS exception occurred during the assertion's lifetime. Contains `message`, optional `stack`, `source`, `lineno`, `colno`. First error wins — subsequent errors do not overwrite. |

### Modifiers

The `assertion_type_modifiers` object may contain any combination of these keys:

| Key | Value | Description |
|---|---|---|
| `text-matches` | `string` | Regex pattern the target element's text content must match. **Partial match** (unanchored). |
| `value-matches` | `string` | Regex pattern the form control's `.value` property must match. **Partial match** (unanchored). |
| `checked` | `"true"` or `"false"` | Checkbox/radio `.checked` state. |
| `disabled` | `"true"` or `"false"` | Disabled state (native `.disabled` or `aria-disabled`). |
| `focused` | `"true"` or `"false"` | Focus state (`document.activeElement === el`). |
| `focused-within` | `"true"` or `"false"` | Focus-within state (`el.matches(':focus-within')`). |
| `count` | `string` (number) | Exactly N elements must match the selector. |
| `count-min` | `string` (number) | At least N elements must match the selector. |
| `count-max` | `string` (number) | At most N elements must match the selector. |
| `classlist` | `string` | Comma-separated class checks (e.g., `"active:true,hidden:false"`). |
| `detail-matches` | `string` | For `emitted` type: regex pattern to match against `event.detail` properties. |
| `mpa` | `string` | `"true"` if the assertion persists across page navigations. |
| `timeout` | `string` | Custom timeout in milliseconds. |

Additional keys may appear as attribute checks — any CSS bracket modifier that isn't a named modifier above becomes a generic attribute match with **full match** semantics (auto-anchored `^(?:value)$`).

---

## Behavioral Notes

### Status Values

The agent resolves assertions to three statuses internally: `passed`, `failed`, and `dismissed`. **Only `passed` and `failed` are sent to the collector.** Dismissed assertions (e.g., losing conditional siblings) are silently dropped.

### Error Context

JS errors do not instantly fail assertions. When an uncaught exception occurs, all pending assertions are tagged with `error_context` (first error wins). The assertion continues resolving normally. If it passes with `error_context`, the feature worked but a JS error occurred in the session. If it fails with `error_context`, the error is the likely cause. **The agent does not generate failure reason strings** — the collector derives human-readable failure messages from assertion metadata (type, selector, modifiers, timeout).

### Status Transitions

The agent only sends an assertion when its status **changes**. An assertion that was already reported as `passed` won't be re-sent. The collector receives at most one request per assertion resolution.

### No Batching

Assertions are sent individually, one POST per assertion. A single user interaction may produce multiple assertions, resulting in multiple concurrent requests.

### Timing

- `timestamp` reflects when the user action occurred (trigger time), not resolution time.
- The request is sent at resolution time, which is `timestamp` + up to the assertion timeout.

### MPA (Multi-Page App) Support

Assertions marked with `mpa: "true"` survive page navigations via `localStorage`. They are created on one page and resolved on the next. The collector sees no difference — these arrive as normal payloads.

### Conditional Assertions

Multiple condition keys on the same element and type form a **sibling group**. The first conditional whose selector matches resolves the group — others are dismissed and not sent. The `condition_key` field identifies which condition was met. Unconditional assertions have an empty string `""` for `condition_key`.

---

## Suggested Collector Implementation

### Minimum Viable Endpoint

```
POST /collector/
Content-Type: application/json

→ 200 OK (agent ignores response body)
```

The agent fire-and-forgets — it does not retry, read response bodies, or handle non-2xx responses beyond logging errors to the browser console. The collector should:

1. Validate `api_key` from the POST body
2. Parse and validate the JSON body against the schema above
3. Store the assertion result
4. Return 200

### Storage Considerations

Key dimensions for querying assertion data:

- **`assertion_key`** — the primary grouping axis. Track pass/fail rates per key.
- **`release_label`** — compare assertion health across releases.
- **`status`** — aggregate pass/fail counts.
- **`condition_key`** — understand which outcomes are occurring.
- **`assertion_type`** + **`assertion_type_value`** — understand what was being checked.
- **`timestamp`** — time-series analysis.
- **`user_context`** — segment by user attributes (plan, role, etc.).
- **`error_context`** — correlate JS errors with assertion outcomes.

### CORS

The agent uses `sendBeacon` (no custom headers) with `fetch` fallback. If the collector is on a different origin, standard CORS headers are required:

```
Access-Control-Allow-Origin: *  (or specific origins)
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Methods: POST, OPTIONS
```
