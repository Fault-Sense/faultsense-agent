/**
 * Custom event listener registry.
 * Manages document-level listeners and a Map-based element registry
 * for O(1) lookup at event-fire time (avoids querySelectorAll per fire).
 */
export interface CustomEventRegistry {
  registerElement(eventName: string, element: HTMLElement, handler: (event: Event) => void): void;
  ensureListener(eventName: string, handler: (event: Event) => void): void;
  deregisterElement(eventName: string, element: HTMLElement): void;
  getElements(eventName: string): Set<HTMLElement> | undefined;
  isRegistered(eventName: string): boolean;
  deregisterAll(): void;
}

export function createCustomEventRegistry(): CustomEventRegistry {
  const listeners = new Map<string, EventListener>();
  const elements = new Map<string, Set<HTMLElement>>();

  function registerElement(eventName: string, element: HTMLElement, handler: (event: Event) => void): void {
    // Track the element
    if (!elements.has(eventName)) {
      elements.set(eventName, new Set());
    }
    elements.get(eventName)!.add(element);

    ensureListener(eventName, handler);
  }

  /** Register a document-level listener without tracking an element (used for emitted assertions). */
  function ensureListener(eventName: string, handler: (event: Event) => void): void {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, handler);
      document.addEventListener(eventName, handler);
    }
  }

  function deregisterElement(eventName: string, element: HTMLElement): void {
    const set = elements.get(eventName);
    if (set) {
      set.delete(element);
    }
  }

  function getElements(eventName: string): Set<HTMLElement> | undefined {
    return elements.get(eventName);
  }

  function isRegistered(eventName: string): boolean {
    return listeners.has(eventName);
  }

  function deregisterAll(): void {
    for (const [eventName, handler] of listeners) {
      document.removeEventListener(eventName, handler);
    }
    listeners.clear();
    elements.clear();
  }

  return {
    registerElement,
    ensureListener,
    deregisterElement,
    getElements,
    isRegistered,
    deregisterAll,
  };
}
