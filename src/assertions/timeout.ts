import { Assertion, CompletedAssertion, Configuration } from "../types";
import { completeAssertion } from "./assertion";
import { httpResponseHeaderKey } from "../config";

// Timeout timer reference is now part of the base Assertion interface

/**
 * Generates appropriate failure message for timed out assertion
 */
function getFailureReasonForAssertion(
    assertion: Assertion,
    timeout: number
): string {
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
        case "response-headers":
        case "response-status":
            return `HTTP response not received within ${timeout}ms. Make sure the server responds with the header "${httpResponseHeaderKey}: ${assertion.assertionKey}" or the outgoing request has a "${httpResponseHeaderKey}=${assertion.assertionKey}" parameter.`;
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
    onTimeout: (completedAssertion: CompletedAssertion) => void
): void {
    // Clear any existing timeout for this assertion
    clearAssertionTimeout(assertion);

    const timeoutDuration = assertion.timeout || config.timeout;

    const timerId = setTimeout(() => {
        // Clear timer reference from assertion when it fires
        delete assertion.timeoutId;

        // Complete the assertion with failure due to timeout
        const completed = completeAssertion(
            assertion,
            false,
            getFailureReasonForAssertion(assertion, timeoutDuration)
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