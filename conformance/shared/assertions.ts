/**
 * Shared Playwright helpers for Layer 2 conformance drivers.
 *
 * Each driver reads assertion payloads off `window.__fsAssertions` — the
 * array populated by `conformance/shared/collector.js` each time the agent
 * invokes the custom collector. These helpers wrap the common
 * `page.evaluate` + poll pattern.
 *
 * The captured shape is the wire-format ApiPayload (snake_case), not the
 * agent's internal CompletedAssertion. See src/assertions/server.ts
 * `toPayload` for the mapping.
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Shape of a captured assertion payload. Mirrors `ApiPayload` from
 * src/types.ts but keeps everything optional so drivers can read
 * forward-compatible fields without the helper needing an update.
 */
export interface CapturedPayload {
  api_key?: string;
  status: "passed" | "failed" | "dismissed";
  timestamp?: string;
  assertion_type: string;
  assertion_type_value?: string;
  assertion_key: string;
  assertion_trigger?: string;
  assertion_type_modifiers?: Record<string, string>;
  attempts?: unknown[];
  condition_key?: string;
  release_label?: string;
  element_snapshot?: string;
  error_context?: unknown;
  user_context?: unknown;
  // Any other agent fields are passed through.
  [key: string]: unknown;
}

/**
 * Return every captured payload on the page. Cheap — each call is one
 * round-trip to the browser.
 */
export async function readCapturedAssertions(
  page: Page
): Promise<CapturedPayload[]> {
  return page.evaluate(() => (window as any).__fsAssertions ?? []);
}

/**
 * Clear the captured assertion buffer. Call in `beforeEach` if a driver
 * needs a clean slate across scenarios.
 */
export async function resetCapturedAssertions(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__fsAssertions = [];
  });
}

/**
 * Poll `window.__fsAssertions` until a matching payload appears, then
 * return it. Throws via Playwright's expect() timeout if no payload
 * matches within `options.timeout` (default 5000 ms).
 *
 * The match predicate defaults to "payload with this assertion_key". Pass
 * `options.match` to add status/type constraints inline.
 */
export async function waitForFsAssertion(
  page: Page,
  assertionKey: string,
  options: {
    timeout?: number;
    match?: (payload: CapturedPayload) => boolean;
  } = {}
): Promise<CapturedPayload> {
  const timeout = options.timeout ?? 5000;
  const match = options.match ?? (() => true);

  let found: CapturedPayload | undefined;
  await expect
    .poll(
      async () => {
        const all = await readCapturedAssertions(page);
        found = all.find(
          (a) => a.assertion_key === assertionKey && match(a)
        );
        return found ? "found" : "pending";
      },
      {
        timeout,
        message: `Waiting for assertion "${assertionKey}" on window.__fsAssertions`,
      }
    )
    .toBe("found");

  return found as CapturedPayload;
}

/**
 * Fetch the first payload with the given assertion_key and assert its
 * shape matches the expected fields. Shorthand for `waitForFsAssertion`
 * plus `toMatchObject`.
 */
export async function assertPayload(
  page: Page,
  assertionKey: string,
  expected: Partial<CapturedPayload>,
  options: { timeout?: number } = {}
): Promise<CapturedPayload> {
  const assertion = await waitForFsAssertion(page, assertionKey, {
    timeout: options.timeout,
  });
  expect(assertion).toMatchObject(expected);
  return assertion;
}
