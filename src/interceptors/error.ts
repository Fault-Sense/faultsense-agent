import { GlobalErrorHandler } from "../types";

export function interceptErrors(handler: GlobalErrorHandler): void {
  // Wrap existing global error handlers
  const originalOnError = window.onerror;
  window.onerror = function(eventOrMessage, source, lineno, colno, error) {
    const message = ((eventOrMessage instanceof Event) ? error?.message : eventOrMessage as string) || "unknown error";
    
    // Create a standardized error info object
    const errorInfo = {
      message,
      stack: error?.stack,  // Capture the stack trace if available
      source: source || undefined,  // Source file (URL)
      lineno: lineno || undefined,  // Line number where the error occurred
      colno: colno || undefined,  // Column number where the error occurred
    };

    handler(errorInfo);

    if (originalOnError) {
      return originalOnError.call(window, eventOrMessage, source, lineno, colno, error);
    }
    return false;  // Prevent the default handler from being overridden
  };

  // Handle unhandled promise rejections
  const originalUnhandledRejection = window.onunhandledrejection;
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason ? (event.reason.message || 'Unhandled rejection') : 'Unhandled rejection';
    const stack = event.reason?.stack || undefined;  // Capture stack trace for the rejected promise

    const errorInfo = {
      message,
      stack,  // Stack trace from the rejected promise
      source: undefined,
      lineno: undefined,
      colno: undefined,
    };

    handler(errorInfo);

    if (originalUnhandledRejection) {
      originalUnhandledRejection.call(window, event);
    }
  });
}
