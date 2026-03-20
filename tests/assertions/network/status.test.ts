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
    return HttpResponse.json({ ok: true }, {
      headers: { "fs-resp-for": "server-check" },
      status: 200,
    });
  }),

  http.get("/api/created", () => {
    return HttpResponse.json({ id: 1 }, {
      headers: { "fs-resp-for": "server-check" },
      status: 201,
    });
  }),

  http.get("/api/bad-request", () => {
    return HttpResponse.json({ error: "invalid" }, {
      headers: { "fs-resp-for": "server-check" },
      status: 400,
    });
  }),

  http.get("/api/server-error", () => {
    return HttpResponse.json(null, {
      headers: { "fs-resp-for": "server-check" },
      status: 500,
    });
  })
);

describe("Faultsense Agent - Response-Conditional Assertions", () => {
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

  it("should pass when response status matches and DOM element is added", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-200=".success-msg"
        fs-assert="server-check"
        fs-feature="network">
        Click me
      </button>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/success");
      // Simulate the DOM change that follows the response
      const el = document.createElement("div");
      el.className = "success-msg";
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

  it("should clear sibling assertions when one status matches", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-200=".success-msg"
        fs-assert-added-400=".error-msg"
        fs-assert="server-check"
        fs-feature="network">
        Click me
      </button>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/success");
      const el = document.createElement("div");
      el.className = "success-msg";
      document.body.appendChild(el);
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            type: "added",
            typeValue: ".success-msg",
          }),
        ],
        config
      )
    );

    // The 400 assertion should have been cleared, not failed
    // So sendToCollector should only be called once (for the 200 pass)
    expect(sendToServerMock).toHaveBeenCalledTimes(1);
  });

  it("should activate the correct assertion for 4xx responses", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-200=".success-msg"
        fs-assert-added-400=".error-msg"
        fs-assert="server-check"
        fs-feature="network">
        Click me
      </button>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/bad-request");
      const el = document.createElement("div");
      el.className = "error-msg";
      document.body.appendChild(el);
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            type: "added",
            typeValue: ".error-msg",
          }),
        ],
        config
      )
    );

    expect(sendToServerMock).toHaveBeenCalledTimes(1);
  });

  it("should support range matching (2xx, 4xx)", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-2xx=".success-msg"
        fs-assert-added-4xx=".error-msg"
        fs-assert="server-check"
        fs-feature="network">
        Click me
      </button>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/created"); // 201
      const el = document.createElement("div");
      el.className = "success-msg";
      document.body.appendChild(el);
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            type: "added",
            typeValue: ".success-msg",
          }),
        ],
        config
      )
    );
  });

  it("should prefer exact match over range match", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-201=".created-msg"
        fs-assert-added-2xx=".success-msg"
        fs-assert="server-check"
        fs-feature="network">
        Click me
      </button>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/created"); // 201
      const el = document.createElement("div");
      el.className = "created-msg";
      document.body.appendChild(el);
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            typeValue: ".created-msg",
          }),
        ],
        config
      )
    );
  });

  it("should fail all assertions when no status condition matches", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-200=".success-msg"
        fs-assert-added-400=".error-msg"
        fs-assert="server-check"
        fs-feature="network">
        Click me
      </button>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/server-error"); // 500
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            status: "failed",
            statusReason: expect.stringContaining("500"),
          }),
        ]),
        config
      )
    );
  });

  it("should support removed assertion type with response condition", async () => {
    document.body.innerHTML = `
      <div class="todo-item">Todo 1</div>
      <button
        fs-trigger="click"
        fs-assert-removed-200=".todo-item"
        fs-assert="server-check"
        fs-feature="network">
        Delete
      </button>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", async () => {
      await fetch("/api/success");
      const item = document.querySelector(".todo-item");
      item?.remove();
    });
    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            type: "removed",
            typeValue: ".todo-item",
          }),
        ],
        config
      )
    );
  });

  it("should timeout when no matching response arrives", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-added-200=".success-msg"
        fs-assert="server-check"
        fs-feature="network"
        fs-assert-timeout="500">
        Click me
      </button>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    // Click but don't trigger any fetch — assertion should timeout
    button.click();

    // Advance past the timeout
    fixedDateNow += 501;
    vi.advanceTimersByTime(500);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            statusReason: expect.stringContaining("HTTP response not received within 500ms"),
          }),
        ],
        config
      )
    );
  });

  it("should not resolve DOM assertions before response arrives", async () => {
    document.body.innerHTML = `
      <div class="success-msg">Already here</div>
      <button
        fs-trigger="click"
        fs-assert-visible-200=".success-msg"
        fs-assert="server-check"
        fs-feature="network">
        Click me
      </button>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    // Click but don't trigger a fetch — the assertion should NOT resolve
    // even though .success-msg is already in the DOM
    button.click();

    // Advance some time but not past timeout
    fixedDateNow += 100;
    vi.advanceTimersByTime(100);

    // Should NOT have been called yet — waiting for response
    expect(sendToServerMock).not.toHaveBeenCalled();
  });
});
