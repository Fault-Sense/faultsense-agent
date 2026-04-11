// @vitest-environment jsdom

/**
 * PAT-01 — Pre-existing target
 *
 * Catalog: docs/mutation-patterns.md#pat-01-pre-existing-target
 *
 * A selector that already matches at trigger time must NOT satisfy
 * mutation-observed assertion types (`added`, `removed`). Pre-existing
 * elements weren't "added by this trigger" — false-passing on them
 * dismisses the error variant under `fs-assert-mutex="conditions"`,
 * so the bug manifests as missing error telemetry.
 *
 * Representative frameworks: Turbo/HTMX server-rendered lists, SSR React,
 * Vue SSR, any CMS-driven list with an "add item" button.
 *
 * Regression anchor: commit b9b0fac added `added` and `removed` to the
 * `eventBasedTypes` exclusion list in src/assertions/manager.ts:56-104.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";

describe("PAT-01 pre-existing target", () => {
  let ctx: ReturnType<typeof setupAgent>;

  beforeEach(() => {
    // Defer init so the MutationObserver attaches AFTER the pre-existing
    // DOM is seeded — mirrors the real-world flow where Faultsense boots
    // on a server-rendered page.
    ctx = setupAgent({ deferInit: true });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("added: pre-matching selector must not false-pass the success variant (error wins under mutex=conditions)", async () => {
    document.body.innerHTML = `
      <div class="todo-item">Pre-existing item</div>
      <button
        fs-trigger="click"
        fs-assert="todos/add-item"
        fs-assert-mutex="conditions"
        fs-assert-added-success=".todo-item"
        fs-assert-added-error=".add-error"
        fs-assert-timeout="500">Add</button>
    `;
    ctx.init();

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Simulate the server responding with an error partial instead of
      // the happy-path new item.
      const err = document.createElement("p");
      err.className = "add-error";
      err.textContent = "Task description is required.";
      document.body.appendChild(err);
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "todos/add-item",
            conditionKey: "error",
            status: "passed",
          }),
        ],
        ctx.config
      )
    );
    // Only one payload — the success variant was dismissed by the error win.
    expect(ctx.sendToCollectorSpy).toHaveBeenCalledTimes(1);
  });

  it("removed: pre-missing target must not false-pass removed; assertion fails via SLA timeout", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="todos/remove-item"
        fs-assert-removed=".todo-item"
        fs-assert-timeout="500">Remove</button>
    `;
    ctx.init();

    const button = document.querySelector("button") as HTMLButtonElement;
    // Handler does nothing — no .todo-item exists, none gets removed.
    button.click();

    ctx.advanceTime(600);

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "todos/remove-item",
            status: "failed",
          }),
        ],
        ctx.config
      )
    );
  });
});
