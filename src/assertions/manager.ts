/**
 * Assertion Manager ** Mutation Warning **
 * The manager is designed to mutate the activeAssertions array
 * This may change.
 */
import { loadAssertions, storeAssertions } from "./storage";
import type {
  HttpResponseHandler,
  HttpErrorHandler,
  GlobalErrorHandler,
  Configuration,
  CompletedAssertion,
  Assertion,
} from "../types";
import { sendToCollector } from "./server";
import { eventProcessor } from "../processors/events";
import { createElementProcessor } from "../processors/elements";
import { mutationHandler } from "../processors/mutations";
import { documentResolver, elementResolver, immediateResolver } from "../resolvers/dom";
import { httpErrorResolver, httpResponseResolver } from "../resolvers/http";
import { globalErrorResolver } from "../resolvers/error";


import { eventTriggerAliases } from "../config";
import {
  findAssertion,
  getAssertionsForMpaMode,
  getAssertionsToSettle,
  getPendingAssertions,
  getPendingDomAssertions,
  getPendingHttpAssertions,
  isAssertionCompleted,
  isAssertionPending,
  retryCompletedAssertion,
} from "./assertion";
import { createAssertionTimeout, clearAssertionTimeout, clearAllTimeouts } from "./timeout";
import { eventResolver } from "../resolvers/event";
import { propertyResolver } from "../resolvers/property";
import { createLogger } from "../utils/logger";
import { findAndCreateOobAssertions } from "../processors/oob";

