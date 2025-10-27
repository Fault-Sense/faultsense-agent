import { completeAssertion } from "../assertions/assertion";
import { Assertion, CompletedAssertion, GlobalErrorResolver } from "../types";

export const globalErrorResolver: GlobalErrorResolver = (
  errorInfo,
  assertions
) => {
  return assertions.reduce((acc: CompletedAssertion[], assertion) => {
    // TODO store more info about the error like .stack
    const completed = completeAssertion(assertion, false, errorInfo.message);
    if (completed) {
      acc.push(completed);
      return acc;
    }
    return acc;
  }, []);
};
