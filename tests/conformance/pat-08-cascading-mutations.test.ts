// @vitest-environment jsdom

/**
 * PAT-08 — Cascading mutations
 *
 * Catalog: docs/mutation-patterns.md#pat-08-cascading-mutations
 *
 * A single trigger causes mutations across unrelated subtrees. The `oob`
 * (out-of-band) mechanism expresses the sibling case: "when the primary
 * assertion resolves, evaluate these other assertions in different parts
 * of the DOM."
 *
 * OOB assertions intentionally bypass the `b9b0fac` exclusion — they
 * resolve against current state at settle() time via a direct
 * immediateResolver call (src/assertions/manager.ts:340-363), because
 * the DOM change has already happened by the time OOB fires.
 *
 * Representative frameworks: Redux reducers with multiple slices, Zustand
 * stores, Turbo Stream broadcasts with multiple targets, HTMX hx-swap-oob,
 * any event-sourced state update that fans out to multiple DOM regions.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";

describe("PAT-08 cascading mutations", () => {
  let ctx: ReturnType<typeof setupAgent>;

  beforeEach(() => {
    // Real timers: OOB chains depend on the microtask chain from settle() →
    // findAndCreateOobAssertions → immediateResolver → settle.
    ctx = setupAgent({ fakeTimers: false });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("primary added resolves in one subtree; OOB added resolves in an unrelated subtree", async () => {
    document.body.innerHTML = `
      <aside id="badge-region"></aside>
      <main>
        <button fs-trigger="click"
          fs-assert="cart/add"
          fs-assert-added=".cart-item">Add</button>
        <ul id="cart-list"></ul>
      </main>
      <div id="badge"
        fs-assert="cart/badge-updated"
        fs-assert-oob="cart/add"
        fs-assert-added=".badge-count">Badge watcher</div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Unrelated subtree 1: the cart list.
      const item = document.createElement("li");
      item.className = "cart-item";
      document.getElementById("cart-list")!.appendChild(item);
      // Unrelated subtree 2: the badge region.
      const marker = document.createElement("span");
      marker.className = "badge-count";
      document.getElementById("badge-region")!.appendChild(marker);
    });

    button.click();

    await vi.waitFor(() => {
      const all = ctx.allPayloads();
      expect(all).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "cart/add",
            status: "passed",
          }),
          expect.objectContaining({
            assertionKey: "cart/badge-updated",
            status: "passed",
          }),
        ])
      );
    });
  });

  it("OOB chains bypass the pre-existing-target exclusion (resolves on current DOM state)", async () => {
    // The badge-count element is PRE-EXISTING, and the OOB watcher uses
    // `added`. In the non-OOB path, b9b0fac would exclude this from
    // immediateResolver. OOB intentionally bypasses that exclusion.
    document.body.innerHTML = `
      <span class="badge-count">1</span>
      <button fs-trigger="click"
        fs-assert="cart/add"
        fs-assert-added=".cart-item">Add</button>
      <div id="badge"
        fs-assert="cart/badge-present"
        fs-assert-oob="cart/add"
        fs-assert-visible=".badge-count">Badge watcher</div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Only the primary mutation fires — OOB sees current state.
      const item = document.createElement("li");
      item.className = "cart-item";
      document.body.appendChild(item);
    });

    button.click();

    await vi.waitFor(() => {
      const all = ctx.allPayloads();
      expect(all).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "cart/add",
            status: "passed",
          }),
          expect.objectContaining({
            assertionKey: "cart/badge-present",
            status: "passed",
          }),
        ])
      );
    });
  });
});
