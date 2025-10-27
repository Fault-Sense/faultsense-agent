import { completeAssertion } from "../assertions/assertion";
import { Assertion, CompletedAssertion } from "../types";

export function eventResolver(
  event: Event,
  assertions: Assertion[]
): CompletedAssertion[] {
  return assertions.reduce((acc: CompletedAssertion[], assertion) => {
    const selector = assertion.typeValue as string;
    const el = event.target as HTMLElement;
    if (assertion.type === "loaded") {
      if (!el || !el.matches(selector)) {
        return acc;
      }

      if (event.type === "load") {
        const completed = completeAssertion(assertion, true, "");
        if (completed) {
          acc.push(completed);
        }
      }
      if (event.type === "error") {
        const completed = completeAssertion(
          assertion,
          false,
          `Expected ${assertion.typeValue} (${el.getAttribute(
            "src"
          )}) to be loaded but onerror was triggered`
        );
        if (completed) {
          acc.push(completed);
        }
      }
    }
    return acc;
  }, []);
}
