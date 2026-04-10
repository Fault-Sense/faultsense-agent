// @vitest-environment jsdom

/**
 * PAT-02 — Delayed-commit mutation
 *
 * Catalog: docs/mutation-patterns.md#pat-02-delayed-commit-mutation
 *
 * A transient DOM mutation (loading class, spinner, placeholder, mid-swap
 * attributes) lands between the trigger and the final outcome. The agent
 * must keep the assertion pending across the transient and commit only on
 * the final state. This is the wait-for-pass resolver contract from
 * src/resolvers/dom.ts:158-219 — `handleAssertion` returns null on negative
 * modifier checks so the assertion stays alive for the next mutation batch.
 *
 * Representative frameworks: HTMX hx-swap with mid-swap classes, React 18
 * <Suspense>, Svelte transitions, Vue <Transition>, any CSS animation
 * class toggled by VDOM diffing.
 *
 * Regression anchor: PR #20 adopted wait-for-pass semantics after the HTMX
 * todolist example exposed false failures on transient loading classes.
 *
 * The `stable` and `invariant` assertion types are exceptions — both commit
 * on the first observed mutation (stable: inverted; invariant: perpetual
 * watch). This file locks in both the contract and its exceptions.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";

describe("PAT-02 delayed-commit mutation", () => {
  let ctx: ReturnType<typeof setupAgent>;

  beforeEach(() => {
    // Real timers: this suite relies on microtask-scheduled mutations
    // arriving in a subsequent MutationObserver callback.
    ctx = setupAgent({ fakeTimers: false });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("added: stays pending across a non-matching transient and commits on the final element", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click"
        fs-assert="form/submit"
        fs-assert-added=".result">Submit</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Transient element that does NOT match the assertion selector.
      const loading = document.createElement("div");
      loading.className = "loading-indicator";
      document.body.appendChild(loading);
      // Final element in a subsequent microtask → separate MutationObserver batch.
      queueMicrotask(() => {
        loading.remove();
        const result = document.createElement("div");
        result.className = "result";
        document.body.appendChild(result);
      });
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "form/submit",
            status: "passed",
          }),
        ],
        ctx.config
      )
    );
  });

  it("updated: stays pending while a modifier mismatches, commits on the final attribute state", async () => {
    document.body.innerHTML = `
      <div id="task" data-status="idle">Task</div>
      <button fs-trigger="click"
        fs-assert="task/complete"
        fs-assert-updated="#task[data-status=complete]">Run</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    const task = document.getElementById("task")!;
    button.addEventListener("click", () => {
      // Transient: modifier mismatch.
      task.setAttribute("data-status", "loading");
      // Final: flip the modifier in a later microtask.
      queueMicrotask(() => {
        task.setAttribute("data-status", "complete");
      });
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "task/complete",
            status: "passed",
          }),
        ],
        ctx.config
      )
    );
  });

  it("stable: commits on the first matching mutation (inverted-resolution exception)", async () => {
    document.body.innerHTML = `
      <div id="panel"><span>content</span></div>
      <button fs-trigger="click"
        fs-assert="panel/stable"
        fs-assert-stable="#panel"
        fs-assert-timeout="2000">Check</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Any mutation inside #panel is a stable failure.
      queueMicrotask(() => {
        document.querySelector("#panel span")!.textContent = "changed";
      });
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "panel/stable",
            status: "failed",
          }),
        ],
        ctx.config
      )
    );
  });

  it("invariant: commits on count violation immediately", async () => {
    // Invariants commit on negative checks so the failure reaches the
    // collector — the wait-for-pass exception documented in
    // src/resolvers/dom.ts:214-218.
    document.body.innerHTML = `
      <div id="list">
        <div class="item">one</div>
        <div class="item">two</div>
      </div>
      <div id="watcher"
        fs-assert="layout/item-count"
        fs-trigger="invariant"
        fs-assert-visible=".item[count=2]">Watching</div>
    `;
    // Re-init so the invariant is registered after the seeded DOM exists.
    ctx.init();

    // Violate: add a third item.
    const extra = document.createElement("div");
    extra.className = "item";
    document.getElementById("list")!.appendChild(extra);

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "layout/item-count",
            status: "failed",
          }),
        ]),
        ctx.config
      )
    );
  });
});
