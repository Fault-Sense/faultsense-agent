import { assertionTriggerAttr, supportedEvents } from "./config";
import { createAssertionManager } from "./assertions/manager";
import { interceptErrors } from "./interceptors/error";
import { Configuration, CollectorFunction } from "./types";
import {
  isValidConfiguration,
  setConfiguration,
} from "./assertions/configuration";
import { createLogger } from "./utils/logger";
import { isURL } from "./utils/object";

// Cleanup hooks registered by external collectors (e.g., panel collector)
const cleanupHooks: (() => void)[] = [];

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
    // Invoke cleanup hooks registered by external collectors
    cleanupHooks.forEach(fn => fn());
    cleanupHooks.length = 0;
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

    // Look up registered collectors by name (e.g., "console", "panel")
    if (collectorUrl && !isURL(collectorUrl)) {
      const registered = window.Faultsense?.collectors?.[collectorUrl];
      if (registered) {
        resolvedCollectorUrl = registered;
      } else {
        console.warn(`[Faultsense]: No collector registered for '${collectorUrl}'. Did you forget to load the collector script?`);
      }
    }

    return {
      apiKey: script.getAttribute("data-api-key") || (typeof resolvedCollectorUrl === "function" ? "dev-collector" : undefined),
      releaseLabel: script.getAttribute("data-release-label") || undefined,
      collectorURL: resolvedCollectorUrl,
      timeout: Number(script.getAttribute("data-timeout")) || undefined,
      debug: script.getAttribute("data-debug") === "true" || undefined,
    };
  }

  // Merge into the existing global — collectors may have registered before this script loaded.
  // NOTE: Do not use esbuild's --global-name with this pattern, as it overwrites window.Faultsense
  // with the module exports after this IIFE runs, destroying any previously registered collectors.
  window.Faultsense = window.Faultsense || {};
  window.Faultsense.collectors = window.Faultsense.collectors || {};
  window.Faultsense.init = init;
  window.Faultsense.registerCleanupHook = (fn: () => void) => { cleanupHooks.push(fn); };

  // Automatically initialize Faultsense if the fs-agent script tag exists
  document.addEventListener("DOMContentLoaded", function () {
    const config = extractConfigFromScriptTag();
    if (config) {
      window.Faultsense!.cleanup = init(config);

      if (config.debug) {
        console.log(
          "[Faultsense]: initialized and cleanup function is stored as window.Faultsense.cleanup()"
        );
      }
    }
  });

})();
