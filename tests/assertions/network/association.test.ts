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

describe("Faultsense Agent - Response Association", () => {
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

  it("should match via response header fs-resp-for", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-resp-200-added=".result"
        fs-assert="server-check"
        fs-feature="network">
        Click me
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/success");
      const el = document.createElement("div");
      el.className = "result";
      document.body.appendChild(el);
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  it("should match via request query param fs-resp-for", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-resp-200-added=".result"
        fs-assert="server-check"
        fs-feature="network">
        Click me
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/success-using-param/?fs-resp-for=server-check");
      const el = document.createElement("div");
      el.className = "result";
      document.body.appendChild(el);
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  it("should timeout without a matching fs-resp-for header or param", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-resp-200-added=".result"
        fs-assert="server-check"
        fs-feature="network">
        Click me
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/missing-header");
    });
    button.click();

    fixedDateNow += 1001;
    await vi.advanceTimersByTime(1000);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason: expect.stringContaining("HTTP response not received within 1000ms"),
          }),
        ],
        config
      )
    );
  });
});
