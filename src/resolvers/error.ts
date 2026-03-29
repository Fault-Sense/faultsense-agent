import { Assertion, CompletedAssertion, GlobalErrorResolver } from "../types";

export const globalErrorResolver: GlobalErrorResolver = (
  errorInfo,
  assertions
) => {
  for (const assertion of assertions) {
    if (!assertion.endTime) {
      // First error wins — don't overwrite existing errorContext
      if (!assertion.errorContext) {
        assertion.errorContext = errorInfo;
      }
    }
  }
  return []; // Tag only — don't fail assertions
};
