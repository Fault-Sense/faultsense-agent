import { completeAssertion } from "../assertions/assertion";
import {
  Assertion,
  CompletedAssertion,
  HttpErrorResolver,
  HttpResponseResolver,
  RequestInfo,
  ResponseInfo,
} from "../types";
import { httpResponseAssertions, httpResponseHeaderKey } from "../config";
import { isSubset, prettyPrintHeaders } from "../utils/object";

// Helper function to extract responseHeaderKey from request params (BodyInit or other types)
function extractParamXRespFor(
  params?: unknown,
  fsHeaderKey: string = httpResponseHeaderKey
): string | null {
  if (typeof params === "string") {
    try {
      const parsedParams = JSON.parse(params);
      return parsedParams[fsHeaderKey] || null;
    } catch {
      return null; // If it's not a JSON string, we can't extract config.httpResponseHeaderKey
    }
  } else if (params instanceof URLSearchParams) {
    return params.get(fsHeaderKey);
  } else if (params instanceof FormData) {
    return params.get(fsHeaderKey)?.toString() || null;
  } else if (params && typeof params === "object") {
    return (params as Record<string, any>)[fsHeaderKey] || null;
  }
  return null;
}

export function isHttpResponseForAssertion(
  assertion: Assertion,
  requestInfo: RequestInfo,
  responseInfo: ResponseInfo
): boolean {
  // assertion.type must be in HTTP response types
  if (!httpResponseAssertions.includes(assertion.type)) {
    return false;
  }

  // assertion key should match the faultsense response header value
  const expected = assertion.assertionKey;
  const actual =
    responseInfo.responseHeaders?.[httpResponseHeaderKey] ||
    requestInfo.headers[httpResponseHeaderKey] ||
    extractParamXRespFor(new URL(requestInfo.url, 'http://localhost').searchParams);

  return actual === expected;
}

export const httpResponseResolver: HttpResponseResolver = (
  requestInfo,
  responseInfo,
  assertions
) => {
  const now = Date.now();
  return assertions.reduce((acc: CompletedAssertion[], assertion) => {
    // This assertions is not applicable to this response
    if (!isHttpResponseForAssertion(assertion, requestInfo, responseInfo)) {
      return acc;
    }

    if (assertion.type === "response-headers") {
      let completed;
      try {
        const expectedHeaders: Record<string, any> = JSON.parse(
          assertion.typeValue as string
        );
        const actualHeaders = responseInfo.responseHeaders as Record<
          string,
          any
        >;
        completed = completeAssertion(
          assertion,
          isSubset(expectedHeaders, actualHeaders),
          `Expected HTTP response headers not found in actual headers:\n\nExpected:\n${prettyPrintHeaders(
            expectedHeaders
          )}\n\nActual:\n${prettyPrintHeaders(actualHeaders)}`
        );
      } catch {
        completed = completeAssertion(
          assertion,
          false,
          `Expected HTTP response headers is not a valid JSON`
        );
      }

      if (completed) {
        acc.push(completed);
      }

      return acc;
    }

    if (assertion.type === "response-status") {
      let actual = Number(responseInfo.status);
      let expected = Number(assertion.typeValue) as Number;
      const completed = completeAssertion(
        assertion,
        actual === expected,
        `HTTP response status (${actual}) does not match the expected status (${expected})`
      );
      if (completed) {
        acc.push(completed);
      }
      return acc;
    }

    const completed = completeAssertion(
      assertion,
      false,
      `Assert type: ${assertion.type} not handled for HTTP responses`
    );
    if (completed) {
      acc.push(completed);
    }
    return acc;
  }, []);
};

export const httpErrorResolver: HttpErrorResolver = (errorInfo, assertions) => {
  return assertions.reduce((acc: CompletedAssertion[], assertion) => {
    // TODO store more info about the error
    const completed = completeAssertion(assertion, false, errorInfo.message);
    if (completed) {
      acc.push(completed);
    }
    return acc;
  }, []);
};
