import { ApiPayload } from "../types";

/**
 * Console Collector - Logs FaultSense assertions to the browser console
 *
 * Each assertion result is logged as a collapsible group with detailed information.
 *
 * Usage:
 *
 * ```html
 * <!-- Auto-initialization via script tag -->
 * <script id="fs-agent" src="faultsense-agent.js"
 *   data-collector-url="console" data-release-label="dev"></script>
 * <script src="faultsense-console.min.js"></script>
 * ```
 *
 * ```javascript
 * // Manual initialization
 * Faultsense.init({
 *   collectorURL: Faultsense.collectors.console,
 *   releaseLabel: 'dev'
 * });
 * ```
 */
const consoleCollector = (payload: ApiPayload) => {
  console.groupCollapsed(
    `🔍 FaultSense [${payload.status.toUpperCase()}] ${payload.assertion_key}`
  );
  console.log("Status:", payload.status);
  console.log("Trigger:", payload.assertion_trigger);
  console.log("Type:", payload.assertion_type);
  console.log("Type Value:", payload.assertion_type_value);
  console.log("Modifiers:", payload.assertion_type_modifiers);
  console.log("Assertion:", payload.assertion_key);
  console.log("Timestamp:", payload.timestamp);
  console.log("Release:", payload.release_label);
  console.log("Element Snapshot:", payload.element_snapshot);
  if (payload.error_context) {
    console.log("Error Context:", payload.error_context);
  }
  console.log("Full Payload:", payload);
  console.groupEnd();
};

// Self-register on the Faultsense global
window.Faultsense = window.Faultsense || {};
window.Faultsense.collectors = window.Faultsense.collectors || {};
window.Faultsense.collectors.console = consoleCollector;
