// @vitest-environment jsdom

/**
 * PAT-03 — outerHTML replacement
 *
 * Catalog: docs/mutation-patterns.md#pat-03-outerhtml-replacement
 *
 * The trigger host's target node is swapped wholesale: old node lands in
 * `removedElements`, new node in `addedElements`, and `updatedElements`
 * contains only the parent (the childList mutation target). Assertions
 * over this shape must use `added` or `removed` — `updated` on the new
 * node will NOT match because the new identity is not in updatedElements.
 *
 * Representative frameworks: HTMX hx-swap="outerHTML", Turbo Stream
 * action="replace", any server-rendered partial replacement flow.
 *
 * Regression anchor: tests/assertions/outer-swap-toggle.test.ts locks in
 * the HTMX toggle-complete bug. This file is the canonical pattern entry;
 * the lower-level test stays in place as a direct regression.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";

describe("PAT-03 outerHTML replacement", () => {
  let ctx: ReturnType<typeof setupAgent>;

  beforeEach(() => {
    ctx = setupAgent({ fakeTimers: false });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("added matches the replaced node with the new classlist state", async () => {
    document.body.innerHTML = `
      <ul id="list">
        <li class="todo-item completed" data-status="completed">Ship it</li>
      </ul>
      <button fs-trigger="click"
        fs-assert="todos/uncheck"
        fs-assert-added=".todo-item[classlist=completed:false][data-status=active]">
        Uncheck
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // HTMX-style outerHTML swap: childList mutation on the parent,
      // removedNodes=[old], addedNodes=[new].
      const list = document.getElementById("list")!;
      list.innerHTML =
        '<li class="todo-item" data-status="active">Ship it</li>';
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "todos/uncheck",
            status: "passed",
          }),
        ],
        ctx.config
      )
    );
  });

  it("removed matches the old node even though the new node has the same selector", async () => {
    document.body.innerHTML = `
      <ul id="list">
        <li class="todo-item" data-id="abc">old</li>
      </ul>
      <button fs-trigger="click"
        fs-assert="todos/replace"
        fs-assert-removed=".todo-item[data-id=abc]">Replace</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("list")!.innerHTML =
        '<li class="todo-item" data-id="xyz">new</li>';
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "todos/replace",
            status: "passed",
          }),
        ],
        ctx.config
      )
    );
  });

  it("updated on the new node does NOT pass on an outerHTML swap (documents the instrumentation gotcha)", async () => {
    document.body.innerHTML = `
      <ul id="list">
        <li class="todo-item">old</li>
      </ul>
      <button fs-trigger="click"
        fs-assert="todos/updated-on-swap-does-not-work"
        fs-assert-updated=".todo-item[classlist=completed:true]"
        fs-assert-timeout="300">Swap</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("list")!.innerHTML =
        '<li class="todo-item completed">new</li>';
    });

    button.click();

    // updatedElements only contains the parent (#list), which doesn't match
    // `.todo-item`. The assertion stays pending and fails via the SLA timeout.
    await vi.waitFor(
      () =>
        expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              assertionKey: "todos/updated-on-swap-does-not-work",
              status: "failed",
            }),
          ],
          ctx.config
        ),
      { timeout: 2000 }
    );
  });
});
