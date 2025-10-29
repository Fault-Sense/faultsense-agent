import { HttpErrorHandler, HttpResponseHandler } from "../types";
import { assertionPrefix, httpResponseHeaderKey } from "../config";

// Network processing configuration
const NETWORK_CONFIG = {
  maxResponseSize: 1024 * 1024, // 1MB
  streamingThreshold: 512 * 1024, // 512KB - threshold for streaming processing
};

export function interceptNetwork(
  responseHandler: HttpResponseHandler,
  errorHandler: HttpErrorHandler
): void {
  // Intercept fetch requests
  const originalFetch = window.fetch;

  // Intercept XMLHttpRequest
  const originalXHR = window.XMLHttpRequest;

  window.fetch = async function (
    input: RequestInfo | URL,
    init: RequestInit = {}
  ): Promise<Response> {
    const url =
      typeof input === "string" || input instanceof URL
        ? input.toString()
        : input.url;
    const params = init.body || null;
    const requestHeaders = init.headers ? extractHeaders(init.headers) : {};

    try {
      const response = await originalFetch(input, init);

      // Extract response headers first to check if processing is needed
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Check if this response should be processed for assertions
      const shouldProcess = shouldProcessResponse(requestHeaders, responseHeaders, url);

      if (shouldProcess) {
        // Check response size limits before processing
        if (isResponseTooLarge(responseHeaders, url)) {
          // Skip processing for oversized responses
          return response;
        }

        // Clone the response only when processing is needed
        const clonedResponse = response.clone();
        const responseText = await processResponseText(clonedResponse, responseHeaders);

        if (!response.ok) {
          errorHandler({
            message: `HTTP Error: ${response.statusText}`,
            status: response.status,
            responseText,
            requestHeaders,
            responseHeaders,
            url,
          });
        } else {
          // Pass request info and standardized response info to responseHandler
          responseHandler(
            { url, params, headers: requestHeaders },
            { status: response.status, responseText, responseHeaders }
          );
        }
      }

      return response;
    } catch (error) {
      // Handle network error
      errorHandler({
        message: "Network Error",
        status: 0,
        responseText: "",
        requestHeaders,
        url,
      });
      // Ensure the error is passed through so it doesn't cause an unhandled rejection
      return Promise.reject(error); // **Important: Re-throw the error**
    }
  };

  class XMLHttpRequestWrapper extends originalXHR {
    private _requestHeaders: Record<string, string> = {};
    private _url: string | null = null;
    private _params: any = null;

    constructor() {
      super();
      this.addEventListener("readystatechange", () => {
        if (this.readyState === 4) {
          const responseHeaders: Record<string, string> = {};
          const rawHeaders = this.getAllResponseHeaders()
            .trim()
            .split(/[\r\n]+/);
          rawHeaders.forEach((line) => {
            const parts = line.split(": ");
            const key = parts.shift();
            const value = parts.join(": ");
            if (key) responseHeaders[key] = value;
          });

          // Check if this response should be processed for assertions
          const shouldProcess = shouldProcessResponse(
            this._requestHeaders,
            responseHeaders,
            this._url || ""
          );

          if (shouldProcess) {
            // Check response size limits before processing
            if (isResponseTooLarge(responseHeaders, this._url || "")) {
              // Skip processing for oversized responses
              return;
            }

            if (this.status >= 200 && this.status < 300) {
              // Success: Call the standardized response handler
              responseHandler(
                {
                  url: this._url || "",
                  params: this._params,
                  headers: this._requestHeaders,
                },
                {
                  status: this.status,
                  responseText: this.responseText || "",
                  responseHeaders,
                }
              );
            } else {
              // Call error handler for HTTP error status
              errorHandler({
                message: `HTTP Error: ${this.statusText}`,
                status: this.status,
                responseText: this.responseText || "",
                requestHeaders: this._requestHeaders,
                responseHeaders,
                url: this._url || "",
              });
            }
          }
        }
      });

      this.addEventListener("error", () => {
        // Handle network errors
        errorHandler({
          message: "Network Error",
          status: 0,
          responseText: "",
          requestHeaders: this._requestHeaders,
          url: this._url || "",
        });
      });

      this.addEventListener("abort", () => {
        // Handle aborted requests
        errorHandler({
          message: "Request Aborted",
          status: 0,
          responseText: "",
          requestHeaders: this._requestHeaders,
          url: this._url || "",
        });
      });
    }

    open(
      method: string,
      url: string | URL,
      async: boolean = true,
      user?: string | null,
      password?: string | null
    ): void {
      this._url = url.toString();
      super.open(method, this._url, async, user, password);
    }

    setRequestHeader(name: string, value: string): void {
      this._requestHeaders[name] = value; // Collect request headers
      super.setRequestHeader(name, value);
    }

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      this._params = body || null; // Save request params for the response handler
      super.send(body);
    }
  }

  window.XMLHttpRequest = XMLHttpRequestWrapper;
}

