import type { Assertion, CompletedAssertion, Configuration } from "../types";
import { completeAssertion } from "../assertions/assertion";

/**
 * Resolves "after" assertions by checking whether referenced parent
 * assertion keys have already passed in activeAssertions.
 *
 * Must receive the FULL activeAssertions array (including completed)
 * because it needs to find parent assertions with status === "passed".
 */
export function sequenceResolver(
  activeAssertions: Assertion[],
  _config: Configuration
): CompletedAssertion[] {
  const completed: CompletedAssertion[] = [];

  for (const assertion of activeAssertions) {
    if (assertion.type !== "after") continue;
    if (assertion.endTime) continue;

    const requiredKeys = assertion.typeValue.split(",").map(k => k.trim());
    const firstUnmet = requiredKeys.find(key =>
      !activeAssertions.some(a => a.assertionKey === key && a.status === "passed")
    );

    const result = completeAssertion(
      assertion,
      !firstUnmet
    );

    if (result) completed.push(result);
  }

  return completed;
}
