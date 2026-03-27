/**
 * HTTP Response Resolver — NOT CURRENTLY USED
 *
 * This module was part of the network-conditional assertion system (fs-assert-{type}-{status},
 * fs-assert-{type}-json-{key}, fs-resp-for). It was replaced by UI-conditional assertions
 * (fs-assert-{type}-{condition-key}) which resolve purely based on DOM outcomes.
 *
 * Kept in the repo for potential future use with client-side context signals.
 */

import { completeAssertion, dismissAssertion } from "../assertions/assertion";
import { Assertion, CompletedAssertion } from "../types";

// --- HTTP types (moved here from types.ts since they are only used by this module) ---

export interface RequestInfo {
  url: string;
  params?: any;
  headers: Record<string, string>;
}

export interface ResponseInfo {
  status: number;
  responseText: string;
  responseHeaders?: Record<string, string>;
}

export interface HttpErrorInfo {
  message: string;
  status: number;
  responseText: string;
  requestHeaders: Record<string, string>;
  responseHeaders?: Record<string, string>;
  url: string;
}

export type HttpResponseHandler = (
  requestInfo: RequestInfo,
  responseInfo: ResponseInfo
) => void;

export type HttpErrorHandler = (errorInfo: HttpErrorInfo) => void;

export type HttpResponseResolver = (
  requestInfo: RequestInfo,
  responseInfo: ResponseInfo,
  activeAssertions: Assertion[]
) => CompletedAssertion[];

export type HttpErrorResolver = (
  errorInfo: HttpErrorInfo,
  activeAssertions: Assertion[]
) => CompletedAssertion[];

// --- Constants ---

const httpResponseHeaderKey = "fs-resp-for";

// --- Helpers ---

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

  const expected = assertion.assertionKey;
  const actual =
    responseInfo.responseHeaders?.[httpResponseHeaderKey] ||
    requestInfo.headers[httpResponseHeaderKey] ||
    extractParamXRespFor(new URL(requestInfo.url, 'http://localhost').searchParams);

  return actual === expected;
}

function statusMatches(condition: string, actual: number): boolean {
  if (condition.includes('x')) {
    const prefix = condition[0];
    return String(actual)[0] === prefix;
  }
  return Number(condition) === actual;
}

function findMatchingStatusAssertion(assertions: Assertion[], status: number): Assertion | null {
  const exact = assertions.find(a => {
    const condition = getResponseStatus(a)!;
    return !condition.includes('x') && statusMatches(condition, status);
  });
  if (exact) return exact;

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

  const responseAssertions = assertions.filter(a =>
    isHttpResponseForAssertion(a, requestInfo, responseInfo)
  );

  if (responseAssertions.length === 0) return completed;

  const statusAssertions = responseAssertions.filter(a => getResponseStatus(a));
  const jsonAssertions = responseAssertions.filter(a => getResponseJsonKey(a));

  if (statusAssertions.length > 0) {
    const matched = findMatchingStatusAssertion(statusAssertions, responseInfo.status);
  const statusAssertions = responseAssertions.filter(a => getResponseStatus(a));
  const jsonAssertions = responseAssertions.filter(a => getResponseJsonKey(a));

  if (statusAssertions.length > 0) {
    const matched = findMatchingStatusAssertion(statusAssertions, responseInfo.status);

    if (matched) {
      (matched as any).httpPending = false;
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

  if (jsonAssertions.length > 0) {
    let parsedBody: Record<string, unknown> | null = null;
    try {
      parsedBody = JSON.parse(responseInfo.responseText);
    } catch {
      for (const a of jsonAssertions) {
        const failed = completeAssertion(a, false, "Response body is not valid JSON");
        if (failed) completed.push(failed);
      }
      return completed;
    }

    if (parsedBody && typeof parsedBody === "object") {
      const matched = findMatchingJsonAssertion(jsonAssertions, parsedBody);

      if (matched) {
        (matched as any).httpPending = false;
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
    const completed = completeAssertion(assertion, false, errorInfo.message);
    if (completed) {
      acc.push(completed);
    }
    return acc;
  }, []);
};
