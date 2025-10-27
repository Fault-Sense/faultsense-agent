export function isVisible(element: HTMLElement): boolean {
  return !!(
    element.offsetWidth ||
    element.offsetHeight ||
    element.getClientRects().length
  );
}

export function isHidden(element: HTMLElement): boolean {
  return !isVisible(element);
}

export function containsText(element: HTMLElement, text: string): boolean {
  return element.textContent?.includes(text) ?? false;
}