// Helper to check if a response should be processed for assertions
function shouldProcessResponse(
  requestHeaders: Record<string, string>,
  responseHeaders: Record<string, string>,
  url: string
): boolean {
  // Check if response has assertion identification header
  if (responseHeaders[httpResponseHeaderKey]) {
    return true;
  }

  // Check if request has assertion identification headers
  const hasAssertionHeaders = Object.keys(requestHeaders).some(key =>
    key.toLowerCase().startsWith(assertionPrefix.details) ||
    key.toLowerCase().startsWith(httpResponseHeaderKey)
  );

  if (hasAssertionHeaders) {
    return true;
  }

  // Check URL parameters for assertion identification
  try {
    const urlObj = new URL(url, window.location.origin);
    const hasAssertionParams = Array.from(urlObj.searchParams.keys()).some(key =>
      key.toLowerCase().startsWith(assertionPrefix.details) ||
      key.toLowerCase().startsWith(httpResponseHeaderKey)
    );

    if (hasAssertionParams) {
      return true;
    }
  } catch (error) {
    // Invalid URL, skip parameter check
  }

  return false;
}

// Helper to get response size from headers
function getResponseSize(responseHeaders: Record<string, string>): number {
  const contentLength = responseHeaders['content-length'] || responseHeaders['Content-Length'];
  return contentLength ? parseInt(contentLength, 10) : 0;
}

// Helper to check if response size exceeds limits
function isResponseTooLarge(responseHeaders: Record<string, string>, url: string): boolean {
  const size = getResponseSize(responseHeaders);
  if (size > NETWORK_CONFIG.maxResponseSize) {
    console.warn(`Faultsense: Skipping response processing for ${url} - size ${size} bytes exceeds limit of ${NETWORK_CONFIG.maxResponseSize} bytes`);
    return true;
  }
  return false;
}

// Helper to process response text with streaming for large responses
async function processResponseText(response: Response, responseHeaders: Record<string, string>): Promise<string> {
  const size = getResponseSize(responseHeaders);

  // Use streaming for large responses
  if (size > NETWORK_CONFIG.streamingThreshold && response.body) {
    return await processResponseStream(response.body);
  }

  // Use regular text() for smaller responses
  return await response.text();
}

// Helper to process response using streaming
async function processResponseStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let totalSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalSize += value.length;

      // Check size limit during streaming
      if (totalSize > NETWORK_CONFIG.maxResponseSize) {
        console.warn(`Faultsense: Stopping response processing - size exceeded ${NETWORK_CONFIG.maxResponseSize} bytes during streaming`);
        break;
      }

      result += decoder.decode(value, { stream: true });
    }

    // Final decode
    result += decoder.decode();

  } finally {
    reader.releaseLock();
  }

  return result;
}

// Helper to extract headers from RequestInit (used by fetch)
function extractHeaders(headersInit: HeadersInit): Record<string, string> {
  const headers: Record<string, string> = {};
  if (headersInit instanceof Headers) {
    headersInit.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(headersInit)) {
    headersInit.forEach(([key, value]) => {
      headers[key] = value;
    });
  } else {
    Object.assign(headers, headersInit);
  }
  return headers;
}
