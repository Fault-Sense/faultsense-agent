import { Assertion, AssertionStatus, CompletedAssertion } from "../types";
import { clearAssertionTimeout } from "./timeout";

export function findAssertion(
  assertion: Assertion,
  allAssertions: Assertion[]
): Assertion | undefined {
  return allAssertions.find(
    (existing) =>
      existing.assertionKey === assertion.assertionKey &&
      existing.type === assertion.type &&
      existing.modifiers["response-status"] === assertion.modifiers["response-status"]
  );
}

export const getPendingAssertions = (assertions: Assertion[]): Assertion[] => {
  return assertions.filter((a) => !a.endTime);
};

export const getPendingDomAssertions = (assertions: Assertion[]): Assertion[] => {
  return assertions.filter((a) => !a.endTime && !a.httpPending);
};

export const getPendingHttpAssertions = (assertions: Assertion[]): Assertion[] => {
  return assertions.filter((a) => !a.endTime && a.httpPending);
};

export const getAssertionsForMpaMode = (
  assertions: Assertion[]
): Assertion[] => {
  return assertions.filter((a) => a.mpa_mode);
};

export function isAssertionPending(assertion: Assertion): boolean {
  return !assertion.endTime && !assertion.status;
}

export function isAssertionCompleted(assertion: Assertion): boolean {
  return !!assertion.endTime && !!assertion.status;
}

export function retryCompletedAssertion(
  assertion: Assertion | CompletedAssertion,
  newAssertion: Assertion
): void {
  // allow targets and modifiers to be dynamically updated bewteen assertions
  assertion.modifiers = newAssertion.modifiers
  assertion.typeValue = newAssertion.typeValue
  assertion.elementSnapshot = newAssertion.elementSnapshot

  // Copy the completed fields to "previous" fields
  assertion.previousStatus = assertion.status;
  assertion.previousStatusReason = assertion.statusReason;
  assertion.previousStartTime = assertion.startTime;
  assertion.previousEndTime = assertion.endTime;

  // Clear current status, reason, and time for re-use
  assertion.status = undefined;
  assertion.statusReason = undefined;
  assertion.endTime = undefined;
  assertion.startTime = Date.now();
}

export function getAssertionsToSettle(
  completedAssertions: CompletedAssertion[]
): CompletedAssertion[] {
  return completedAssertions.filter(
    (assertion) =>
      assertion.endTime &&
      assertion.status !== "dismissed" &&
      assertion.previousStatus !== assertion.status &&
      assertion.previousStatusReason !== assertion.statusReason
  );
}

export function dismissAssertion(assertion: Assertion): CompletedAssertion | null {
  if (assertion.status !== "dismissed") {
    clearAssertionTimeout(assertion);

    return Object.assign(assertion, {
      status: "dismissed" as const,
      endTime: Date.now(),
      statusReason: "",
    }) as CompletedAssertion;
  }
  return null;
}

export function completeAssertion(
  assertion: Assertion,
  success: boolean,
  failureReason?: string
): CompletedAssertion | null {
  const newStatus: AssertionStatus = success ? "passed" : "failed";
  if (assertion.status !== newStatus) {
    // Clear the timeout timer when assertion completes
    clearAssertionTimeout(assertion);

    return Object.assign(assertion, {
      status: newStatus,
      endTime: Date.now(),
      statusReason: success ? "" : failureReason,
    }) as CompletedAssertion;
  }
  // NOOP
  return null;
}
