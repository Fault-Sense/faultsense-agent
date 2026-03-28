import { Assertion, CompletedAssertion, Configuration } from "../types";
import { completeAssertion, getSiblingGroup } from "./assertion";

// Timeout timer reference is now part of the base Assertion interface

/**
 * Generates appropriate failure message for timed out assertion
 */
function getFailureReasonForAssertion(
    assertion: Assertion,
    timeout: number,
    allAssertions?: Assertion[]
): string {
    if (assertion.conditionKey) {
        const allKeys = [assertion.conditionKey];
        if (allAssertions) {
            const siblings = getSiblingGroup(assertion, allAssertions);
            allKeys.push(...siblings.map(s => s.conditionKey!));
        }
        const typeLabel = assertion.grouped ? "" : ` for "${assertion.type}"`;
        return `No conditional assertion${typeLabel} was met within ${timeout}ms. Conditions: ${allKeys.join(", ")}`;
    }

    switch (assertion.type) {
        case "added":
            return `Expected ${assertion.typeValue} to be added within ${timeout}ms.`;
        case "removed":
            return `Expected ${assertion.typeValue} to be removed within ${timeout}ms.`;
        case "updated":
            return `Expected ${assertion.typeValue} to be updated within ${timeout}ms.`;
        case "visible":
            return `Expected ${assertion.typeValue} to be visible within ${timeout}ms.`;
        case "hidden":
            return `Expected ${assertion.typeValue} to be hidden within ${timeout}ms.`;
        case "loaded":
            return `Expected ${assertion.typeValue} to be loaded within ${timeout}ms.`;
        case "route":
            return `Expected URL to match ${assertion.typeValue} within ${timeout}ms.`;
        case "stable":
            return `Expected ${assertion.typeValue} to remain stable within ${timeout}ms.`;
        case "after":
            return `Expected precondition(s) ${assertion.typeValue} to have passed within ${timeout}ms.`;
        case "emitted":
            return `Expected CustomEvent "${assertion.typeValue}" to be dispatched within ${timeout}ms.`;
        default:
            return `Unknown assertion type: ${assertion.type}`;
    }
}

/**
 * Creates a timeout timer for an assertion
 * The timer will fire when the assertion timeout duration elapses
 */
export function createAssertionTimeout(
    assertion: Assertion,
    config: Configuration,
    onTimeout: (completedAssertion: CompletedAssertion) => void,
    allAssertions?: Assertion[]
): void {
    // Clear any existing timeout for this assertion
    clearAssertionTimeout(assertion);

    const timeoutDuration = assertion.timeout;

    const timerId = setTimeout(() => {
        // Clear timer reference from assertion when it fires
        delete assertion.timeoutId;

        // Complete the assertion with failure due to timeout
        const completed = completeAssertion(
            assertion,
            false,
            getFailureReasonForAssertion(assertion, timeoutDuration, allAssertions)
        );

        if (completed) {
            onTimeout(completed);
        }
    }, timeoutDuration);

    // Store timer directly on assertion
    assertion.timeoutId = timerId;
}


/**
 * Clears the timeout timer for a specific assertion
 */
export function clearAssertionTimeout(assertion: Assertion): void {
    if (assertion.timeoutId) {
        clearTimeout(assertion.timeoutId);
        delete assertion.timeoutId;
    }
}

/**
 * Clears all active timeout timers from a collection of assertions
 * Used during system shutdown or cleanup
 */
export function clearAllTimeouts(assertions: Assertion[]): void {
    assertions.forEach(assertion => {
        clearAssertionTimeout(assertion);
    });
}

// --- GC Sweep ---

let gcTimerId: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule a GC sweep if one isn't already scheduled.
 * When it fires, calls the provided callback with stale assertions.
 */
export function scheduleGc(
    config: Configuration,
    getStaleAssertions: () => Assertion[],
    onStale: (stale: CompletedAssertion[]) => void
): void {
    if (gcTimerId) return;
    gcTimerId = setTimeout(() => {
        gcTimerId = null;
        const stale = getStaleAssertions();
        if (stale.length > 0) {
            const completed: CompletedAssertion[] = [];
            for (const assertion of stale) {
                const result = completeAssertion(
                    assertion,
                    false,
                    `Assertion did not resolve within ${config.gcInterval}ms.`
                );
                if (result) completed.push(result);
            }
            if (completed.length > 0) {
                onStale(completed);
            }
        }
        // Reschedule — getStaleAssertions is called again when the timer fires,
        // which will catch assertions that weren't stale yet during this sweep.
    }, config.gcInterval);
}

/**
 * Clear the GC timer. Called on page unload and cleanup.
 */
export function clearGcTimeout(): void {
    if (gcTimerId) {
        clearTimeout(gcTimerId);
        gcTimerId = null;
    }
}