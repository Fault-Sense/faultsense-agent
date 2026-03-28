// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../../src/index";
import * as resolveModule from "../../../src/assertions/server";

describe("Faultsense Agent - UI Conditional Assertion Parsing", () => {
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
  let consoleWarnMock: ReturnType<typeof vi.spyOn>;
  let sendToServerMock: ReturnType<typeof vi.spyOn>;
  let cleanupFn: ReturnType<typeof init>;
  let fixedDateNow = 1230000000000;
  let config = {
    apiKey: "TEST_API_KEY",
    releaseLabel: "0.0.0",
    gcInterval: 30000, unloadGracePeriod: 2000,
    collectorURL: "http://localhost:9000",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);

    sendToServerMock = vi
      .spyOn(resolveModule, "sendToCollector")
      .mockImplementation(() => {});

    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnMock = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.mock("../../../src/utils/elements", async () => ({ ...await vi.importActual("../../../src/utils/elements") as any,
      isVisible: vi.fn().mockImplementation((element: HTMLElement) => {
        return (
          element.style.display !== "none" &&
          element.style.visibility !== "hidden"
        );
      }),
    }));

    cleanupFn = init(config);
  });

  afterEach(() => {
    cleanupFn();
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleErrorMock.mockRestore();
    consoleWarnMock.mockRestore();
    sendToServerMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
  });

  it("should parse condition key from fs-assert-{type}-{key} attribute", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="auth/login"
        fs-assert-added-success=".dashboard">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const panel = document.createElement("div");
      panel.className = "dashboard";
      document.body.appendChild(panel);
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            conditionKey: "success",
          }),
        ],
        config
      )
    );
  });

  it("should allow multiple condition keys on the same element and type", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="auth/login"
        fs-assert-added-success=".dashboard"
        fs-assert-added-error=".error-msg">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    expect(consoleErrorMock).not.toHaveBeenCalled();
  });

  it("should parse condition keys with hyphens", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="form/submit"
        fs-assert-added-rate-limited=".rate-limit-msg">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const msg = document.createElement("div");
      msg.className = "rate-limit-msg";
      document.body.appendChild(msg);
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            conditionKey: "rate-limited",
          }),
        ],
        config
      )
    );
  });

  it("should warn when condition key conflicts with reserved name", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="test/reserved"
        fs-assert-added-removed=".something">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    expect(consoleWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('Condition key "removed" conflicts with a reserved name'),
      expect.any(Object)
    );
  });

  it("should parse modifiers on conditional assertions", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="search/execute"
        fs-assert-added-success=".result[text-matches=Found \\d+ results]">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const result = document.createElement("div");
      result.className = "result";
      result.textContent = "Found 5 results";
      document.body.appendChild(result);
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            conditionKey: "success",
          }),
        ],
        config
      )
    );
  });

  it("should allow mixing unconditional and conditional assertions on the same element", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="cart/add"
        fs-assert-added=".toast"
        fs-assert-added-success=".cart-item">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // No errors means both assertions were parsed correctly
    expect(consoleErrorMock).not.toHaveBeenCalled();
  });
});
