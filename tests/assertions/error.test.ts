// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";
import { isVisible } from "../../src/utils/elements";

describe("Faultsense Agent - Assertions with global errors", () => {
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
  let sendToServerMock: ReturnType<typeof vi.spyOn>;
  let cleanupFn: ReturnType<typeof init>;
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

  it("Assertions should fail if any unhandled error is thrown", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-added="#panel" fs-assert="btn-click" fs-feature="revealer">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      window.onerror!(
        "TestError", // Error message
        "http://example.com/script.js", // Source file
        10, // Line number
        15, // Column number
        new Error("TestError") // Error object
      );
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason: "TestError",
          }),
        ],
        config
      )
    );
  });

  it("Assertions should fail if an unhandledrejection error is thrown", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-added="#panel" fs-assert="btn-click" fs-feature="revealer">Click</button>
    `;

    // Simulate an unhandled promise rejection
    const unhandledRejectionEvent = new Event("unhandledrejection");
    (unhandledRejectionEvent as any).reason = new Error(
      "Unhandled Promise Rejection"
    );

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      window.dispatchEvent(unhandledRejectionEvent);
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason: "Unhandled Promise Rejection",
          }),
        ],
        config
      )
    );
  });
});
