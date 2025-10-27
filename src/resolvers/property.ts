import { completeAssertion } from "../assertions/assertion";
import { Assertion, CompletedAssertion, AssertionCollectionResolver } from "../types";

/**
 * This AssertionCollectionResolver is used to scan the DOM for elements whose
 * events may have already fired, but we missed the event. We'll check
 * properties of the elements to see if the assertion passed.
 *
 * Example of a "missed event":
 * - Images that already loaded before the agent was initialized.
 */
export const propertyResolver: AssertionCollectionResolver = (
  assertions,
  _config
) => {
  return assertions.reduce((acc: CompletedAssertion[], assertion) => {
    const selector = assertion.typeValue as string;
    if (assertion.type === "loaded") {
      const el = document.querySelector(selector);

      /**
       * If we miss the load/error events for images,
       * we can check if the image has rendered to pass the assertion
       */
      if (el instanceof HTMLImageElement && el.complete) {
        const completed = completeAssertion(
          assertion,
          el.naturalWidth > 0,
          `Img ${assertion.typeValue} (${el.getAttribute(
            "src"
          )}) marked as complete, but has failed to render (naturalWidth is 0).`
        );
        if (completed) {
          acc.push(completed);
        }
      }
      /**
       * For video elements, we won't know for sure if it failed without an error event
       * But we can check if the video has loaded enough data to play to pass the assertion
       */
      if (el instanceof HTMLVideoElement && el.readyState >= 3) {
        const completed = completeAssertion(assertion, true, "");
        if (completed) {
          acc.push(completed);
        }
      }
    }
    return acc;
  }, []);
};
