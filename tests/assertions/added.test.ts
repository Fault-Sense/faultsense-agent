// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";

describe("Faultsense Agent - Assertion Type: added", () => {
  let ctx: ReturnType<typeof setupAgent>;

  beforeEach(() => {
    ctx = setupAgent();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("added assertion should pass", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-added="#panel" fs-assert="btn-click">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const panel = document.createElement("div");
      panel.id = "panel";
      document.body.appendChild(panel);
    });

    button.click();

    const addedPanel = document.querySelector("#panel");
    expect(addedPanel).not.toBeNull();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
          }),
        ],
        ctx.config
      )
    );
  });

  it("added assertion should pass when target is a descendant of the added node", async () => {
    document.body.innerHTML = `
      <div id="container"></div>
      <button fs-trigger="click" fs-assert-added=".nested-target" fs-assert="btn-click">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const wrapper = document.createElement("div");
      wrapper.className = "wrapper";
      const target = document.createElement("input");
      target.className = "nested-target";
      wrapper.appendChild(target);
      document.getElementById("container")!.appendChild(wrapper);
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
          }),
        ],
        ctx.config
      )
    );
  });

  it("added assertion should not pass", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-added="#panel" fs-assert="btn-click" fs-assert-timeout="1000">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    const panel = document.querySelector("#panel");
    expect(panel).toBeNull();

    // Simulate the passage of time to trigger the timeout
    ctx.advanceTime(1001);

    // Verify that sendToServer was called with the correct data
    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
          }),
        ],
        ctx.config
      )
    );
  });
});
