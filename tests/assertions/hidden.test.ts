// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";
import { isVisible } from "../../src/utils/elements";

describe("Faultsense Agent - Assertion Type: hidden", () => {
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

    // Use fake timers to control setInterval
    vi.useFakeTimers();
    // Mock Date.now() to return a fixed timestamp
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);

    // Mock the sendToCollector function in the resolve module
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
    // Restore original timers and mocks
    cleanupFn();
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleErrorMock.mockRestore();
    sendToServerMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
  });

  it("hidden should pass if the element exists and is hidden (mount trigger)", async () => {
    document.body.innerHTML = `
      <button fs-trigger="mount" fs-assert-hidden="#panel" fs-assert="btn-click" fs-feature="revealer">Click</button>
      <div id="panel" style="display:none;"></div>
    `;

    // Manually trigger mount processing for elements that are already in the DOM
    const mountElements = document.querySelectorAll('[fs-trigger="mount"]');
    if (mountElements.length > 0) {
      // Trigger a mutation to simulate the mount processing
      const event = new Event('DOMContentLoaded');
      document.dispatchEvent(event);

      // Advance timers to allow polling to check the assertion
      vi.advanceTimersByTime(100);
    }

    await vi.waitFor(() => {
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            statusReason: "",
          }),
        ],
        config
      );
    });
  });

  it("hidden should pass if the element exists and is hidden", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-hidden="#panel" fs-assert="btn-click" fs-feature="revealer">Click</button>
      <div id="panel" style="display: block; width: 100px; height: 100px;"></div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const panel = document.querySelector("#panel");
      if (panel) {
        panel.setAttribute("style", "display: none");
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

  it("hidden should fail if the element exists but is visisble", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-hidden="#panel" fs-assert="btn-click" fs-feature="revealer">Click</button>
      <div id="panel" style="display: block; width: 100px; height: 100px;"></div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason: "Expected #panel to be hidden (found but visible).",
          }),
        ],
        config
      )
    );
  });

  it("hidden should fail if the element does not exist", async () => {
    document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-hidden="#panel" fs-assert="btn-click" fs-feature="revealer">Click</button>
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
            statusReason: "Expected #panel to be hidden within 1000ms.",
          }),
        ],
        config
      )
    );
  });
});
