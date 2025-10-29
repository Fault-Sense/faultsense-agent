// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Assertion Type modifer: text-matches", () => {
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

  it("Should pass if the childs text matches the string literal", async () => {
    document.body.innerHTML = `
      <p id="note"></p>
      <button fs-trigger="click" 
      fs-assert-updated="#note" 
      fs-assert-text-matches="Hello World" 
      fs-assert="panel-text-update" 
      fs-feature="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document
        .getElementById("note")
        ?.appendChild(document.createTextNode("Hello World"));
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
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

  it("Should fail if the childs text does not match the string literal", async () => {
    document.body.innerHTML = `
      <p id="note"></p>
      <button fs-trigger="click" 
      fs-assert-updated="#note" 
      fs-assert-text-matches="Hello World" 
      fs-assert="panel-text-update" 
      fs-feature="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document
        .getElementById("note")
        ?.appendChild(document.createTextNode("Hello, World!"));
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            status: "failed",
            statusReason: 'Text does not match "Hello World"',
          }),
        ],
        config
      )
    );
  });

  it("Should pass if the childs text matches the regex", async () => {
    document.body.innerHTML = `
      <p id="note">Count: 0</p>
      <button fs-trigger="click" 
      fs-assert-updated="#note" 
      fs-assert-text-matches="Count: \\d+" 
      fs-assert="panel-text-update" 
      fs-feature="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document
        .getElementById("note")
        ?.appendChild(document.createTextNode("Count: 123"));
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
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

  it("Should fail if the childs text does not match the regex", async () => {
    document.body.innerHTML = `
      <p id="note">Count: 0</p>
      <button fs-trigger="click" 
      fs-assert-updated="#note" 
      fs-assert-text-matches="Count: [a-z]+" 
      fs-assert="panel-text-update" 
      fs-feature="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document
        .getElementById("note")
        ?.appendChild(document.createTextNode("Count: 123"));
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            status: "failed",
            statusReason: 'Text does not match "Count: [a-z]+"',
          }),
        ],
        config
      )
    );
  });

  it("Should fail if the element has no text content", async () => {
    document.body.innerHTML = `
      <p id="note"></p>
      <button fs-trigger="click"
      fs-assert-updated="#note"
      fs-assert-text-matches="Count: [a-z]+"
      fs-assert="panel-text-update"
      fs-feature="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("note")?.classList.add("updated");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            status: "failed",
            statusReason: 'Text does not match "Count: [a-z]+"',
          }),
        ],
        config
      )
    );
  });

  it("Should support dynamic text-matches values that update with application state", async () => {
    // This test demonstrates dynamic text-matches functionality
    // The text-matches attribute value should update based on application state
    let count = 0;

    document.body.innerHTML = `
      <div id="counter">Count: 0</div>
      <button id="increment-btn" 
        fs-trigger="click" 
        fs-assert-updated="#counter" 
        fs-assert-text-matches="Count: 1"
        fs-assert="dynamic-counter" 
        fs-feature="counter">
        Increment
      </button>
    `;

    const button = document.querySelector("#increment-btn") as HTMLButtonElement;
    const counter = document.querySelector("#counter") as HTMLDivElement;

    // Set up click handler that updates both the display and the text-matches attribute
    button.addEventListener("click", () => {
      count++;
      // Update the display text
      counter.textContent = `Count: ${count}`;

      // Update the text-matches attribute to expect the next count value
      const nextExpectedCount = count + 1;
      button.setAttribute("fs-assert-text-matches", `Count: ${nextExpectedCount}`);
    });

    // First click: count goes from 0 to 1, display shows "Count: 1"
    // text-matches expects "Count: 1" (should pass)
    button.click();

    // Verify state
    expect(counter.textContent).toBe("Count: 1");
    expect(button.getAttribute("fs-assert-text-matches")).toBe("Count: 2");


    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            status: "passed",
            statusReason: "",
          }),
        ],
        config
      )
    );


    // Second click: count goes from 1 to 2, display shows "Count: 2"
    // text-matches now expects "Count: 2" (should pass)
    button.click();

    // Verify state
    expect(counter.textContent).toBe("Count: 2");
    expect(button.getAttribute("fs-assert-text-matches")).toBe("Count: 3");


    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
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
});
