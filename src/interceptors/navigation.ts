export type NavigationHandler = () => void;

export function interceptNavigation(handler: NavigationHandler): void {
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState(...args);
    handler();
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    originalReplaceState(...args);
    handler();
  };

  window.addEventListener("popstate", () => handler());
}
