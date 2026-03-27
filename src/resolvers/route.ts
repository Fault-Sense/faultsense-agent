import { Assertion, CompletedAssertion, Configuration } from "../types";
import { completeAssertion } from "../assertions/assertion";

interface RoutePattern {
  pathname: string;
  params: [string, string][];
  hash: string | null;
}

/**
 * Parse a route pattern string as a URL-like structure.
 * The pattern is treated as a URL: pathname, query params, and hash fragment.
 * Each part (pathname, param values, hash) is treated as a regex pattern.
 *
 * Manual string splitting is used instead of URL()/URLSearchParams because
 * those APIs mangle regex metacharacters:
 *   - URL() converts \ to / in pathnames (per URL spec)
 *   - URLSearchParams converts + to space (per form encoding spec)
 *
 * The actual URL being matched against uses URLSearchParams for order-independent
 * param matching (see routeResolver).
 *
 * Examples:
 *   "/dashboard"                     → pathname only
 *   "/dashboard?id=\d+"              → pathname + query param regex
 *   "/callback?code=.*&state=\w+"    → pathname + multiple params (order-independent)
 *   "/docs#section-\d+"              → pathname + hash regex
 *   "/page?tab=settings#panel"       → all three
 */
export function parseRoutePattern(pattern: string): RoutePattern {
  let remaining = pattern;
  let hash: string | null = null;

  // Split on first # (fragment always comes last in a URL)
  const hashIdx = remaining.indexOf("#");
  if (hashIdx !== -1) {
    hash = remaining.slice(hashIdx + 1);
    remaining = remaining.slice(0, hashIdx);
  }

  // Split on first ? (query string)
  let pathname = remaining;
  const params: [string, string][] = [];
  const queryIdx = remaining.indexOf("?");
  if (queryIdx !== -1) {
    pathname = remaining.slice(0, queryIdx);
    const search = remaining.slice(queryIdx + 1);

    if (search) {
      for (const pair of search.split("&")) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx !== -1) {
          params.push([pair.slice(0, eqIdx), pair.slice(eqIdx + 1)]);
        } else if (pair) {
          params.push([pair, ""]);
        }
      }
    }
  }

  return { pathname, params, hash };
}

/**
 * Validate that all regex parts of a route pattern are valid.
 * Returns null if valid, or an error message describing what's invalid.
 */
export function validateRoutePattern(pattern: RoutePattern): string | null {
  try {
    new RegExp(`^${pattern.pathname}$`);
  } catch {
    return `pathname "${pattern.pathname}"`;
  }

  for (const [key, value] of pattern.params) {
    if (value) {
      try {
        new RegExp(`^${value}$`);
      } catch {
        return `query param "${key}" pattern "${value}"`;
      }
    }
  }

  if (pattern.hash !== null) {
    try {
      new RegExp(`^${pattern.hash}$`);
    } catch {
      return `hash pattern "${pattern.hash}"`;
    }
  }

  return null;
}

export function routeResolver(
  activeAssertions: Assertion[],
  config: Configuration
): CompletedAssertion[] {
  const completed: CompletedAssertion[] = [];

  for (const assertion of activeAssertions) {
    if (assertion.type !== "route") continue;
    if (assertion.endTime) continue;

    const pattern = parseRoutePattern(assertion.typeValue);

    // 1. Check pathname (anchored regex)
    const pathRegex = new RegExp(`^${pattern.pathname}$`);
    if (!pathRegex.test(window.location.pathname)) continue;

    // 2. Check each expected search param (anchored regex on values, order-independent)
    if (pattern.params.length > 0) {
      const actualParams = new URLSearchParams(window.location.search);
      let paramsMatch = true;
      for (const [key, valuePattern] of pattern.params) {
        const actualValue = actualParams.get(key);
        if (actualValue === null) {
          paramsMatch = false;
          break;
        }
        if (valuePattern) {
          const valRegex = new RegExp(`^${valuePattern}$`);
          if (!valRegex.test(actualValue)) {
            paramsMatch = false;
            break;
          }
        }
      }
      if (!paramsMatch) continue;
    }

    // 3. Check hash (anchored regex, without #)
    if (pattern.hash !== null) {
      const actualHash = window.location.hash.slice(1); // strip leading #
      const hashRegex = new RegExp(`^${pattern.hash}$`);
      if (!hashRegex.test(actualHash)) continue;
    }

    const result = completeAssertion(assertion, true, "");
    if (result) completed.push(result);
  }

  return completed;
}
