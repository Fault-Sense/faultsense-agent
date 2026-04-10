// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";
import { isVisible } from "../../src/utils/elements";

describe("Faultsense Agent - Assertion Type modifer: attrs-match", () => {
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

    vi.mock("../../src/utils/elements", async () => ({ ...await vi.importActual("../../src/utils/elements") as any,
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

  it("Should pass if a subset of the target attributes match", async () => {
    document.body.innerHTML = `
      <img id="logo" class="foo bar baz" id="logo" width="100" height="100" alt="alt text" />
      <button fs-trigger="click"
      fs-assert-updated='#logo[src=/path/to/foo.png][width=100][height=100][alt=alt text]'
      fs-assert="img-src-update"
     >Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("logo")?.setAttribute("src", "/path/to/foo.png");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            status: "passed",
          }),
        ],
        config
      )
    );
  });

  it("Should fail if any of the subset of the target attributes do not match", async () => {
    document.body.innerHTML = `
      <img id="logo" class="foo bar baz" id="logo" width="100" height="100" alt="alt text" />
      <button fs-trigger="click"
      fs-assert-updated='#logo[src=/path/to/bar.png][width=100][height=100][alt=some text]'
      fs-assert="img-src-update"
      fs-assert-timeout="1000"
     >Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("logo")?.setAttribute("src", "/path/to/foo.png");
    });

    button.click();

    fixedDateNow += 1001;
    vi.advanceTimersByTime(1000);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            status: "failed",
          }),
        ],
        config
      )
    );
  });

  it("Should pass when attribute value matches a regex pattern", async () => {
    document.body.innerHTML = `
      <div id="card" data-state="loaded-v2"></div>
      <button fs-trigger="click"
        fs-assert-updated='#card[data-state=loaded.*]'
        fs-assert="card/state-update"
      >Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("card")?.setAttribute("data-state", "loaded-v3");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            status: "passed",
          }),
        ],
        config
      )
    );
  });

  it("Should pass when attribute value matches one of several regex alternatives", async () => {
    document.body.innerHTML = `
      <div id="status" data-status="error"></div>
      <button fs-trigger="click"
        fs-assert-updated='#status[data-status=success|error|pending]'
        fs-assert="status/update"
      >Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("status")?.setAttribute("data-status", "success");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            status: "passed",
          }),
        ],
        config
      )
    );
  });

  it("Should fail when attribute value does not match the regex pattern", async () => {
    document.body.innerHTML = `
      <div id="card" data-state="unknown"></div>
      <button fs-trigger="click"
        fs-assert-updated='#card[data-state=^loaded]'
        fs-assert="card/state-update"
        fs-assert-timeout="1000"
      >Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("card")?.setAttribute("data-state", "error");
    });

    button.click();

    fixedDateNow += 1001;
    vi.advanceTimersByTime(1000);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            status: "failed",
          }),
        ],
        config
      )
    );
  });

  it("Should fall back to exact match on invalid regex", async () => {
    document.body.innerHTML = `
      <div id="item" data-val="*invalid"></div>
      <button fs-trigger="click"
        fs-assert-updated='#item[data-val=*invalid]'
        fs-assert="item/update"
      >Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("item")?.setAttribute("data-val", "*invalid");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            status: "passed",
          }),
        ],
        config
      )
    );
  });
});
