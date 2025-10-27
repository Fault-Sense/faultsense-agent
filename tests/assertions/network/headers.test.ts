// @vitest-environment jsdom

import {
  describe,
  it,
  expect,
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  vi,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { init } from "../../../src/index";
import * as resolveModule from "../../../src/assertions/server";

// Set up the server with handlers
const server = setupServer(
  http.get("/api/test", () => {
    return HttpResponse.json(null, {
      headers: { "x-resp-for": "server-check" },
      status: 200,
    });
  })
);

describe("Faultsense Agent - Assertion Type: response-headers", () => {
  //
  let cleanupFn: ReturnType<typeof init>;
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
  let sendToServerMock: ReturnType<typeof vi.spyOn>;
  let fixedDateNow = 1230000000000; // Fixed timestamp value
  let config = {
    apiKey: "TEST_API_KEY",
    releaseLabel: "0.0.0",
    timeout: 1000,
    collectorURL: "http://localhost:9000",
  };

  beforeAll(() => {
    // Start the server before all tests
    server.listen();
    // Initialize the agent script
  });

  afterAll(() => {
    // Close the server after all tests

    server.close();
  });

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

    cleanupFn = init(config);
  });

  afterEach(() => {
    cleanupFn();
    server.resetHandlers();
    // Restore original timers and mocks
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleErrorMock.mockRestore();
    sendToServerMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
  });

  it("should pass when the server response headers match the expected value", async () => {
    document.body.innerHTML = `
      <button 
        x-test-trigger="click" 
        x-test-assert-response-headers='{ "content-type": "application/json" }' 
        x-test-assertion-key="server-check" 
        x-test-feature-key="network-requests">
        Click me
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    // Simulate the fetch call when the button is clicked
    button.addEventListener("click", async () => {
      await fetch("/api/test");
    });
    button.click();

    // Check if sendToServer was called with the correct data
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

  it("should fail when the server response headers do not match the expected value", async () => {
    document.body.innerHTML = `
    <button 
      x-test-trigger="click" 
      x-test-assert-response-headers='{ "content-type": "text/html", "x-custom-header": "test" }' 
      x-test-assertion-key="server-check" 
      x-test-feature-key="network-requests">
      Click me
    </button>
  `;

    const button = document.querySelector("button") as HTMLButtonElement;
    // Simulate the fetch call when the button is clicked
    button.addEventListener("click", async () => {
      await fetch("/api/test");
    });
    button.click();

    // Check if sendToServer was called with the correct data
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason:
              "Expected HTTP response headers not found in actual headers:\n\nExpected:\ncontent-type: text/html\nx-custom-header: test\n\nActual:\ncontent-length: 4\ncontent-type: application/json\nx-resp-for: server-check",
          }),
        ],
        config
      )
    );
  });
});
