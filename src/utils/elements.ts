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

/**
 * Return a valid CSS selector for the given element.
 * Prefers the element's native id. Falls back to a stable
 * `data-fs-id` attribute that is created once and reused.
 */
export function ensureSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  const existing = el.getAttribute("data-fs-id");
  if (existing) return `[data-fs-id="${existing}"]`;
  const id = `fs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  el.setAttribute("data-fs-id", id);
  return `[data-fs-id="${id}"]`;
}
