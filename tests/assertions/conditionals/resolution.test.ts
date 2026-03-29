// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../../src/index";
import * as resolveModule from "../../../src/assertions/server";

describe("Faultsense Agent - Conditional Assertion Resolution", () => {
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
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
    sendToServerMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
  });

  it("first conditional to pass wins, siblings dismissed", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="auth/login"
        fs-assert-added-success=".dashboard"
        fs-assert-added-error=".error-msg">Click</button>
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

    // Only one call — the error sibling was dismissed, not sent
    expect(sendToServerMock).toHaveBeenCalledTimes(1);
  });

  it("second conditional can win if first doesn't match", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="auth/login"
        fs-assert-added-success=".dashboard"
        fs-assert-added-error=".error-msg">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const msg = document.createElement("div");
      msg.className = "error-msg";
      document.body.appendChild(msg);
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            conditionKey: "error",
          }),
        ],
        config
      )
    );

    expect(sendToServerMock).toHaveBeenCalledTimes(1);
  });

  it("conditional fails when selector matches but modifier fails, siblings dismissed", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="form/submit"
        fs-assert-added-success=".result[text-matches=Success]"
        fs-assert-added-error=".error">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const result = document.createElement("div");
      result.className = "result";
      result.textContent = "Wrong content";
      document.body.appendChild(result);
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
            conditionKey: "success",
          }),
        ],
        config
      )
    );

    // Only one call — the error sibling was dismissed
    expect(sendToServerMock).toHaveBeenCalledTimes(1);
  });

  it("group timeout produces one failure when no conditional matches", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="search/execute"
        fs-assert-added-results=".result-card"
        fs-assert-added-empty=".no-results"
        fs-assert-added-error=".search-error"
        fs-assert-timeout="1000">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // Advance past timeout
    fixedDateNow += 1001;
    vi.advanceTimersByTime(1000);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed",
          }),
        ],
        config
      )
    );

    // Only ONE failure for the group, not three
    expect(sendToServerMock).toHaveBeenCalledTimes(1);
  });

  it("unconditional and conditional assertions coexist independently", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="cart/add"
        fs-assert-added=".toast"
        fs-assert-added-success=".cart-item"
        fs-assert-added-error=".stock-error">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Both toast and cart-item appear
      const toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);

      const item = document.createElement("div");
      item.className = "cart-item";
      document.body.appendChild(item);
    });

    button.click();

    // Both resolve in the same mutation batch
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            status: "passed",
            type: "added",
          }),
          expect.objectContaining({
            status: "passed",
            conditionKey: "success",
          }),
        ]),
        config
      )
    );
  });

  it("3+ conditionals work as switch pattern", async () => {
    document.body.innerHTML = `
      <form
        fs-trigger="submit"
        fs-assert="search/execute"
        fs-assert-added-results=".result-card"
        fs-assert-added-empty=".no-results"
        fs-assert-added-error=".search-error">
        <button type="submit">Search</button>
      </form>
    `;

    const form = document.querySelector("form") as HTMLFormElement;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const noResults = document.createElement("div");
      noResults.className = "no-results";
      document.body.appendChild(noResults);
    });

    form.dispatchEvent(new Event("submit", { bubbles: true }));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            conditionKey: "empty",
          }),
        ],
        config
      )
    );

    // Only one call — two siblings dismissed
    expect(sendToServerMock).toHaveBeenCalledTimes(1);
  });

  it("fs-assert-mutex links conditionals across different types as siblings", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="todos/remove-item"
        fs-assert-mutex="each"
        fs-assert-removed-success=".todo-item"
        fs-assert-added-error=".error-msg"
        fs-assert-timeout="2000">Delete</button>
      <div class="todo-item">Buy milk</div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;

    // First verify both assertions are created with grouped=true
    button.addEventListener("click", () => {
      const item = document.querySelector(".todo-item");
      if (item) item.remove();
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            conditionKey: "success",
            type: "removed",
            mutex: "each",
          }),
        ],
        config
      )
    );

    // Only one call — the added-error sibling was dismissed across types
    expect(sendToServerMock).toHaveBeenCalledTimes(1);
  });

  it("fs-assert-mutex: timeout dismisses siblings across types", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="test/delete"
        fs-assert-mutex="each"
        fs-assert-removed-success=".item"
        fs-assert-added-error=".error-msg"
        fs-assert-timeout="2000">Delete</button>
      <div class="item">Item</div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    // Click but don't remove .item or add .error-msg — both should timeout
    button.click();

    fixedDateNow += 2001;
    vi.advanceTimersByTime(2000);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalled()
    );

    const allAssertions = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0]);

    // Should be ONE failure (group timeout), not two independent failures
    expect(allAssertions).toHaveLength(1);
    expect(allAssertions[0]).toEqual(
      expect.objectContaining({
        status: "failed",
      })
    );
  });

  it("fs-assert-mutex: late resolution after timeout does not resurrect dismissed sibling", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="test/delete"
        fs-assert-mutex="each"
        fs-assert-removed-success=".item"
        fs-assert-added-error=".error-msg"
        fs-assert-timeout="2000">Delete</button>
      <div class="item">Item</div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // Timeout fires — group fails
    fixedDateNow += 2001;
    vi.advanceTimersByTime(2000);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalled()
    );

    const callsAfterTimeout = sendToServerMock.mock.calls.length;

    // NOW the element is removed (late server response)
    document.querySelector(".item")!.remove();

    // Wait for any mutations to process
    fixedDateNow += 100;
    vi.advanceTimersByTime(100);

    await vi.waitFor(() => {
      // No additional calls should have been made
      expect(sendToServerMock.mock.calls.length).toBe(callsAfterTimeout);
    });
  });

  it("without fs-assert-mutex, different types are independent", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="todos/remove-item"
        fs-assert-removed-success=".todo-item"
        fs-assert-added-error=".error-msg"
        fs-assert-timeout="2000">Delete</button>
      <div class="todo-item">Buy milk</div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const item = document.querySelector(".todo-item");
      if (item) item.remove();
    });

    button.click();

    // removed-success passes
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed",
            conditionKey: "success",
            type: "removed",
          }),
        ],
        config
      )
    );

    // added-error times out independently (not dismissed)
    fixedDateNow += 2001;
    vi.advanceTimersByTime(2000);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledTimes(2)
    );
  });

  it("fs-assert-mutex=conditions: same-key assertions survive when competing key resolves", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="todos/add-item"
        fs-assert-mutex="conditions"
        fs-assert-added-success=".todo-item"
        fs-assert-visible-success="#count"
        fs-assert-added-error=".error-msg"
        fs-assert-timeout="2000">Add</button>
      <span id="count">1</span>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const item = document.createElement("div");
      item.className = "todo-item";
      document.body.appendChild(item);
    });

    button.click();

    await vi.waitFor(() => {
      const allAssertions = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0]);

      // added-success should pass
      const addedSuccess = allAssertions.find((a: any) => a.type === "added" && a.conditionKey === "success");
      expect(addedSuccess).toBeDefined();
      expect(addedSuccess.status).toBe("passed");

      // visible-success (same key) should also pass — NOT dismissed
      const visibleSuccess = allAssertions.find((a: any) => a.type === "visible" && a.conditionKey === "success");
      expect(visibleSuccess).toBeDefined();
      expect(visibleSuccess.status).toBe("passed");

      // added-error (different key) should be dismissed — NOT sent to collector
      const errorAssertions = allAssertions.filter((a: any) => a.conditionKey === "error");
      expect(errorAssertions).toHaveLength(0);
    });
  });

  it("fs-assert-mutex=conditions: different-key assertions are dismissed (not sent to collector)", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="test/mutex-cond"
        fs-assert-mutex="conditions"
        fs-assert-added-success=".result"
        fs-assert-added-error=".error-msg">Test</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const err = document.createElement("div");
      err.className = "error-msg";
      document.body.appendChild(err);
    });

    button.click();

    await vi.waitFor(() => {
      const allAssertions = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0]);

      // error wins — sent to collector
      const errorAssertion = allAssertions.find((a: any) => a.conditionKey === "error");
      expect(errorAssertion).toBeDefined();
      expect(errorAssertion.status).toBe("passed");

      // success should be dismissed — NOT sent to collector
      const successAssertions = allAssertions.filter((a: any) => a.conditionKey === "success");
      expect(successAssertions).toHaveLength(0);
    });
  });

  it("fs-assert-mutex selective: only listed keys compete", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert="test/selective"
        fs-assert-mutex="success,error"
        fs-assert-added-success=".result"
        fs-assert-added-error=".error-msg"
        fs-assert-visible-info="#info">Test</button>
      <div id="info">Info</div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const result = document.createElement("div");
      result.className = "result";
      document.body.appendChild(result);
    });

    button.click();

    await vi.waitFor(() => {
      const allAssertions = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0]);

      // success wins (listed key) — sent to collector
      const successAssertion = allAssertions.find((a: any) => a.conditionKey === "success");
      expect(successAssertion).toBeDefined();
      expect(successAssertion.status).toBe("passed");

      // error (listed, different key) dismissed — NOT sent
      const errorAssertions = allAssertions.filter((a: any) => a.conditionKey === "error");
      expect(errorAssertions).toHaveLength(0);

      // info (NOT listed) should resolve independently — passed
      const infoAssertion = allAssertions.find((a: any) => a.conditionKey === "info");
      expect(infoAssertion).toBeDefined();
      expect(infoAssertion.status).toBe("passed");
    });
  });
});
