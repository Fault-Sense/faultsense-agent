export type NavigationHandler = (previousPath?: string) => void;

/**
 * Intercept SPA navigation events and notify the manager.
 *
 * The handler is called on every pushState, replaceState, and popstate.
 * It receives the previous pathname so the manager can distinguish:
 *   - same-path changes (hash, query) → run route resolver only
 *   - path changes (hx-boost, React Router nav) → run the virtual-nav
 *     lifecycle flush in addition to the route resolver
 */
export function interceptNavigation(handler: NavigationHandler): void {
  let previousPath = typeof window !== "undefined" ? window.location.pathname : "";

  const dispatch = () => {
    const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
    const prev = previousPath;
    previousPath = currentPath;
    handler(prev);
  };

  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState(...args);
    dispatch();
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    originalReplaceState(...args);
    dispatch();
  };

  window.addEventListener("popstate", dispatch);
}
