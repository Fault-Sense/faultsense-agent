// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";
import { isVisible } from "../../src/utils/elements";

describe("Faultsense Agent - Duplication Assertion Prevention", () => {
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

  it("should only create a single assertion if the same type is still open", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-added="#panel" fs-assert="dupe-test" fs-feature="test">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const panel = document.createElement("div");
      panel.id = "panel";
      document.body.appendChild(panel);
    });

    //multiple button clicks shouldn't create multiple assertions
    button.click();
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
    expect(sendToServerMock).toHaveBeenCalledTimes(1);
  });

  it("should not send a re-completed assertion to the server if the status did not change", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-added="#panel" fs-assert="dupe-test" fs-feature="test">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const panel = document.createElement("div");
      panel.id = "panel";
      document.body.appendChild(panel);
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
    expect(sendToServerMock).toHaveBeenCalledTimes(1);

    //assertion settled, re-trigger it again. Should pass again and not send to server
    button.click();
    await vi.waitFor(() => expect(sendToServerMock).toHaveBeenCalledTimes(1));
  });

  it("should send a re-completed assertion to the server if the status changed", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-added="#panel" fs-assert="dupe-test" fs-feature="test">Click</button>
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
    expect(sendToServerMock).toHaveBeenCalledTimes(1);

    //assertion settled, re-trigger it again. Should pass again and not send to server
    button.addEventListener("click", () => {
      const panel = document.createElement("div");
      panel.id = "panel";
      document.body.appendChild(panel);
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
    expect(sendToServerMock).toHaveBeenCalledTimes(2);
  });
});
