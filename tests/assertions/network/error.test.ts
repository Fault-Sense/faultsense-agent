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

const server = setupServer(
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
  })
);

describe("Faultsense Agent - HTTP Errors with Response-Conditional Assertions", () => {
  let cleanupFn: ReturnType<typeof init>;
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
  let sendToServerMock: ReturnType<typeof vi.spyOn>;
  let fixedDateNow = 1230000000000;
  let config = {
    apiKey: "TEST_API_KEY",
    releaseLabel: "0.0.0",
    timeout: 1000,
    collectorURL: "http://localhost:9000",
  };

  beforeAll(() => {
    server.listen();
  });

  afterAll(() => {
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
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleErrorMock.mockRestore();
    sendToServerMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
  });

  it("should fail when 5xx response doesn't match any condition", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-200=".success"
        fs-assert="server-check"
        fs-feature="network">
        Click me
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      try {
        await fetch("/api/500");
      } catch (error) {
        // ignore
      }
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason: expect.stringContaining("500"),
          }),
        ],
        config
      )
    );
  });

  it("should handle 5xx with a matching 5xx condition", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-200=".success"
        fs-assert-added-5xx=".error"
        fs-assert="server-check"
        fs-feature="network">
        Click me
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      try {
        await fetch("/api/500");
      } catch (error) {
        // ignore
      }
      const el = document.createElement("div");
      el.className = "error";
      document.body.appendChild(el);
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            type: "added",
            typeValue: ".error",
          }),
        ],
        config
      )
    );
  });

  it("should fail on network errors", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-200=".success"
        fs-assert="server-check"
        fs-feature="network">
        Click me
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      try {
        await fetch("/api/network-error");
      } catch (error) {
        // ignore
      }
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason: "Network Error",
          }),
        ],
        config
      )
    );
  });
});
