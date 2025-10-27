// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";
import { isVisible } from "../../src/utils/elements";

describe("Faultsense Agent - Assertion Type: updated", () => {
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

  it("Should pass if an elements attributes change", async () => {
    document.body.innerHTML = `
      <div id="panel" class="one"></div>
      <button x-test-trigger="click" x-test-assert-updated="#panel" x-test-assertion-key="panel-update" x-test-feature-key="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const panel = document.getElementById("panel") as HTMLDivElement;
      panel.classList.add("two");
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

  it("Should pass if a new attributes are added to the element", async () => {
    document.body.innerHTML = `
      <div id="panel"></div>
      <button x-test-trigger="click" x-test-assert-updated="#panel" x-test-assertion-key="panel-update" x-test-feature-key="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const panel = document.getElementById("panel") as HTMLDivElement;
      panel.setAttribute("data-test", "test");
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

  it("Should pass if child elements are added", async () => {
    document.body.innerHTML = `
      <div id="panel"></div>
      <button x-test-trigger="click" x-test-assert-updated="#panel" x-test-assertion-key="panel-update" x-test-feature-key="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const panel = document.getElementById("panel") as HTMLDivElement;
      panel.appendChild(document.createElement("div"));
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

  it("Should pass if child elements are removed", async () => {
    document.body.innerHTML = `
      <div id="panel">
        <div id="panel-body"></div>
      </div>
      <button x-test-trigger="click" x-test-assert-updated="#panel" x-test-assertion-key="panel-update" x-test-feature-key="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("panel-body")?.remove();
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

  it("Should pass if child elements are updated", async () => {
    document.body.innerHTML = `
      <div id="panel">
        <div id="panel-body"></div>
      </div>
      <button x-test-trigger="click" x-test-assert-updated="#panel" x-test-assertion-key="panel-update" x-test-feature-key="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("panel-body")?.classList.add("updated");
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

  it("Should pass if grand-child elements are updated", async () => {
    document.body.innerHTML = `
      <div id="panel">
        <div id="panel-body"></div>
      </div>
      <button x-test-trigger="click" x-test-assert-updated="#panel" x-test-assertion-key="panel-update" x-test-feature-key="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document
        .getElementById("panel-body")
        ?.appendChild(document.createElement("p"));
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

  it("Should pass if the childs text is updated", async () => {
    document.body.innerHTML = `
      <div id="panel">
        <p id="panel-body"></p>
      </div>
      <button x-test-trigger="click" x-test-assert-updated="#panel" x-test-assertion-key="panel-update" x-test-feature-key="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document
        .getElementById("panel-body")
        ?.appendChild(document.createTextNode("Hello World"));
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

  it("Should fail if no changes to the eleemnt or subtree are found", async () => {
    document.body.innerHTML = `
      <div id="panel">
        <div id="panel-body"></div>
      </div>
      <button x-test-trigger="click" x-test-assert-updated="#panel" x-test-assertion-key="panel-update" x-test-feature-key="updater">Click</button>
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
