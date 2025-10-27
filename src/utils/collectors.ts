import { CollectorFunction } from "../types";

/**
 * Console Collector - A utility collector that logs FaultSense assertions to the browser console
 * 
 * This collector provides a nice formatted output in the browser console for debugging and development.
 * Each assertion result is logged as a collapsible group with detailed information.
 * 
 * Usage Examples:
 * 
 * ```html
 * <!-- Method 1: Auto-initialization via script tag -->
 * <script 
 *   id="fs-agent"
 *   src="faultsense-agent.js"
 *   data-collector-url="console"
 *   data-release-label="dev">
 * </script>
 * ```
 * 
 * ```javascript
 * // Method 2: Manual initialization
 * Faultsense.init({
 *   collectorURL: Faultsense.collectors.consoleCollector,
 *   releaseLabel: 'dev'
 * });
 * ```
 * 
 * Output format:
 * - Collapsible console groups with status and assertion label
 * - Detailed breakdown of assertion data
 * - Color-coded status indicators
 * - Full payload object for debugging
 */
const consoleCollector: CollectorFunction = (payload) => {
    console.groupCollapsed(`🔍 FaultSense [${payload.status.toUpperCase()}] ${payload.assertion_label}`);
    console.log('Status:', payload.status);
    console.log('Trigger:', payload.assertion_trigger);
    console.log('Type:', payload.assertion_type);
    console.log('Type Value:', payload.assertion_type_value);
    console.log('Modifiers:', payload.assertion_type_modifiers);
    console.log('Feature:', payload.feature_key, payload.feature_label ? `(${payload.feature_label})` : '');
    console.log('Assertion:', payload.assertion_key, payload.assertion_label ? `(${payload.assertion_label})` : '');
    console.log('Timestamp:', payload.timestamp);
    console.log('Release:', payload.release_label);
    console.log('Element Snapshot:', payload.element_snapshot);
    if (payload.status_reason) {
        console.log('Reason:', payload.status_reason);
    }
    console.log('Full Payload:', payload);
    console.groupEnd();
};

/**
 * Collection of built-in collector functions for common use cases
 */
export const collectors = {
    consoleCollector
};