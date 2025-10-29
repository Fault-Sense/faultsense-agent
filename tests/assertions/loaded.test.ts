// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";
import { isVisible } from "../../src/utils/elements";

describe("Faultsense Agent - Loaded Assetion", () => {
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
    document.body.innerHTML = "";
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
    document.body.innerHTML = "";
  });

  it("Should pass if onload is triggered for the element", async () => {
    document.body.innerHTML = `
      <img id="my-img" src="/some/img/png" fs-trigger="mount" fs-assert-loaded="#my-img" fs-assert="product-image" fs-feature="product-display" /> 
    `;
    const img = document.querySelector("img") as HTMLImageElement;

    const onLoadMock = vi.fn();
    img.onload = onLoadMock;

    setTimeout(() => {
      // Simulate the load event
      const event = new Event("load");
      img.dispatchEvent(event);
    }, 100);

    await vi.waitFor(() => expect(onLoadMock).toHaveBeenCalled());
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

  it("Should fail if onerror is triggered for the element", async () => {
    document.body.innerHTML = `
      <img id="my-img" src="/some/img/png" fs-trigger="mount" fs-assert-loaded="#my-img" fs-assert="product-image" fs-feature="product-display" /> 
    `;
    const img = document.querySelector("img") as HTMLImageElement;

    const onErrorMock = vi.fn();
    img.onerror = onErrorMock;

    setTimeout(() => {
      // Simulate the error event
      const event = new Event("error");
      img.dispatchEvent(event);
    }, 100);

    await vi.waitFor(() => expect(onErrorMock).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason:
              "Expected #my-img (/some/img/png) to be loaded but onerror was triggered",
          }),
        ],
        config
      )
    );
  });

  it("Should fail if it takes too long to load", async () => {
    document.body.innerHTML = `
      <img id="my-img" src="/some/img/png" fs-trigger="mount" fs-assert-loaded="#my-img" fs-assert="product-image" fs-feature="product-display" /> 
    `;

    // do not trigger the load or error events. Instead wait for the timeout
    // Simulate the passage of time to trigger the timeout
    setTimeout(() => {
      fixedDateNow += 1001; // Increment Date.now() value by 1001ms (timeout)
      vi.advanceTimersByTime(1001); // Advance timers by 1001ms
    }, 100);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason: "Expected #my-img to be loaded within 1000ms.",
          }),
        ],
        config
      )
    );
  });

  it("Should ignore onload events for untracked elements", async () => {
    document.body.innerHTML = `
      <img id="my-img-untracked" src="/some/img/png"  />
      <img id="my-img" src="/some/img/png" fs-trigger="mount" fs-assert-loaded="#my-img" fs-assert="product-image" fs-feature="product-display" /> 
    `;
    const img = document.querySelector("#my-img-untracked") as HTMLImageElement;

    //trigger onload for the unrelated img
    setTimeout(() => {
      // Simulate the error event
      const event = new Event("error");
      img.dispatchEvent(event);

      // Simulate the passage of time to trigger the timeout
      fixedDateNow += 1001; // Increment Date.now() value by 1000ms (timeout)
      vi.advanceTimersByTime(1000); // Advance timers by 1000ms
    }, 100);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason: "Expected #my-img to be loaded within 1000ms.",
          }),
        ],
        config
      )
    );
  });

  it("Should pass without an explicit id on the element", async () => {
    document.body.innerHTML = `
    <div id="container">
      <img src="/some/img/png" fs-trigger="mount" fs-assert-loaded="#container img" fs-assert="product-image" fs-feature="product-display" /> 
    </div>
    `;
    const img = document.querySelector("img") as HTMLImageElement;

    setTimeout(() => {
      // Simulate the error event
      const event = new Event("load");
      img.dispatchEvent(event);
    }, 100);

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

  it("Should pass if the element was marked as completed and rendered", async () => {
    document.body.innerHTML = `
    <div id="container">
     <img src="/some/img/png" fs-trigger="mount" fs-assert-loaded="#container img" fs-assert="product-image" fs-feature="product-display" /> 
    </div>
    `;
    const img = document.querySelector("img") as HTMLImageElement;

    // Mock the `complete` and `naturalWidth` properties
    Object.defineProperty(img, "complete", {
      get: () => true,
    });
    Object.defineProperty(img, "naturalWidth", {
      get: () => 100,
    });

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

  it("Should fail if the element was marked as completed but failed to render", async () => {
    document.body.innerHTML = `
    <div id="container">
     <img src="/some/img/png" fs-trigger="mount" fs-assert-loaded="#container img" fs-assert="product-image" fs-feature="product-display" /> 
    </div>
    `;
    const img = document.querySelector("img") as HTMLImageElement;

    // Mock the `complete` and `naturalWidth` properties
    Object.defineProperty(img, "complete", {
      get: () => true,
    });
    Object.defineProperty(img, "naturalWidth", {
      get: () => 0,
    });

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason:
              "Img #container img (/some/img/png) marked as complete, but has failed to render (naturalWidth is 0).",
          }),
        ],
        config
      )
    );
  });

  it("Should resolve anytime load or error is triggered", async () => {
    document.body.innerHTML = `
    <div id="container">
     <img src="/some/img/png"  fs-trigger="load" fs-assert-loaded="#container img" fs-assert="product-image" fs-feature="product-display" /> 
    </div>
    `;
    const img = document.querySelector("img") as HTMLImageElement;

    setTimeout(() => {
      // Simulate the load event
      const event = new Event("load");
      img.dispatchEvent(event);
    }, 100);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            trigger: "load",
            status: "passed",
            statusReason: "",
          }),
        ],
        config
      )
    );

    setTimeout(() => {
      // Simulate the load event
      const event = new Event("error");
      img.dispatchEvent(event);
    }, 100);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            trigger: "load",
            status: "failed",
            statusReason:
              "Expected #container img (/some/img/png) to be loaded but onerror was triggered",
          }),
        ],
        config
      )
    );

    expect(sendToServerMock).toBeCalledTimes(2);
  });
});
