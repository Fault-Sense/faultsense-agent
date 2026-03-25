import { ApiPayload, CompletedAssertion, Configuration } from "../types";
import { createLogger } from "../utils/logger";
import { isURL } from "../utils/object";

function toPayload(
  assertion: CompletedAssertion,
  config: Configuration
): ApiPayload {
  return {
    status: assertion.status,
    status_reason: assertion.statusReason || "",
    timestamp: new Date(assertion.startTime).toISOString(),
    assertion_type: assertion.type,
    assertion_type_value: assertion.typeValue,
    assertion_key: assertion.assertionKey,
    assertion_trigger: assertion.trigger,
    assertion_type_modifiers: assertion.modifiers,
    release_label: config.releaseLabel,
    element_snapshot: assertion.elementSnapshot
  };
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
    fetch(config.collectorURL as string, {
      method: "POST",
      headers: {
        "X-Faultsense-Api-Key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toPayload(assertion, config)),
    }).catch((error) => logger.forceError(error));
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