// @vitest-environment jsdom

import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  vi,
  beforeAll,
  afterAll,
  Assertion,
} from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";
import { isVisible } from "../../src/utils/elements";
import { storageKey } from "../../src/config";
import { loadAssertions } from "../../src/assertions/storage";

describe("Faultsense Agent - Assertion MPA Mode", () => {
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
    localStorage.clear();
    cleanupFn();
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleErrorMock.mockRestore();
    sendToServerMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
  });

  it("Should pass if assertions can resolve on next page load", async () => {
    /**
     * Simulate button click that asserts an element is added to the DOM on the next page
     */
    document.body.innerHTML = `
      <button
        fs-assert-mpa="true"
        fs-trigger="click"
        fs-assert-added="#panel"
        fs-assert="mpa-mode-test-click"
        fs-feature="revealer"
      >Click</button>
    `;

    // create the assertion when clicked
    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // simulate a page navigation event
    const beforeUnloadEvent = new Event("beforeunload");
    window.dispatchEvent(beforeUnloadEvent);

    // confirm that the assertion was saved to localStorage
    await vi.waitFor(() =>
      expect(localStorage.getItem(storageKey)).not.toBeNull()
    );

    // re-initialize the agent script as if it's a new page load
    cleanupFn();

    document.body.innerHTML = `
    <div id="panel">New Page with Panel</div>
  `;

    cleanupFn = init(config);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "mpa-mode-test-click",
            status: "passed",
            statusReason: "",
          }),
        ],
        config
      )
    );
  });

  it("Should fail if assertions cannot pass on next page load", async () => {
    /**
     * Simulate button click that asserts an element is added to the DOM on the next page
     */
    document.body.innerHTML = `
      <button
        fs-assert-mpa="true"
        fs-trigger="click"
        fs-assert-added="#panel"
        fs-assert="mpa-mode-test-click"
        fs-feature="revealer"
      >Click</button>
    `;

    // create the assertion when clicked
    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // simulate a page navigation event
    const beforeUnloadEvent = new Event("beforeunload");
    window.dispatchEvent(beforeUnloadEvent);

    // confirm that the assertion was saved to localStorage
    await vi.waitFor(() =>
      expect(localStorage.getItem(storageKey)).not.toBeNull()
    );

    // re-initialize the agent script as if it's a new page load
    cleanupFn();

    document.body.innerHTML = `<h1>New Page</h1>`;

    cleanupFn = init(config);

    // Simulate the passage of time to trigger the timeout
    fixedDateNow += 1001; // Increment Date.now() value by 1000ms (timeout)
    vi.advanceTimersByTime(1000); // Advance timers by 1000ms

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "mpa-mode-test-click",
            status: "failed",
            statusReason: "Expected #panel to be added within 1000ms.",
          }),
        ],
        config
      )
    );
  });

  it("Should extend timeout if overriden for mpa mode", async () => {
    /**
     * Simulate button click that asserts an element is added to the DOM on the next page
     */
    document.body.innerHTML = `
      <button
        fs-assert-mpa="true"
        fs-assert-timeout="5000"
        fs-trigger="click"
        fs-assert-added="#panel"
        fs-assert="mpa-mode-test-click"
        fs-feature="revealer"
      >Click</button>
    `;

    // create the assertion when clicked
    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // simulate a page navigation event
    const beforeUnloadEvent = new Event("beforeunload");
    window.dispatchEvent(beforeUnloadEvent);

    // confirm that the assertion was saved to localStorage
    await vi.waitFor(() =>
      expect(localStorage.getItem(storageKey)).not.toBeNull()
    );

    // re-initialize the agent script as if it's a new page load
    cleanupFn();

    document.body.innerHTML = `<h1>New Page</h1>`;
    cleanupFn = init(config);

    // Simulate the passage of time to trigger the timeout
    fixedDateNow += 2000; // Increment Date.now() value by 1000ms (timeout)
    vi.advanceTimersByTime(2000); // Advance timers by 1000ms

    document.body.innerHTML = `
    <h1>New Page</h1>
    <div id="panel">New Page with Panel</div>
  `;

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "mpa-mode-test-click",
            status: "passed",
            statusReason: "",
          }),
        ],
        config
      )
    );
  });

  it("Should drop assertions not setup for mpa_mode on a page navigation", async () => {
    /**
     * Simulate button click that asserts an element is added to the DOM on the next page
     */
    document.body.innerHTML = `
        <button
          fs-trigger="click"
          fs-assert-added="#panel"
          fs-assert="not-mpa-mode-test-click"
          fs-feature="revealer"
        >Click</button>
      `;

    // create the assertion when clicked
    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // simulate a page navigation event
    const beforeUnloadEvent = new Event("beforeunload");
    window.dispatchEvent(beforeUnloadEvent);

    // confirm that the assertion was saved to localStorage
    await vi.waitFor(() => expect(localStorage.getItem(storageKey)).toBeNull());

    // re-initialize the agent script as if it's a new page load
    cleanupFn();

    document.body.innerHTML = `<h1>New Page</h1>`;

    cleanupFn = init(config);

    await vi.waitFor(() => expect(sendToServerMock).not.toHaveBeenCalled());
  });
});
