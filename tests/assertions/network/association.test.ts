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
  http.get("/api/success", () => {
    return HttpResponse.json(null, {
      headers: { "fs-resp-for": "server-check" },
      status: 200,
    });
  }),

  http.get("/api/success-using-param/?fs-resp-for=server-check", () => {
    return HttpResponse.json(null, {
      status: 200,
    });
  }),

  http.get("/api/missing-header", () => {
    return HttpResponse.json(null, {
      status: 200,
    });
  })
);

describe("Faultsense Agent - Response Header Association: ", () => {
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

  it("should pass with matching assertion response header", async () => {
    document.body.innerHTML = `
      <button 
        fs-trigger="click" 
        fs-assert-response-status="200" 
        fs-assert="server-check" 
        fs-feature="network-requests">
        Click me
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    // Simulate the fetch call when the button is clicked
    button.addEventListener("click", async () => {
      await fetch("/api/success");
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

  it("should pass with matching assertion request query param", async () => {
    document.body.innerHTML = `
      <button 
        fs-trigger="click" 
        fs-assert-response-status="200" 
        fs-assert="server-check" 
        fs-feature="network-requests">
        Click me
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    // Simulate the fetch call when the button is clicked
    button.addEventListener("click", async () => {
      await fetch("/api/success-using-param/?fs-resp-for=server-check");
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

  it("should fail without a matching assertion response header or param", async () => {
    document.body.innerHTML = `
      <button 
        fs-trigger="click" 
        fs-assert-response-status="200" 
        fs-assert="server-check" 
        fs-feature="network-requests">
        Click me
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    // Simulate the fetch call when the button is clicked
    button.addEventListener("click", async () => {
      await fetch("/api/missing-header");
    });
    button.click();

    // Wait for the fetch call and advance timers
    fixedDateNow += 1001; // Increment Date.now() value by 1000ms (timeout)
    await vi.advanceTimersByTime(1000); // Simulate passage of time if needed

    // Check if sendToServer was called with the correct data
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason:
              'HTTP response not received within 1000ms. Make sure the server responds with the header "fs-resp-for: server-check" or the outgoing request has a "fs-resp-for=server-check" parameter.',
          }),
        ],
        config
      )
    );
  });
});
