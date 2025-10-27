import { assertionTriggerAttr, supportedEvents } from "./config";
import { createAssertionManager } from "./assertions/manager";
import { interceptErrors } from "./interceptors/error";
import { interceptNetwork } from "./interceptors/network";
import { Configuration, CollectorFunction } from "./types";
import {
  isValidConfiguration,
  setConfiguration,
} from "./assertions/configuration";
import { createLogger } from "./utils/logger";
import { collectors } from "./utils/collectors";

// Export for programmatic use and esbuild global object
export { collectors };

export function init(initialConfig: Partial<Configuration>): () => void {
  let observer: MutationObserver | null = null;
  const config: Configuration = setConfiguration(initialConfig);
  const logger = createLogger(config);

  logger.log("[Faultsense]: Initializing agent...");

  if (!isValidConfiguration(config)) {
    logger.forceError(
      "[Faultsense]: Invalid configuration. Agent not initialized.",
      config
    );
    return () => { };
  }

  const assertionManager = createAssertionManager(config);

  interceptErrors(assertionManager.handleGlobalError);
  interceptNetwork(
    assertionManager.handleHttpResponse,
    assertionManager.handleHttpError
  );

  // Add event listeners
  const capturePhase = true;
  supportedEvents.forEach((eventType) => {
    document.addEventListener(
      eventType,
      assertionManager.handleEvent,
      capturePhase
    );
  });

  // Lifecycle event listeners
  window.addEventListener(
    "pagehide",
    assertionManager.handlePageUnload,
    capturePhase
  );
  window.addEventListener(
    "beforeunload",
    assertionManager.handlePageUnload,
    capturePhase
  );

  // Set up a MutationObserver to handle DOM changes
  observer = new MutationObserver((mutations) => {
    assertionManager.handleMutations(mutations);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });

  // process all mount or load triggered nodes already in the DOM
  const elements = document.querySelectorAll(
    `[${assertionTriggerAttr}="mount"], [${assertionTriggerAttr}="load"]`
  );
  assertionManager.processElements(Array.from(elements) as HTMLElement[], [
    "mount",
    "load",
  ]);

  // Run initial check
  assertionManager.checkAssertions();

  // cleanup function
  return () => {
    assertionManager.clearActiveAssertions();
    supportedEvents.forEach((eventType) => {
      document.removeEventListener(
        eventType,
        assertionManager.handleEvent,
        capturePhase
      );
    });
    document.removeEventListener(
      "pagehide",
      assertionManager.handlePageUnload,
      capturePhase
    );
    document.removeEventListener(
      "beforeunload",
      assertionManager.handlePageUnload,
      capturePhase
    );
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

(function () {
  function extractConfigFromScriptTag(): Partial<Configuration> | null {
    const script = document.querySelector("script#fs-agent");

    if (!script) {
      return null;
    }

    const collectorUrl = script.getAttribute("data-collector-url");
    let resolvedCollectorUrl: string | CollectorFunction | undefined = collectorUrl || undefined;

    // Handle special collector values
    if (collectorUrl === "console") {
      resolvedCollectorUrl = collectors.consoleCollector;
    }

    return {
      apiKey: script.getAttribute("data-api-key") || (resolvedCollectorUrl === collectors.consoleCollector ? "console-collector" : undefined),
      releaseLabel: script.getAttribute("data-release-label") || undefined,
      collectorURL: resolvedCollectorUrl,
      timeout: Number(script.getAttribute("data-timeout")) || undefined,
      debug: script.getAttribute("data-debug") === "true" || undefined,
    };
  }

  // Automatically initialize Faultsense if the fs-agent script tag exists
  document.addEventListener("DOMContentLoaded", function () {
    const config = extractConfigFromScriptTag();
    if (config) {
      const cleanupFn = init(config);

      if (!window.Faultsense) {
        window.Faultsense = {};
        window.Faultsense.cleanup = cleanupFn;
        window.Faultsense.collectors = collectors;
      }

      if (config.debug) {
        console.log(
          "[Faultsense]: initialized and cleanup function is stored as window.Faultsense.cleanup()"
        );
      }
    }
  });

})();
