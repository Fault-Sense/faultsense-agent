// @vitest-environment jsdom

/**
 * PAT-05 — Detach-reattach
 *
 * Catalog: docs/mutation-patterns.md#pat-05-detach-reattach
 *
 * A node briefly leaves the DOM and then returns. Two sub-patterns:
 * (a) re-added to the same parent (React keyed reorder, list sort), and
 * (b) moved between parents (React Portal, fragment reparenting). React 18
 * StrictMode produces a third variant: mount → unmount → remount across
 * three mutation batches.
 *
 * Representative frameworks: React 18 keyed reorder, React 18 StrictMode
 * double-invocation, Vue <Teleport>, Solid stores, any reconciler that
 * composes and decomposes subtrees.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";

describe("PAT-05 detach-reattach", () => {
  let ctx: ReturnType<typeof setupAgent>;

  beforeEach(() => {
    ctx = setupAgent({ fakeTimers: false });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("same-parent re-add: detach then re-insert passes an added assertion on the new node", async () => {
    document.body.innerHTML = `
      <div id="container"></div>
      <button fs-trigger="click"
        fs-assert="list/reorder"
        fs-assert-added=".target[data-v=2]">Reorder</button>
    `;

    const container = document.getElementById("container")!;
    const original = document.createElement("div");
    original.className = "target";
    original.setAttribute("data-v", "1");
    container.appendChild(original);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Detach the original synchronously.
      container.innerHTML = "";
      // Re-insert a fresh node (new version) in the next microtask.
      queueMicrotask(() => {
        const fresh = document.createElement("div");
        fresh.className = "target";
        fresh.setAttribute("data-v", "2");
        container.appendChild(fresh);
      });
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        ctx.config
      )
    );
  });

  it("cross-parent move: fragment reparent still satisfies an added assertion on the target", async () => {
    document.body.innerHTML = `
      <div id="left"><div class="portal-content">teleported</div></div>
      <div id="right"></div>
      <button fs-trigger="click"
        fs-assert="portal/move"
        fs-assert-added=".portal-content">Move</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Move the child from left to right — appendChild on the new parent
      // removes from the old parent automatically.
      const target = document.querySelector(".portal-content")!;
      document.getElementById("right")!.appendChild(target);
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        ctx.config
      )
    );
  });

  it("StrictMode double-mount: insert → remove → re-insert passes added on the final batch", async () => {
    document.body.innerHTML = `
      <div id="host"></div>
      <button fs-trigger="click"
        fs-assert="component/mount"
        fs-assert-added=".strict-child">Mount</button>
    `;

    const host = document.getElementById("host")!;
    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Batch 1: insert.
      const first = document.createElement("div");
      first.className = "strict-child";
      host.appendChild(first);
      // Batch 2: remove (StrictMode cleanup).
      queueMicrotask(() => {
        first.remove();
        // Batch 3: re-insert (StrictMode second mount).
        queueMicrotask(() => {
          const second = document.createElement("div");
          second.className = "strict-child";
          host.appendChild(second);
        });
      });
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        ctx.config
      )
    );
  });
});
