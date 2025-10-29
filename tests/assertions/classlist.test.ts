// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";
import { isVisible } from "../../src/utils/elements";

describe.only("Faultsense Agent - Assertion Type modifer: classlist", () => {
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

  it("Should pass the target has the classes", async () => {
    document.body.innerHTML = `
      <img id="logo" class="foo bar baz" id="logo" width="100" height="100" alt="alt text" />
      <button fs-trigger="click" 
      fs-assert-updated="#logo" 
      fs-assert-classlist='{ "foo": true, "bar": true, "baz": true, "test": true }'
      fs-assert="img-src-update" 
      fs-feature="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("logo")?.classList.add("test");
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

  it("Should pass the target omits the classes", async () => {
    document.body.innerHTML = `
      <img id="logo" class="foo bar baz" id="logo" width="100" height="100" alt="alt text" />
      <button fs-trigger="click" 
      fs-assert-updated="#logo" 
      fs-assert-classlist='{ "random": false, "junk": false }'
      fs-assert="img-src-update" 
      fs-feature="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("logo")?.classList.add("test");
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

  it("Should fail if required are omitted or vice versa", async () => {
    document.body.innerHTML = `
      <img id="logo" class="foo" id="logo" width="100" height="100" alt="alt text" />
      <button fs-trigger="click" 
      fs-assert-updated="#logo" 
      fs-assert-classlist='{ "foo": true, "test": false, "bar": false }'
      fs-assert="img-src-update" 
      fs-feature="updater">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("logo")?.classList.add("test");
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            status: "failed",
            statusReason:
              'Expected classlist does not match: "{ "foo": true, "test": false, "bar": false }"',
          }),
        ],
        config
      )
    );
  });
});
