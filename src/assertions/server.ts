import { ApiPayload, CompletedAssertion, Configuration } from "../types";
import { createLogger } from "../utils/logger";
import { isURL } from "../utils/object";

function toPayload(
  assertion: CompletedAssertion,
  config: Configuration
): ApiPayload {
  const payload: ApiPayload = {
    api_key: config.apiKey || "",
    status: assertion.status,
    timestamp: new Date(assertion.startTime).toISOString(),
    assertion_type: assertion.type,
    assertion_type_value: assertion.typeValue,
    assertion_key: assertion.assertionKey,
    assertion_trigger: assertion.trigger,
    assertion_type_modifiers: Object.fromEntries(
      Object.entries(assertion.modifiers).filter(([k]) => k !== "mutex")
    ) as typeof assertion.modifiers,
    attempts: assertion.attempts || [],
    condition_key: assertion.conditionKey || "",
    release_label: config.releaseLabel,
    element_snapshot: assertion.elementSnapshot
  };

  if (assertion.errorContext) {
    payload.error_context = assertion.errorContext;
  }

  if (config.userContext) {
    payload.user_context = config.userContext;
  }

  return payload;
}

function sendToFunction(
  assertions: CompletedAssertion[],
  config: Configuration
): void {
  const logger = createLogger(config);

  if (!config.releaseLabel) {
    logger.forceError("Missing releaseLabel configuration for custom collector function.");
    return;
  }

  // Call toPayload and invoke custom function for each assertion
  for (const assertion of assertions) {
    try {
      const payload = toPayload(assertion, config);
      (config.collectorURL as Function)(payload);
    } catch (error) {
      logger.forceError('Custom collector function failed:', error);
    }
  }
}

export function sendToServer(
  assertions: CompletedAssertion[],
  config: Configuration
): void {
  const logger = createLogger(config);

  if (!config.collectorURL || !config.apiKey || !config.releaseLabel) {
    logger.forceError("Missing configuration for sending assertions to server.");
    return;
  }

  for (const assertion of assertions) {
    const payload = JSON.stringify(toPayload(assertion, config));
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        config.collectorURL as string,
        new Blob([payload], { type: "application/json" })
      );
    } else {
      // Fallback for environments without sendBeacon (e.g., older browsers, SSR)
      fetch(config.collectorURL as string, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      }).catch((error) => logger.forceError(error));
    }
  }
}

/**
 * Resolve a named collector (e.g., "panel", "console") to its registered function.
 * Named collectors are non-URL strings that map to window.Faultsense.collectors[name].
 * Resolution is lazy — the collector may register after init but before assertions settle.
 */
function resolveCollector(config: Configuration): string | Function {
  const url = config.collectorURL;
  if (typeof url === 'function') return url;
  if (typeof url === 'string' && !isURL(url)) {
    const registered = window.Faultsense?.collectors?.[url];
    if (registered) {
      // Cache the resolved function back into config so subsequent calls skip lookup
      (config as any).collectorURL = registered;
      return registered;
    }
  }
  return url;
}

export function sendToCollector(
  assertions: CompletedAssertion[],
  config: Configuration
): void {
  const collector = resolveCollector(config);
  if (typeof collector === 'function') {
    sendToFunction(assertions, { ...config, collectorURL: collector });
  } else {
    sendToServer(assertions, config);
  }
}