// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";
import { isVisible } from "../../src/utils/elements";

describe.only("Faultsense Agent - Assertion Type modifer: text-matches", () => {
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

  it.only("Should pass if the childs text matches the string literal", async () => {
    document.body.innerHTML = `
      <p id="note"></p>
      <button x-test-trigger="click" 
      x-test-assert-updated="#note" 
      x-test-text-matches="Hello World" 
      x-test-assertion-key="panel-text-update" 
      x-test-feature-key="updater">Click</button>
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

  it.only("Should fail if the childs text does not match the string literal", async () => {
    document.body.innerHTML = `
      <p id="note"></p>
      <button x-test-trigger="click" 
      x-test-assert-updated="#note" 
      x-test-text-matches="Hello World" 
      x-test-assertion-key="panel-text-update" 
      x-test-feature-key="updater">Click</button>
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
      <button x-test-trigger="click" 
      x-test-assert-updated="#note" 
      x-test-text-matches="Count: \\d+" 
      x-test-assertion-key="panel-text-update" 
      x-test-feature-key="updater">Click</button>
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
      <button x-test-trigger="click" 
      x-test-assert-updated="#note" 
      x-test-text-matches="Count: [a-z]+" 
      x-test-assertion-key="panel-text-update" 
      x-test-feature-key="updater">Click</button>
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
      <button x-test-trigger="click"
      x-test-assert-updated="#note"
      x-test-text-matches="Count: [a-z]+"
      x-test-assertion-key="panel-text-update"
      x-test-feature-key="updater">Click</button>
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
});
