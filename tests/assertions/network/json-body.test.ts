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
    return HttpResponse.json({ todo: { id: 1, text: "Buy milk" } }, {
      headers: { "fs-resp-for": "add-item" },
      status: 200,
    });
  }),

  http.get("/api/error", () => {
    return HttpResponse.json({ error: "Todo text cannot be empty" }, {
      headers: { "fs-resp-for": "add-item" },
      status: 200,
    });
  }),

  http.get("/api/invalid-json", () => {
    return new HttpResponse("not json", {
      headers: { "fs-resp-for": "add-item", "content-type": "text/plain" },
      status: 200,
    });
  })
);

describe("Faultsense Agent - JSON Body Response-Conditional Assertions", () => {
  let cleanupFn: ReturnType<typeof init>;
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
  let sendToServerMock: ReturnType<typeof vi.spyOn>;
  let fixedDateNow = 1230000000000;
  let config = {
    apiKey: "TEST_API_KEY",
    releaseLabel: "0.0.0",
    timeout: 2000,
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
      (global as any).HTMLElement = class {};
    }
    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);

    sendToServerMock = vi
      .spyOn(resolveModule, "sendToCollector")
      .mockImplementation(() => {});
    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
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

  it("should pass when json key exists in response body and DOM element is added", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-json-todo=".todo-item"
        fs-assert="add-item">
        Add
      </button>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/success");
      const el = document.createElement("div");
      el.className = "todo-item";
      document.body.appendChild(el);
    });
    button.click();

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

  it("should release matching json assertion to DOM resolvers and dismiss siblings", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-json-todo=".todo-item"
        fs-assert-added-json-error=".error-msg"
        fs-assert="add-item">
        Add
      </button>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/error");
      // Response has "error" key — json-error assertion is released to DOM resolvers,
      // json-todo is dismissed. Then adding .error-msg resolves the released assertion.
      const el = document.createElement("div");
      el.className = "error-msg";
      document.body.appendChild(el);
    });
    button.click();

    // The json-error assertion should pass after the DOM element is added
    await vi.waitFor(() => {
      const calls = sendToServerMock.mock.calls;
      const allAssertions = calls.flatMap((c: any[]) => c[0]);
      expect(allAssertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: "passed",
            type: "added",
            typeValue: ".error-msg",
          }),
        ])
      );
    });
  });

  it("should fail all json assertions when response is not valid JSON", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-json-todo=".todo-item"
        fs-assert="add-item">
        Add
      </button>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/invalid-json");
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason: "Response body is not valid JSON",
          }),
        ],
        config
      )
    );
  });

  it("should fail when no declared json key exists in response body", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-json-data=".result"
        fs-assert="add-item">
        Add
      </button>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      // Response has "todo" key, but assertion expects "data"
      await fetch("/api/success");
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason: expect.stringContaining("does not contain any declared key"),
          }),
        ],
        config
      )
    );
  });
});
