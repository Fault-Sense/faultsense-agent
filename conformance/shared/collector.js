/**
 * In-page conformance collector for Layer 2 framework harnesses.
 *
 * Registered on `window.Faultsense.collectors.conformance` so the agent
 * resolves it by name via `data-collector-url="conformance"` on the agent
 * script tag (see src/index.ts:151-161).
 *
 * Custom collectors are invoked ONCE PER SETTLED ASSERTION with a single
 * `ApiPayload` object, not with an array. See src/assertions/server.ts
 * `sendToFunction`. The payload uses snake_case field names:
 *   {
 *     api_key, status, timestamp,
 *     assertion_type, assertion_type_value, assertion_key, assertion_trigger,
 *     assertion_type_modifiers, attempts, condition_key, release_label,
 *     element_snapshot, error_context?, user_context?
 *   }
 * The panel collector at src/collectors/panel.ts is the canonical reference
 * for collector shape.
 *
 * Playwright drivers read captured payloads via:
 *   await page.evaluate(() => window.__fsAssertions)
 */
(function () {
  if (typeof window === "undefined") return;

  window.__fsAssertions = window.__fsAssertions || [];

  window.Faultsense = window.Faultsense || {};
  window.Faultsense.collectors = window.Faultsense.collectors || {};

  window.Faultsense.collectors.conformance = function (payload /*, config */) {
    try {
      // Defensive clone — the agent mutates assertion objects post-settlement
      // (invariant auto-retry, sibling dismissal) and a shared reference
      // would corrupt the captured snapshot. JSON round-trip strips any
      // non-serializable fields and gives every entry its own copy.
      window.__fsAssertions.push(JSON.parse(JSON.stringify(payload)));
    } catch (err) {
      // Fall back to shallow copy if something in the payload is not
      // JSON-serializable. Better than dropping the event.
      window.__fsAssertions.push(Object.assign({}, payload));
    }
  };
})();
