// @vitest-environment jsdom

/**
 * PAT-10 — Shadow-DOM traversal
 *
 * Catalog: docs/mutation-patterns.md#pat-10-shadow-dom-traversal
 *
 * Status: GAP. The agent does not currently traverse shadow root boundaries.
 * `src/index.ts:67-76` attaches a single MutationObserver to `document.body`
 * with `{ subtree: true }`, and `subtree` does NOT descend into shadow roots.
 * The document-level queryselector paths in `src/resolvers/dom.ts` do not
 * walk `composedPath()` either. Mutations inside shadow trees are invisible.
 *
 * This test is written with `it.fails` so the expected-failure outcome is
 * the green state. When shadow DOM support ships in a future plan, flip
 * the expectation to `it` and the test becomes a positive regression lock.
 *
 * Representative frameworks: Lit, Stencil, Salesforce LWC, any web component
 * library relying on shadow encapsulation.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";

describe("PAT-10 shadow-dom traversal (gap — expected failure)", () => {
  let ctx: ReturnType<typeof setupAgent>;

  beforeEach(() => {
    ctx = setupAgent({ fakeTimers: false, deferInit: true });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  // it.fails: the assertion inside should FAIL for this test to pass.
  // When shadow DOM support ships, remove .fails and the test flips green.
  it.fails(
    "resolves an assertion targeting a node inside a shadow root",
    async () => {
      document.body.innerHTML = `<div id="host"></div>`;
      const host = document.getElementById("host")!;
      const shadow = host.attachShadow({ mode: "open" });

      // Build the trigger + assertion inside the shadow root.
      const trigger = document.createElement("button");
      trigger.setAttribute("fs-assert", "shadow/click");
      trigger.setAttribute("fs-trigger", "click");
      trigger.setAttribute("fs-assert-added", ".shadow-result");
      trigger.setAttribute("fs-assert-timeout", "300");
      trigger.textContent = "Click";
      shadow.appendChild(trigger);

      trigger.addEventListener("click", () => {
        const result = document.createElement("div");
        result.className = "shadow-result";
        shadow.appendChild(result);
      });

      ctx.init();
      trigger.click();

      // Under current (gap) behavior: the agent never sees the click or the
      // mutation because they live inside the shadow root. The assertion is
      // never even created, and the collector is never called.
      //
      // This waitFor is EXPECTED to time out → the test body is expected
      // to throw → `it.fails` converts the throw to a pass.
      await vi.waitFor(
        () =>
          expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
            [
              expect.objectContaining({
                assertionKey: "shadow/click",
                status: "passed",
              }),
            ],
            ctx.config
          ),
        { timeout: 500 }
      );
    }
  );
});
