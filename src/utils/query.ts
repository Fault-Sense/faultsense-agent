import { containsText, isHidden, isVisible } from "./elements";



export function cleanSelector(selector: string): string {
  return selector.replace(/:visible|:hidden|:contains\([^)]*\)/g, '').trim();
}

export function customQuerySelector(element: HTMLElement, selector: string): boolean {
  // Clean the selector by removing custom parts (like :visible, :hidden, :contains())
  let cleanedSelector = cleanSelector(selector);

  // First, use document.querySelector to check for a match with the cleaned selector
  if (!element.matches(cleanedSelector)) {
    return false;
  }

  // Now, handle custom logic (e.g., :visible, :hidden, :contains())

  // Handle :visible
  if (selector.includes(':visible')) {
    return isVisible(element);
  }

  // Handle :hidden
  if (selector.includes(':hidden')) {
    return isHidden(element);
  }

  // Handle :contains(text)
  if (selector.includes(':contains')) {
    const textToMatch = selector.match(/:contains\(([^)]+)\)/)?.[1];
    if (textToMatch) {
      return containsText(element, textToMatch);
    }
  }

  // If no custom selectors matched, just return true for the standard querySelector match
  return true;
};
