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

    vi.mock("../../src/utils/elements", async () => ({ ...await vi.importActual("../../src/utils/elements") as any,
      isVisible: vi.fn().mockImplementation((element: HTMLElement) => {
        return (
          element.style.display !== "none" &&
          element.style.visibility !== "hidden"
        );
      }),
    }));

    cleanupFn = init(config);
  });

  afterEach(() => {
    cleanupFn();
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleErrorMock.mockRestore();
    sendToServerMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
  });

  it("JS error should tag pending assertions with errorContext but NOT fail them", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-added="#panel" fs-assert="btn-click">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // Fire a JS error while the assertion is pending
    window.onerror!(
      "TestError",
      "http://example.com/script.js",
      10,
      15,
      new Error("TestError")
    );

    // The assertion should NOT be immediately failed
    expect(sendToServerMock).not.toHaveBeenCalled();

    // Now resolve the assertion by adding #panel to the DOM
    const panel = document.createElement("div");
    panel.id = "panel";
    document.body.appendChild(panel);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            errorContext: expect.objectContaining({
              message: "TestError",
              source: "http://example.com/script.js",
              lineno: 10,
              colno: 15,
            }),
          }),
        ],
        config
      )
    );
  });

  it("unhandledrejection should tag pending assertions with errorContext but NOT fail them", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-added="#panel" fs-assert="btn-click">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // Simulate an unhandled promise rejection
    const unhandledRejectionEvent = new Event("unhandledrejection");
    (unhandledRejectionEvent as any).reason = new Error(
      "Unhandled Promise Rejection"
    );
    window.dispatchEvent(unhandledRejectionEvent);

    // The assertion should NOT be immediately failed
    expect(sendToServerMock).not.toHaveBeenCalled();

    // Resolve the assertion by adding #panel
    const panel = document.createElement("div");
    panel.id = "panel";
    document.body.appendChild(panel);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            errorContext: expect.objectContaining({
              message: "Unhandled Promise Rejection",
            }),
          }),
        ],
        config
      )
    );
  });

  it("errorContext should be undefined on normal assertion pass (no JS error)", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-added="#panel" fs-assert="btn-click">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    const panel = document.createElement("div");
    panel.id = "panel";
    document.body.appendChild(panel);

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

    const assertion = sendToServerMock.mock.calls[0][0][0];
    expect(assertion.errorContext).toBeUndefined();
  });

  it("first error wins — second error should not overwrite errorContext", async () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert-added="#panel" fs-assert="btn-click">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // Fire first error
    window.onerror!(
      "FirstError",
      "http://example.com/first.js",
      1,
      1,
      new Error("FirstError")
    );

    // Fire second error
    window.onerror!(
      "SecondError",
      "http://example.com/second.js",
      2,
      2,
      new Error("SecondError")
    );

    // Resolve the assertion
    const panel = document.createElement("div");
    panel.id = "panel";
    document.body.appendChild(panel);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            errorContext: expect.objectContaining({
              message: "FirstError",
              source: "http://example.com/first.js",
            }),
          }),
        ],
        config
      )
    );
  });
});
