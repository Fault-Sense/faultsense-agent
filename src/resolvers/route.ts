import { Assertion, CompletedAssertion, Configuration } from "../types";
import { completeAssertion } from "../assertions/assertion";

export function routeResolver(
  activeAssertions: Assertion[],
  config: Configuration
): CompletedAssertion[] {
  const completed: CompletedAssertion[] = [];

  for (const assertion of activeAssertions) {
    if (assertion.type !== "route") continue;
    if (assertion.endTime) continue;

    const pattern = new RegExp(`^${assertion.typeValue}$`);
    let matches = pattern.test(window.location.pathname);

    // Check optional search modifier (unanchored — substring match)
    if (matches && assertion.modifiers["search"]) {
      const searchPattern = new RegExp(assertion.modifiers["search"]);
      matches = searchPattern.test(window.location.search);
    }

    // Check optional hash modifier (unanchored — substring match)
    if (matches && assertion.modifiers["hash"]) {
      const hashPattern = new RegExp(assertion.modifiers["hash"]);
      matches = hashPattern.test(window.location.hash);
    }

    if (matches) {
      const result = completeAssertion(assertion, true, "");
      if (result) completed.push(result);
    }
  }

  return completed;
}
