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
    timeout: 1000,
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

    vi.mock("../../src/utils/elements", () => ({
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
      <button x-test-trigger="click" x-test-assert-visible="#panel" x-test-assertion-key="btn-click" x-test-feature-key="revealer">Click</button>
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
            statusReason: "",
          }),
        ],
        config
      )
    );
  });

  it("visible should not pass if the element exists but is not visible", async () => {
    document.body.innerHTML = `
     <button x-test-trigger="click" x-test-assert-visible="#panel" x-test-assertion-key="btn-click" x-test-feature-key="revealer">Click</button>
     <div id="panel" style="display: none;"></div>
   `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason: "Expected #panel to be visible (found but hidden).",
          }),
        ],
        config
      )
    );
  });

  it("visible should not pass if the element does not exist", async () => {
    document.body.innerHTML = `
    <button x-test-trigger="click" x-test-assert-visible="#panel" x-test-assertion-key="btn-click" x-test-feature-key="revealer">Click</button>
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
            statusReason: "Expected #panel to be visible within 1000ms.",
          }),
        ],
        config
      )
    );
  });
});