// Assertion Manager with pluggable Processors
export function createAssertionManager(config: Configuration) {
  let activeAssertions: Assertion[] = loadAssertions(); // Initially load assertions
  let assertionCountCallback: ((count: number) => void) | null = null;
  const logger = createLogger(config);

  /**
   * Check if an assertion condition is already met after current event processing
   * Uses a microtask to defer the check until after the current event processing is complete
   */
  const checkImmediateResolved = (assertion: Assertion): void => {
    Promise.resolve().then(() => {
      // Only check if the assertion is still pending (hasn't been completed by other means)
      if (isAssertionPending(assertion)) {
        let deferredResult: CompletedAssertion | null = null;

        // Check for DOM visibility assertions (visible, hidden)
        // These are most likely to change state without triggering DOM mutations
        if (assertion.type === "visible" || assertion.type === "hidden") {
          const documentResults = immediateResolver([assertion], config);
          if (documentResults.length > 0) {
            deferredResult = documentResults[0];
          }
        }

        if (deferredResult) {
          // Assertion is already satisfied, settle it immediately
          settle([deferredResult]);
        }
      }
    });
  };
  const enqueueAssertions = (newAssertions: Assertion[]): void => {
    // any assertsions marked for processing on the next page load should
    // skip the queue and be saved in storage
    storeAssertions(newAssertions.filter((a) => a.mpa_mode));

    newAssertions.filter((a) => !a.mpa_mode).forEach((newAssertion) => {
      // Check if an existing assertion matches by `assertionKey` and `type`
      const existingAssertion = findAssertion(newAssertion, activeAssertions);
      if (existingAssertion && isAssertionCompleted(existingAssertion)) {
        retryCompletedAssertion(existingAssertion, newAssertion);

        // Reset timeout timer for the retried assertion
        createAssertionTimeout(existingAssertion, config, (completedAssertion) => {
          settle([completedAssertion]);
        });

        // Also run immediate check for retried assertions
        checkImmediateResolved(existingAssertion);

      } else if (!existingAssertion || !isAssertionPending(existingAssertion)) {
        activeAssertions.push(newAssertion);

        // Create timeout timer for the new assertion
        createAssertionTimeout(newAssertion, config, (completedAssertion) => {
          settle([completedAssertion]);
        });

        // Check if the assertion condition is already met after current event processing
        checkImmediateResolved(newAssertion);
      }
    });

    // Notify about assertion count change
    if (assertionCountCallback) {
      assertionCountCallback(getPendingAssertions(activeAssertions).length);
    }
  };

  const handleEvent = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const triggers = eventTriggerAliases[event.type] || [event.type];
    const elementProcessor = createElementProcessor(triggers, true); // true = eventMode
    const created = eventProcessor(event, elementProcessor);
    enqueueAssertions(created);

    const completed = eventResolver(
      event,
      getPendingDomAssertions(activeAssertions)
    );
    settle(completed);
  };

  // Processor for DOM mutations (calls all registered mutation Processors)
  const handleMutations = (mutationsList: MutationRecord[]): void => {
    const elementProcessor = createElementProcessor(["mount"]);
    const created = mutationHandler<Assertion>(
      mutationsList,
      elementProcessor,
      getPendingDomAssertions(activeAssertions)
    );

    enqueueAssertions(created);

    // Check assertions immediately after enqueueing to handle already-loaded elements
    if (created.some(assertion => assertion.type === "loaded")) {
      checkAssertions();
    }

    const completed = mutationHandler<CompletedAssertion>(
      mutationsList,
      elementResolver,
      getPendingDomAssertions(activeAssertions)
    );
    settle(completed);
  };

  const handleHttpResponse: HttpResponseHandler = (request, response): void => {
    const httpAssertions = getPendingHttpAssertions(activeAssertions);
    const completed = httpResponseResolver(request, response, httpAssertions);
    settle(completed);

    // Run immediate DOM check on assertions that were just activated
    for (const assertion of httpAssertions) {
      if (!assertion.httpPending) {
        checkImmediateResolved(assertion);
      }
    }
  };

  const handleHttpError: HttpErrorHandler = (errorInfo): void => {
    settle(
      httpErrorResolver(errorInfo, getPendingHttpAssertions(activeAssertions))
    );
  };

  const handleGlobalError: GlobalErrorHandler = (errorInfo): void => {
    settle(
      globalErrorResolver(errorInfo, getPendingAssertions(activeAssertions))
    );
  };

  const checkAssertions = (): void => {
    const pendingAssertions = getPendingDomAssertions(activeAssertions);
    if (!pendingAssertions.length) {
      return;
    }

    // TODO - should we only run the documentResolver on assertions pulled from storage?
    settle(
      documentResolver(getAssertionsForMpaMode(pendingAssertions), config)
    );
    settle(propertyResolver(pendingAssertions, config));
  };

  const settle = (completeAssertions: CompletedAssertion[]): void => {
    const toSettle = getAssertionsToSettle(completeAssertions);

    // Clear timeout timers for all completed assertions to ensure proper cleanup
    // This handles cases where assertions complete via resolvers other than timeout
    completeAssertions.forEach(assertion => {
      clearAssertionTimeout(assertion);
    });

    if (toSettle.length) {
      sendToCollector(toSettle, config);
    }

    // Trigger OOB assertions for any non-OOB assertions that passed.
    // OOB assertions are created after the DOM change has already happened,
    // so we immediately try to resolve them via immediateResolver rather than
    // waiting for a future mutation.
    const passed = toSettle.filter(a => a.status === "passed" && !a.oob);
    if (passed.length > 0) {
      const oobAssertions = findAndCreateOobAssertions(passed);
      if (oobAssertions.length > 0) {
        enqueueAssertions(oobAssertions);
        // Try to resolve immediately since the DOM state is already current
        const immediateResults = immediateResolver(oobAssertions, config);
        if (immediateResults.length > 0) {
          settle(immediateResults);
        }
      }
    }

    // Notify about assertion count change after settling
    if (assertionCountCallback) {
      assertionCountCallback(getPendingAssertions(activeAssertions).length);
    }
  };

  // Set up timeout timers for assertions loaded from storage
  activeAssertions.forEach(assertion => {
    createAssertionTimeout(assertion, config, (completedAssertion) => {
      settle([completedAssertion]);
    });
  });

  const processElements = (
    elements: HTMLElement[],
    triggers: string[]
  ): void => {
    const updatedAssertions = createElementProcessor(triggers)(elements);
    enqueueAssertions(updatedAssertions);

    // Check assertions immediately after enqueueing to handle already-loaded elements
    if (updatedAssertions.some(assertion => assertion.type === "loaded")) {
      checkAssertions();
    }
  };

  // Save the active assertions to storage
  const saveActiveAssertions = (): void => {
    const openAssertions = getPendingAssertions(activeAssertions);
    storeAssertions(getAssertionsForMpaMode(openAssertions));
  };

  const clearActiveAssertions = (): void => {
    // Clear all timeout timers before clearing assertions to prevent orphaned timers
    clearAllTimeouts(activeAssertions);

    activeAssertions.length = 0;

    // Notify about assertion count change
    if (assertionCountCallback) {
      assertionCountCallback(0);
    }
  };

  const handlePageUnload = (): void => {
    // Clear all timeout timers during page navigation or refresh to prevent orphaned timers
    clearAllTimeouts(activeAssertions);

    // Save active assertions for MPA mode
    saveActiveAssertions();
  };

  const setAssertionCountCallback = (callback: (count: number) => void): void => {
    assertionCountCallback = callback;
  };

  const getPendingAssertionCount = (): number => {
    return getPendingAssertions(activeAssertions).length;
  };

  // Expose the API for managing Processors, Resolvers and interacting with the manager
  return {
    handleEvent,
    handleMutations,
    handleHttpResponse,
    handleHttpError,
    handleGlobalError,
    checkAssertions,
    processElements,
    saveActiveAssertions,
    clearActiveAssertions,
    handlePageUnload,
    setAssertionCountCallback,
    getPendingAssertionCount,
  };
}
