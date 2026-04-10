// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";
import { isVisible } from "../../src/utils/elements";

describe("Faultsense Agent - Assertion Type: visible", () => {
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
    // Ensure HTMLElement is mocked on every test run (in case watch mode clears it)
    if (typeof HTMLElement === "undefined") {
      (global as any).HTMLElement = class { };
    }

    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);

    sendToServerMock = vi
      .spyOn(resolveModule, "sendToCollector")
      .mockImplementation(() => { });
    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => { });

    vi.mock("../../src/utils/elements", async () => ({ ...await vi.importActual("../../src/utils/elements") as any,
      isVisible: vi.fn().mockImplementation((element: HTMLElement) => {
        return (
          element.style.display !== "none" &&
          element.style.visibility !== "hidden"
        );
      }),
    }));

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

  it("visible should pass if the element exists and is visible", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-visible="#panel" fs-assert="btn-click">Click</button>
      <div id="panel" style="display: none;"></div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const panel = document.querySelector("#panel");
      if (panel) {
        panel.setAttribute(
          "style",
          "display: block; width: 100px; height: 100px;"
        );
        panel.textContent = "Panel content";
      }
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

  it("visible should not pass if the element exists but is not visible", async () => {
    document.body.innerHTML = `
     <button fs-trigger="click" fs-assert-visible="#panel" fs-assert="btn-click" fs-assert-timeout="1000">Click</button>
     <div id="panel" style="display: none;"></div>
   `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    fixedDateNow += 1001;
    vi.advanceTimersByTime(1000);

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

  it("visible should not pass if the element does not exist", async () => {
    document.body.innerHTML = `
    <button fs-trigger="click" fs-assert-visible="#panel" fs-assert="btn-click" fs-assert-timeout="1000">Click</button>
  `;
    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

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
