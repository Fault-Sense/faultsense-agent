import { Assertion, CompletedAssertion, Configuration } from "../types";
import { completeAssertion } from "./assertion";

// Timeout timer reference is now part of the base Assertion interface

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
        const completed = completeAssertion(assertion, false);

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
                const result = completeAssertion(assertion, false);
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