// @vitest-environment jsdom

/**
 * PAT-06 — Text-only mutation
 *
 * Catalog: docs/mutation-patterns.md#pat-06-text-only-mutation
 *
 * The only change is a `textContent` or `characterData` update — no element
 * structure change. src/processors/mutations.ts:42-43 promotes the
 * characterData target's parentElement into `updatedElements`, so
 * `updated` assertions with text-matches modifiers resolve without the
 * author having to target the text node directly.
 *
 * Representative frameworks: Solid, Svelte, Vue 3 reactive text bindings,
 * Lit template expressions, vanilla element.textContent = value.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";

describe("PAT-06 text-only mutation", () => {
  let ctx: ReturnType<typeof setupAgent>;

  beforeEach(() => {
    ctx = setupAgent();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("updated with text-matches resolves when a characterData mutation fires on a child text node", async () => {
    document.body.innerHTML = `
      <div id="counter">0</div>
      <button fs-trigger="click"
        fs-assert="cart/count"
        fs-assert-updated="#counter[text-matches=\\d+]">Increment</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // firstChild.nodeValue is unambiguously a characterData mutation
      // (textContent setter may take the childList path when multiple
      // children exist).
      (document.getElementById("counter")!.firstChild as Text).nodeValue = "1";
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "cart/count",
            status: "passed",
          }),
        ],
        ctx.config
      )
    );
  });

  it("updated with a non-matching text-matches pattern does NOT commit and times out", async () => {
    document.body.innerHTML = `
      <div id="counter">0</div>
      <button fs-trigger="click"
        fs-assert="cart/count-non-digits"
        fs-assert-updated="#counter[text-matches=^\\D+$]"
        fs-assert-timeout="500">Increment</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Mutates to a digit — does not match ^\D+$, so the assertion should
      // stay pending and time out.
      (document.getElementById("counter")!.firstChild as Text).nodeValue = "1";
    });

    button.click();

    ctx.advanceTime(600);

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "cart/count-non-digits",
            status: "failed",
          }),
        ],
        ctx.config
      )
    );
  });
});
