// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Assertion Types: removed", () => {
  let cleanupFn: ReturnType<typeof init>;
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
  let sendToServerMock: ReturnType<typeof vi.spyOn>;
  let fixedDateNow = 1230000000000; // Fixed timestamp value
  let config = {
    apiKey: "TEST_API_KEY",
    releaseLabel: "0.0.0",
    gcInterval: 30000, unloadGracePeriod: 2000,
    collectorURL: "http://localhost:9000",
  };

  beforeEach(() => {
    if (typeof HTMLElement === "undefined") {
      (global as any).HTMLElement = class { };
    }

    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);

    sendToServerMock = vi
      .spyOn(resolveModule, "sendToCollector")
      .mockImplementation(() => { });
    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => { });

    // Initialize the agent script
    cleanupFn = init(config);
  });

  afterEach(() => {
    cleanupFn();
    // Restore original timers and mocks
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleErrorMock.mockRestore();
    sendToServerMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
  });

  it("removed assertion should pass", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-removed="#panel" fs-assert="btn-click">Click</button>
      <div id="panel"></div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("panel")?.remove();
    });
    button.click();

    const addedPanel = document.querySelector("#panel");
    expect(addedPanel).toBeNull();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
          }),
        ],
        config
      )
    );
  });

  it("removed assertion should pass when target is a descendant of the removed node", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-removed=".nested-target" fs-assert="btn-click">Click</button>
      <div class="wrapper">
        <input class="nested-target">
      </div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.querySelector(".wrapper")?.remove();
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
          }),
        ],
        config
      )
    );
  });

  it("removed assertion should not pass", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-removed="#panel" fs-assert="btn-click" fs-assert-timeout="1000">Click</button>
      <div id="panel"></div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    const panel = document.querySelector("#panel");
    expect(panel).not.toBeNull();

    // Simulate the passage of time to trigger the timeout
    fixedDateNow += 1001; // Increment Date.now() value by 1000ms (timeout)
    vi.advanceTimersByTime(1000); // Advance timers by 1000ms

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
          }),
        ],
        config
      )
    );
  });
});
