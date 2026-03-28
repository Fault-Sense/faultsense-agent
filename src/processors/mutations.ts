import { Assertion, ElementProcessor, ElementResolver } from "../types";

/**
 * Check if a mutation is a Faultsense internal attribute change (data-fs-* or fs-*)
 */
function isFsAttributeMutation(mutation: MutationRecord): boolean {
  return mutation.type === "attributes" && !!mutation.attributeName &&
    (mutation.attributeName.startsWith("data-fs-") || mutation.attributeName.startsWith("fs-"));
}

export function mutationHandler<T>(
  mutationsList: MutationRecord[],
  handler: ElementProcessor | ElementResolver,
  assertions: Assertion[]
): T[] {
  const addedElements: HTMLElement[] = [];
  const updatedElements: HTMLElement[] = [];
  const removedElements: HTMLElement[] = [];

  // Track elements that were ONLY mutated via Faultsense's own attributes.
  // The stable resolver uses this to filter out false positives.
  const fsOnlyMutationTargets = new Set<HTMLElement>();
  const nonFsMutationTargets = new Set<HTMLElement>();

  for (const mutation of mutationsList) {
    if (mutation.type === "childList") {
      mutation.addedNodes.forEach((node) => {
        if ((node as HTMLElement).getAttribute) {
          addedElements.push(node as HTMLElement);
          // Include descendants so `added` resolver can match nested targets
          // (e.g., React conditional rendering adds a wrapper containing the target)
          const descendants = (node as HTMLElement).querySelectorAll?.('*');
          if (descendants) {
            addedElements.push(...Array.from(descendants) as HTMLElement[]);
          }
        }
      });
      mutation.removedNodes.forEach((node) => {
        if ((node as HTMLElement).getAttribute) {
          removedElements.push(node as HTMLElement);
          const descendants = (node as HTMLElement).querySelectorAll?.('*');
          if (descendants) {
            removedElements.push(...Array.from(descendants) as HTMLElement[]);
          }
        }
      });

      // tracking the mutation target as updated allows us to monitor updates the parents subtree
      updatedElements.push(mutation.target as HTMLElement);
      nonFsMutationTargets.add(mutation.target as HTMLElement);
    }

    if (mutation.type === "attributes") {
      updatedElements.push(mutation.target as HTMLElement);
      if (isFsAttributeMutation(mutation)) {
        if (!nonFsMutationTargets.has(mutation.target as HTMLElement)) {
          fsOnlyMutationTargets.add(mutation.target as HTMLElement);
        }
      } else {
        nonFsMutationTargets.add(mutation.target as HTMLElement);
        fsOnlyMutationTargets.delete(mutation.target as HTMLElement);
      }
    }
    if (mutation.type === "characterData" && mutation.target.parentElement) {
      updatedElements.push(mutation.target.parentElement as HTMLElement);
      nonFsMutationTargets.add(mutation.target.parentElement as HTMLElement);
    }
  }

  // Attach fsOnlyMutationTargets to the element lists for the stable resolver.
  // We use a property on the updatedElements array to pass this through without
  // changing the handler signature.
  (updatedElements as any).__fsOnlyMutationTargets = fsOnlyMutationTargets;

  return handler(
    addedElements,
    removedElements,
    updatedElements,
    assertions
  ) as T[];
}
