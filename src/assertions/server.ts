import { ApiPaylaod, CompletedAssertion, Configuration } from "../types";
import { createLogger } from "../utils/logger";

function toPayload(
  assertion: CompletedAssertion,
  config: Configuration
): ApiPaylaod {
  return {
    status: assertion.status,
    status_reason: assertion.statusReason || "",
    timestamp: new Date(assertion.startTime).toISOString(),
    assertion_type: assertion.type,
    assertion_type_value: assertion.typeValue,
    feature_key: assertion.featureKey,
    feature_label: assertion.featureLabel || "",
    assertion_key: assertion.assertionKey,
    assertion_label: assertion.assertionLabel || "",
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

export function sendToCollector(
  assertions: CompletedAssertion[],
  config: Configuration
): void {
  // Type detection logic to distinguish between string and function collectors
  if (typeof config.collectorURL === 'function') {
    sendToFunction(assertions, config);
  } else {
    sendToServer(assertions, config);
  }
}