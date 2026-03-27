# Faultsense Agent Payload Specification

Reference for building a collector backend that receives data from the faultsense browser agent.

## Endpoint

The agent sends individual assertion results via **`navigator.sendBeacon`** to the configured collector URL (default: `//faultsense.com/collector/`). Each assertion is sent as a **separate request** with `Content-Type: application/json`.

Falls back to `fetch` POST in environments without `sendBeacon`.

### Authentication

The `api_key` field in the POST body is the authentication mechanism. The agent will not send requests if `apiKey` is missing or empty.

**Note:** The API key was previously sent as an `X-Faultsense-Api-Key` HTTP header. Since `sendBeacon` cannot set custom headers, the key moved to the POST body.

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
  "element_snapshot": "<button id=\"submit\" fs-assert=\"checkout/submit-order\" fs-trigger=\"click\" fs-assert-added-success=\".success-message\">Submit</button>",
  "release_label": "v2.4.1",
  "status": "passed",
  "status_reason": "",
  "timestamp": "2026-03-24T14:30:00.000Z"
}
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `api_key` | `string` | The configured API key for authentication. Always present (may be empty for function collectors). |
| `assertion_key` | `string` | Developer-defined key identifying the assertion. Uses `/`-delimited hierarchy (e.g., `"checkout/add-to-cart"`, `"profile/media/upload-photo"`). Stable across releases. |
| `assertion_trigger` | `string` | DOM event that triggered the assertion. Values: `"click"`, `"submit"`, `"mount"`, or any DOM event name. |
| `assertion_type` | `string` enum | The type of DOM assertion. One of: `"added"`, `"removed"`, `"updated"`, `"visible"`, `"hidden"`, `"loaded"`. |
| `assertion_type_value` | `string` | CSS selector or target identifier for the assertion (e.g., `".success-message"`, `"#cart-count"`, `"#hero-image"`). |
| `assertion_type_modifiers` | `object` | Key-value map of modifiers applied to the assertion. All values are strings. See [Modifiers](#modifiers) below. Can be empty `{}`. |
| `attempts` | `number[]` | Timestamps (ms since epoch) of re-trigger events on this assertion while it was pending. Empty array if no re-triggers. Used for rage-click detection and interaction cadence analysis. |
| `condition_key` | `string` | The freeform developer-defined condition key (e.g., `"success"`, `"error"`, `"empty"`). Empty string for unconditional assertions. |
| `element_snapshot` | `string` | Full `outerHTML` of the DOM element that the assertion was declared on (the event target). Includes all `fs-*` attributes as they appeared at assertion creation time. |
| `release_label` | `string` | Developer-configured release identifier. Always present (agent won't send without it). |
| `status` | `string` enum | Assertion outcome. One of: `"passed"`, `"failed"`. |
| `status_reason` | `string` | Human-readable explanation for failures (e.g., `"Element .success-message was not added within 1000ms"`). Empty string `""` for passed assertions. |
| `timestamp` | `string` | ISO 8601 timestamp (`toISOString()`) of when the assertion was **created** (trigger fired), not when it resolved. |

### Modifiers

The `assertion_type_modifiers` object may contain any combination of these keys:

| Key | Value | Description |
|---|---|---|
| `text-matches` | `string` | Regex or string pattern the target element's text content must match. |
| `classlist` | `string` | Comma-separated class checks (e.g., `"active:true,hidden:false"`). |
| `mpa` | `string` | `"true"` if the assertion persists across page navigations (multi-page app mode). |
| `timeout` | `string` | Custom timeout in milliseconds (overrides agent default). |

Additional modifiers may appear as arbitrary attribute checks (e.g., `"src"`, `"alt"`, `"href"`) — any CSS bracket modifier that isn't a named modifier above becomes a generic attribute match.

---

## Behavioral Notes

### Status Values

The agent resolves assertions to three statuses internally: `passed`, `failed`, and `dismissed`. **Only `passed` and `failed` are sent to the collector.** Dismissed assertions (e.g., sibling response-conditional assertions that didn't match) are silently dropped.

### Status Transitions

The agent only sends an assertion when its status **changes**. An assertion that was already reported as `passed` won't be re-sent as `passed`. This means the collector receives at most one request per assertion resolution.

### No Batching

Assertions are sent individually, one POST per assertion. A single user interaction may produce multiple assertions (e.g., a form submit with `fs-assert-added` and `fs-assert-removed`), resulting in multiple concurrent requests.

### Timing

- `timestamp` reflects when the user action occurred (trigger time), not resolution time.
- The request is sent at resolution time, which is `timestamp` + up to the assertion timeout (default 1000ms, configurable per-assertion).

### MPA (Multi-Page App) Support

Assertions marked with `mpa: "true"` survive page navigations via `localStorage`. They are created on one page and resolved on the next. The collector sees no difference — these arrive as normal payloads after the new page loads and the assertion resolves.

### Conditional Assertions

Assertions like `fs-assert-added-success=".dashboard"` and `fs-assert-added-error=".error-msg"` are conditional assertions. Multiple condition keys on the same element and type form a **sibling group**. The first conditional whose selector matches in the DOM resolves the group — others are dismissed and not sent.

The `condition_key` field in the payload identifies which condition was met. Unconditional assertions (no condition key suffix) do not have this field.

When no conditional in a group resolves before the timeout, one failure is reported with `status_reason` indicating "No conditional assertion was met."

---

## Suggested Collector Implementation

### Minimum Viable Endpoint

```
POST /collector/
Content-Type: application/json
X-Faultsense-Api-Key: <key>

→ 200 OK (agent ignores response body)
```

The agent fire-and-forgets — it does not retry, read response bodies, or handle non-2xx responses beyond logging errors to the browser console. The collector should:

1. Validate `X-Faultsense-Api-Key`
2. Parse and validate the JSON body against the schema above
3. Store the assertion result
4. Return 200

### Storage Considerations

Key dimensions for querying assertion data:

- **`assertion_key`** — the primary grouping axis. Track pass/fail rates per key.
- **`release_label`** — compare assertion health across releases.
- **`status`** — aggregate pass/fail counts.
- **`assertion_type`** + **`assertion_type_value`** — understand what was being checked.
- **`timestamp`** — time-series analysis.
- **`status_reason`** — failure debugging.

### CORS

The agent uses `fetch` with no special modes. If the collector is on a different origin than the instrumented app, standard CORS headers are required:

```
Access-Control-Allow-Origin: *  (or specific origins)
Access-Control-Allow-Headers: Content-Type, X-Faultsense-Api-Key
Access-Control-Allow-Methods: POST, OPTIONS
```
