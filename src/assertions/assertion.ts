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
      existing.conditionKey === assertion.conditionKey
  );
}

export const getPendingAssertions = (assertions: Assertion[]): Assertion[] => {
  return assertions.filter((a) => !a.endTime);
};

export const getPendingDomAssertions = (assertions: Assertion[]): Assertion[] => {
  return assertions.filter((a) => !a.endTime);
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

  // Copy the completed fields to "previous" fields.
  // Skip dismissed — it's an internal state never sent to the collector,
  // so it shouldn't count as a status change for dedup purposes.
  if (assertion.status !== "dismissed") {
    assertion.previousStatus = assertion.status;
    assertion.previousStatusReason = assertion.statusReason;
  }
  assertion.previousStartTime = assertion.startTime;
  assertion.previousEndTime = assertion.endTime;

  // Clear current status, reason, and time for re-use
  assertion.status = undefined;
  assertion.statusReason = undefined;
  assertion.endTime = undefined;
  assertion.startTime = Date.now();
  assertion.attempts = undefined;
}

export function getAssertionsToSettle(
  completedAssertions: CompletedAssertion[]
): CompletedAssertion[] {
  return completedAssertions.filter(
    (assertion) =>
      assertion.endTime &&
      assertion.status !== "dismissed" &&
      assertion.previousStatus !== assertion.status
  );
}

export function getSiblingGroup(
  assertion: Assertion,
  allAssertions: Assertion[]
): Assertion[] {
  if (!assertion.conditionKey) return [];
  return allAssertions.filter(
    (a) =>
      a.assertionKey === assertion.assertionKey &&
      a.conditionKey !== undefined &&
      a !== assertion &&
      isMutexSibling(assertion, a)
  );
}

function isMutexSibling(resolved: Assertion, candidate: Assertion): boolean {
  if (!resolved.mutex) {
    // No mutex — default: same-type siblings only
    return candidate.type === resolved.type;
  }
  if (resolved.mutex === "each") {
    // All conditionals race
    return true;
  }
  // "conditions" mode — condition keys compete
  if (resolved.mutexKeys) {
    // Selective: only listed keys participate
    if (!resolved.mutexKeys.includes(resolved.conditionKey!)) return false;
    if (!candidate.conditionKey || !resolved.mutexKeys.includes(candidate.conditionKey)) return false;
  }
  // Dismiss different-key assertions, keep same-key co-members
  return candidate.conditionKey !== resolved.conditionKey;
}

export function dismissSiblings(
  assertion: Assertion,
  allAssertions: Assertion[]
): CompletedAssertion[] {
  const siblings = getSiblingGroup(assertion, allAssertions);
  const dismissed: CompletedAssertion[] = [];
  for (const sibling of siblings) {
    const result = dismissAssertion(sibling);
    if (result) dismissed.push(result);
  }
  return dismissed;
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
  // Invert pass/fail for inverted resolution types (e.g., stable).
  // Must run BEFORE the invariant guard so stable+invariant works correctly.
  if (assertion.invertResolution) {
    success = !success;
  }

  // Invariants only complete on failure or recovery (pass after fail).
  // A pass on a non-failed invariant means "condition holds" — stay pending.
  if (assertion.trigger === "invariant" && success && assertion.previousStatus !== "failed") {
    return null;
  }

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
