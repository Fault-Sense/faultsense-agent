import { Assertion, ElementProcessor, ElementResolver } from "../types";

export function mutationHandler<T>(
  mutationsList: MutationRecord[],
  handler: ElementProcessor | ElementResolver,
  assertions: Assertion[]
): T[] {
  const addedElements: HTMLElement[] = [];
  const updatedElements: HTMLElement[] = [];
  const removedElements: HTMLElement[] = [];

  for (const mutation of mutationsList) {
    if (mutation.type === "childList") {
      mutation.addedNodes.forEach((node) => {
        if ((node as HTMLElement).getAttribute) {
          addedElements.push(node as HTMLElement);
        }
      });
      mutation.removedNodes.forEach((node) => {
        if ((node as HTMLElement).getAttribute) {
          removedElements.push(node as HTMLElement);
        }
      });

      // tracking the mutation target as updated allows us to monitor updates the parents subtree
      updatedElements.push(mutation.target as HTMLElement);
    }

    if (mutation.type === "attributes") {
      updatedElements.push(mutation.target as HTMLElement);
    }
    if (mutation.type === "characterData" && mutation.target.parentElement) {
      updatedElements.push(mutation.target.parentElement as HTMLElement);
    }
  }

  return handler(
    addedElements,
    removedElements,
    updatedElements,
    assertions
  ) as T[];
}
