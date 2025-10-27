import { AssertionCollectionResolver } from "../types";

// This resolver is now a no-op since timeout handling has been moved to individual timers
// Kept for backward compatibility but returns empty array as no polling-based timeout detection is needed
export const timeoutResolver: AssertionCollectionResolver = (assertions, config) => {
  return [];
};
