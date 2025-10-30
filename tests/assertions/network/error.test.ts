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
  http.get("/api/404", () => {
    return HttpResponse.json(null, {
      headers: { "fs-resp-for": "server-check" },
      status: 404,
    });
  }),

  http.get("/api/500", () => {
    return HttpResponse.json(
      { message: "Internal Server Error" },
      {
        headers: { "fs-resp-for": "server-check" },
        status: 500,
      }
    );
  }),

  http.get("/api/network-error", () => {
    return HttpResponse.error();
  }),

  // Test endpoints for status codes that should NOT be treated as errors
  http.get("/api/400", () => {
    return HttpResponse.json(
      { message: "Bad Request" },
      {
        headers: { "fs-resp-for": "client-error-check" },
        status: 400,
      }
    );
  }),

  http.get("/api/401", () => {
    return HttpResponse.json(
      { message: "Unauthorized" },
      {
        headers: { "fs-resp-for": "auth-check" },
        status: 401,
      }
    );
  }),

  http.get("/api/409", () => {
    return HttpResponse.json(
      { message: "Conflict" },
      {
        headers: { "fs-resp-for": "conflict-check" },
        status: 409,
      }
    );
  }),

  http.get("/api/422", () => {
    return HttpResponse.json(
      { message: "Unprocessable Entity" },
      {
        headers: { "fs-resp-for": "validation-check" },
        status: 422,
      }
    );
  })
);

describe("Faultsense Agent - Assertion Http Errors", () => {
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

  it("should fail with 4xx errors", async () => {
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
      await fetch("/api/404");
    });
    button.click();

    // // Wait for the fetch call and advance timers
    // fixedDateNow += 1000; // Increment Date.now() value by 1000ms (timeout)
    // await vi.advanceTimersByTime(1000); // Simulate passage of time if needed

    // Check if sendToServer was called with the correct data
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            type: "response-status",
            status: "failed",
            statusReason: "HTTP Error: Not Found",
          }),
        ],
        config
      )
    );
  });

  it("should fail with 5xx errors", async () => {
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
      try {
        await fetch("/api/500");
      } catch (error) {
        // ignore, expected.
      }
    });
    button.click();

    // // Wait for the fetch call and advance timers
    // fixedDateNow += 1000; // Increment Date.now() value by 1000ms (timeout)
    // await vi.advanceTimersByTime(1000); // Simulate passage of time if needed

    // Check if sendToServer was called with the correct data
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            type: "response-status",
            status: "failed",
            statusReason: "HTTP Error: Internal Server Error",
          }),
        ],
        config
      )
    );
  });

  it("should fail if network errors are detected", async () => {
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
      try {
        await fetch("/api/network-error");
      } catch (error) {
        // ignore, expected.
      }
    });
    button.click();

    // // Wait for the fetch call and advance timers
    // fixedDateNow += 1000; // Increment Date.now() value by 1000ms (timeout)
    // await vi.advanceTimersByTime(1000); // Simulate passage of time if needed

    // Check if sendToServer was called with the correct data
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            type: "response-status",
            status: "failed",
            statusReason: "Network Error",
          }),
        ],
        config
      )
    );
  });

  // Tests for status codes that should NOT be treated as errors
  it("should NOT treat 400 Bad Request as an error", async () => {
    document.body.innerHTML = `
      <button 
        fs-trigger="click" 
        fs-assert-response-status="400" 
        fs-assert="client-error-check" 
        fs-feature="validation-requests">
        Submit Invalid Data
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/400");
    });
    button.click();

    // Should pass because 400 is expected and not treated as an error
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            type: "response-status",
            status: "passed",
            statusReason: "",
          }),
        ],
        config
      )
    );
  });

  it("should NOT treat 401 Unauthorized as an error", async () => {
    document.body.innerHTML = `
      <button 
        fs-trigger="click" 
        fs-assert-response-status="401" 
        fs-assert="auth-check" 
        fs-feature="authentication">
        Access Protected Resource
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/401");
    });
    button.click();

    // Should pass because 401 is expected and not treated as an error
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            type: "response-status",
            status: "passed",
            statusReason: "",
          }),
        ],
        config
      )
    );
  });

  it("should NOT treat 409 Conflict as an error", async () => {
    document.body.innerHTML = `
      <button 
        fs-trigger="click" 
        fs-assert-response-status="409" 
        fs-assert="conflict-check" 
        fs-feature="resource-management">
        Create Duplicate Resource
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/409");
    });
    button.click();

    // Should pass because 409 is expected and not treated as an error
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            type: "response-status",
            status: "passed",
            statusReason: "",
          }),
        ],
        config
      )
    );
  });

  it("should NOT treat 422 Unprocessable Entity as an error", async () => {
    document.body.innerHTML = `
      <button 
        fs-trigger="click" 
        fs-assert-response-status="422" 
        fs-assert="validation-check" 
        fs-feature="form-validation">
        Submit Invalid Form
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/422");
    });
    button.click();

    // Should pass because 422 is expected and not treated as an error
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            type: "response-status",
            status: "passed",
            statusReason: "",
          }),
        ],
        config
      )
    );
  });
});
