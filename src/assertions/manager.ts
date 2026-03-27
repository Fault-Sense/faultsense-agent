/**
 * Assertion Manager ** Mutation Warning **
 * The manager is designed to mutate the activeAssertions array
 * This may change.
 */
import { loadAssertions, storeAssertions } from "./storage";
import type {
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
import { globalErrorResolver } from "../resolvers/error";


import { eventTriggerAliases } from "../config";
import {
  findAssertion,
  getAssertionsForMpaMode,
  getAssertionsToSettle,
  getPendingAssertions,
  getPendingDomAssertions,
  getSiblingGroup,
  dismissSiblings,
  isAssertionCompleted,
  isAssertionPending,
  retryCompletedAssertion,
} from "./assertion";
import { createAssertionTimeout, clearAssertionTimeout, clearAllTimeouts, scheduleGc, clearGcTimeout } from "./timeout";
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

        // Retry all siblings so the full conditional group is restored
        for (const sibling of getSiblingGroup(existingAssertion, activeAssertions)) {
          retryCompletedAssertion(sibling, sibling as Assertion);
        }

        // Reset SLA timeout if the assertion has an explicit timeout
        if (existingAssertion.timeout > 0) {
          createAssertionTimeout(existingAssertion, config, (completedAssertion) => {
            settle([completedAssertion]);
          });
        }

        // Also run immediate check for retried assertions
        checkImmediateResolved(existingAssertion);

      } else if (existingAssertion && isAssertionPending(existingAssertion)) {
        // Re-trigger on a pending assertion — track the attempt timestamp
        if (!existingAssertion.attempts) existingAssertion.attempts = [];
        existingAssertion.attempts.push(Date.now());
      } else if (!existingAssertion) {
        activeAssertions.push(newAssertion);

        // Invariants have no timeout and no immediate check — they stay pending
        // until the resolver detects a violation. Everything else gets both.
        if (newAssertion.trigger !== "invariant") {
          // SLA timeout: only for assertions with explicit fs-assert-timeout.
          // Assertions without it resolve naturally or are cleaned up by GC.
          if (newAssertion.timeout > 0) {
            // For conditional assertions, only the first sibling in a group gets a timeout.
            const shouldCreateTimeout = !newAssertion.conditionKey || !activeAssertions.some(
              (a) =>
                a !== newAssertion &&
                a.assertionKey === newAssertion.assertionKey &&
                (newAssertion.grouped || a.type === newAssertion.type) &&
                a.conditionKey !== undefined &&
                a.timeoutId !== undefined
            );

            if (shouldCreateTimeout) {
              createAssertionTimeout(newAssertion, config, (completedAssertion) => {
                settle([completedAssertion]);
              }, newAssertion.conditionKey ? activeAssertions : undefined);
            }
          }

          checkImmediateResolved(newAssertion);
        }
      }
    });

    // Schedule GC if there are pending assertions without SLA timeouts
    scheduleGc(config, () => {
      const now = Date.now();
      return activeAssertions.filter(
        (a) => !a.endTime && a.trigger !== "invariant" && !a.timeout && (now - a.startTime) > config.gcInterval
      );
    }, (completed) => settle(completed));

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
    const elementProcessor = createElementProcessor(["mount", "invariant"]);
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
    // Dismiss siblings for any resolved conditional assertions
    for (const completed of completeAssertions) {
      if (completed.conditionKey && completed.status !== "dismissed") {
        const dismissed = dismissSiblings(completed, activeAssertions);
        completeAssertions.push(...dismissed);
      }
    }

    const toSettle = getAssertionsToSettle(completeAssertions);

    // Clear timeout timers for all completed assertions to ensure proper cleanup
    // This handles cases where assertions complete via resolvers other than timeout
    completeAssertions.forEach(assertion => {
      clearAssertionTimeout(assertion);
    });

    if (toSettle.length) {
      sendToCollector(toSettle, config);
    }

    // Auto-retry settled invariants so they re-enter the pending pool
    for (const a of toSettle) {
      if (a.trigger === "invariant") {
        retryCompletedAssertion(a, a as Assertion);
      }
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
        // Try to resolve immediately since the DOM state is already current.
        // Use the actual pending assertions from activeAssertions, not the raw
        // oobAssertions — enqueueAssertions may have matched them to existing
        // assertions via retryCompletedAssertion, discarding the new objects.
        const oobKeys = new Set(oobAssertions.map(a => a.assertionKey));
        const pendingOob = getPendingDomAssertions(activeAssertions).filter(
          a => a.oob && oobKeys.has(a.assertionKey)
        );
        const immediateResults = immediateResolver(pendingOob, config);
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

  // Set up SLA timeout timers for assertions loaded from storage that have explicit timeouts
  activeAssertions.forEach(assertion => {
    if (assertion.timeout > 0) {
      createAssertionTimeout(assertion, config, (completedAssertion) => {
        settle([completedAssertion]);
      });
    }
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
    // Clear all timers before clearing assertions to prevent orphaned timers
    clearGcTimeout();
    clearAllTimeouts(activeAssertions);

    activeAssertions.length = 0;

    // Notify about assertion count change
    if (assertionCountCallback) {
      assertionCountCallback(0);
    }
  };

  const handlePageUnload = (): void => {
    // Only run unload logic when actually unloading (visibilityState=hidden),
    // not during SSR hydration which can fire pagehide without a real navigation.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      const now = Date.now();

      // Auto-pass pending invariants that were never violated
      const pendingInvariants = activeAssertions.filter(
        (a) => a.trigger === "invariant" && !a.endTime && a.previousStatus !== "failed"
      );
      if (pendingInvariants.length > 0) {
        const completed = pendingInvariants.map((inv) =>
          Object.assign(inv, {
            status: "passed" as const,
            endTime: now,
            statusReason: "",
          })
        ) as CompletedAssertion[];
        sendToCollector(completed, config);
      }

      // Fail non-invariant assertions older than unloadGracePeriod.
      // Assertions younger than the grace period are silently dropped —
      // the user clicked and immediately navigated, not a failure.
      const staleOnUnload = activeAssertions.filter(
        (a) => !a.endTime && a.trigger !== "invariant" && (now - a.startTime) > config.unloadGracePeriod
      );
      if (staleOnUnload.length > 0) {
        const failed: CompletedAssertion[] = [];
        for (const a of staleOnUnload) {
          const result = Object.assign(a, {
            status: "failed" as const,
            endTime: now,
            statusReason: `Assertion did not resolve before page unload (age: ${now - a.startTime}ms).`,
          }) as unknown as CompletedAssertion;
          failed.push(result);
        }
        sendToCollector(failed, config);
      }
    }

    // Clear all timers during page navigation or refresh
    clearGcTimeout();
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
