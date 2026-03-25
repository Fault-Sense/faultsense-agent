import { completeAssertion, dismissAssertion } from "../assertions/assertion";
import {
  Assertion,
  CompletedAssertion,
  HttpErrorResolver,
  RequestInfo,
  ResponseInfo,
} from "../types";
import { httpResponseHeaderKey } from "../config";

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
      return null;
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

function getResponseStatus(assertion: Assertion): string | undefined {
  return assertion.modifiers["response-status"];
}

function getResponseJsonKey(assertion: Assertion): string | undefined {
  return assertion.modifiers["response-json-key"];
}

function isResponseConditional(assertion: Assertion): boolean {
  return !!(getResponseStatus(assertion) || getResponseJsonKey(assertion));
}

export function isHttpResponseForAssertion(
  assertion: Assertion,
  requestInfo: RequestInfo,
  responseInfo: ResponseInfo
): boolean {
  if (!isResponseConditional(assertion)) return false;

  // assertion key should match the faultsense response header value
  const expected = assertion.assertionKey;
  const actual =
    responseInfo.responseHeaders?.[httpResponseHeaderKey] ||
    requestInfo.headers[httpResponseHeaderKey] ||
    extractParamXRespFor(new URL(requestInfo.url, 'http://localhost').searchParams);

  return actual === expected;
}

function statusMatches(condition: string, actual: number): boolean {
  if (condition.includes('x')) {
    // Range match: "2xx" matches 200-299, "4xx" matches 400-499
    const prefix = condition[0];
    return String(actual)[0] === prefix;
  }
  return Number(condition) === actual;
}

function findMatchingStatusAssertion(assertions: Assertion[], status: number): Assertion | null {
  // Exact match takes priority over range
  const exact = assertions.find(a => {
    const condition = getResponseStatus(a)!;
    return !condition.includes('x') && statusMatches(condition, status);
  });
  if (exact) return exact;

  // Then range match
  return assertions.find(a => statusMatches(getResponseStatus(a)!, status)) || null;
}

function findMatchingJsonAssertion(
  assertions: Assertion[],
  parsedBody: Record<string, unknown>
): Assertion | null {
  return assertions.find(a => {
    const key = getResponseJsonKey(a)!;
    return key in parsedBody && parsedBody[key];
  }) || null;
}

export function httpResponseResolver(
  requestInfo: RequestInfo,
  responseInfo: ResponseInfo,
  assertions: Assertion[]
): CompletedAssertion[] {
  const completed: CompletedAssertion[] = [];

  // Find all response-conditional assertions for this request
  const responseAssertions = assertions.filter(a =>
    isHttpResponseForAssertion(a, requestInfo, responseInfo)
  );

  if (responseAssertions.length === 0) return completed;

  // Separate by condition type
  const statusAssertions = responseAssertions.filter(a => getResponseStatus(a));
  const jsonAssertions = responseAssertions.filter(a => getResponseJsonKey(a));

  // Handle status conditions (existing logic)
  if (statusAssertions.length > 0) {
    const matched = findMatchingStatusAssertion(statusAssertions, responseInfo.status);

    if (matched) {
      matched.httpPending = false;
      for (const sibling of statusAssertions) {
        if (sibling === matched) continue;
        const dismissed = dismissAssertion(sibling);
        if (dismissed) completed.push(dismissed);
      }
    } else {
      const declaredConditions = statusAssertions.map(a => getResponseStatus(a)).join(', ');
      for (const assertion of statusAssertions) {
        const failed = completeAssertion(
          assertion,
          false,
          `HTTP response status ${responseInfo.status} did not match any declared condition (${declaredConditions})`
        );
        if (failed) completed.push(failed);
      }
    }
  }

  // Handle json body conditions
  if (jsonAssertions.length > 0) {
    let parsedBody: Record<string, unknown> | null = null;
    try {
      parsedBody = JSON.parse(responseInfo.responseText);
    } catch {
      // Invalid JSON — fail all json assertions
      for (const a of jsonAssertions) {
        const failed = completeAssertion(a, false, "Response body is not valid JSON");
        if (failed) completed.push(failed);
      }
      return completed;
    }

    if (parsedBody && typeof parsedBody === "object") {
      const matched = findMatchingJsonAssertion(jsonAssertions, parsedBody);

      if (matched) {
        matched.httpPending = false;
        for (const sibling of jsonAssertions) {
          if (sibling === matched) continue;
          const dismissed = dismissAssertion(sibling);
          if (dismissed) completed.push(dismissed);
        }
      } else {
        const declaredKeys = jsonAssertions.map(a => getResponseJsonKey(a)).join(', ');
        for (const a of jsonAssertions) {
          const failed = completeAssertion(
            a,
            false,
            `Response body does not contain any declared key (${declaredKeys})`
          );
          if (failed) completed.push(failed);
        }
      }
    } else {
      for (const a of jsonAssertions) {
        const failed = completeAssertion(a, false, "Response body is not a JSON object");
        if (failed) completed.push(failed);
      }
    }
  }

  return completed;
}

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
