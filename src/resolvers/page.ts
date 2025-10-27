import { completeAssertion } from "../assertions/assertion";
import { CompletedAssertion, AssertionCollectionResolver } from "../types";

export const beforeUnloadResolver: AssertionCollectionResolver = (
  assertions,
  _config
) => {
  return assertions.reduce((acc: CompletedAssertion[], assertion) => {
    const completed = completeAssertion(
      assertion,
      false,
      "Page unloaded before assertion completed. Enable MPA Mode ({mpa: true}) in the config to complete assertions in the next Document."
    );
    if (completed) {
      acc.push(completed);
    }
    return acc;
  }, []);
};
