// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Custom Event Triggers", () => {
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
    if (typeof HTMLElement === "undefined") {
      (global as any).HTMLElement = class { };
    }

    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);

    sendToServerMock = vi
      .spyOn(resolveModule, "sendToCollector")
      .mockImplementation(() => { });

    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => { });

    vi.mock("../../src/utils/elements", async () => ({ ...await vi.importActual("../../src/utils/elements") as any,
      isVisible: vi.fn().mockImplementation((element: HTMLElement) => {
        return (
          element.style.display !== "none" &&
          element.style.visibility !== "hidden"
        );
      }),
    }));
  });

  afterEach(() => {
    cleanupFn?.();
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleErrorMock.mockRestore();
    sendToServerMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
  });

  it("custom event trigger creates assertion when event fires", async () => {
    document.body.innerHTML = `
      <div id="cart-count"
        fs-trigger="event:cart-updated"
        fs-assert="cart/count-sync"
        fs-assert-visible="#cart-count">
        3 items
      </div>
    `;

    cleanupFn = init(config);

    // Dispatch the custom event
    document.dispatchEvent(new CustomEvent("cart-updated"));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          assertionKey: "cart/count-sync",
          status: "passed",
          trigger: "event:cart-updated",
        })],
        config
      )
    );
  });

  it("detail-matches gates assertion creation", async () => {
    document.body.innerHTML = `
      <div id="status"
        fs-trigger="event:order-update[detail-matches=action:complete]"
        fs-assert="order/completed"
        fs-assert-visible="#status">
        Done
      </div>
    `;

    cleanupFn = init(config);

    // Wrong detail — should NOT create assertion
    document.dispatchEvent(new CustomEvent("order-update", { detail: { action: "pending" } }));
    vi.advanceTimersByTime(100);
    expect(sendToServerMock).not.toHaveBeenCalled();

    // Correct detail — should create assertion
    document.dispatchEvent(new CustomEvent("order-update", { detail: { action: "complete" } }));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          assertionKey: "order/completed",
          status: "passed",
        })],
        config
      )
    );
  });

  it("dynamically added elements register custom event listeners", async () => {
    document.body.innerHTML = `<div id="root"></div>`;
    cleanupFn = init(config);

    // Dynamically add an element with a custom event trigger
    const el = document.createElement("div");
    el.id = "dynamic";
    el.setAttribute("fs-trigger", "event:widget-loaded");
    el.setAttribute("fs-assert", "widget/loaded");
    el.setAttribute("fs-assert-visible", "#dynamic");
    document.getElementById("root")!.appendChild(el);

    // Flush microtasks so MutationObserver callback fires and registers the element
    await Promise.resolve();
    await Promise.resolve();

    // Now dispatch — element should be registered
    document.dispatchEvent(new CustomEvent("widget-loaded"));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          assertionKey: "widget/loaded",
          status: "passed",
        })],
        config
      )
    );
  });

  it("cleanup removes custom event listeners", async () => {
    document.body.innerHTML = `
      <div id="el"
        fs-trigger="event:test-event"
        fs-assert="test/cleanup"
        fs-assert-visible="#el">Test</div>
    `;

    cleanupFn = init(config);
    cleanupFn();

    document.dispatchEvent(new CustomEvent("test-event"));
    vi.advanceTimersByTime(1000);

    expect(sendToServerMock).not.toHaveBeenCalledWith(
      [expect.objectContaining({ assertionKey: "test/cleanup" })],
      config
    );

    cleanupFn = () => {};
  });

  it("works with DOM assertion types (added)", async () => {
    document.body.innerHTML = `
      <div fs-trigger="event:data-loaded"
        fs-assert="data/results-shown"
        fs-assert-added="#results">
      </div>
    `;

    cleanupFn = init(config);

    document.dispatchEvent(new CustomEvent("data-loaded"));

    // Add the results element after the event
    const results = document.createElement("div");
    results.id = "results";
    document.body.appendChild(results);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          assertionKey: "data/results-shown",
          status: "passed",
        })],
        config
      )
    );
  });

  it("preserves full trigger value on assertion", async () => {
    document.body.innerHTML = `
      <div id="el"
        fs-trigger="event:my-event"
        fs-assert="test/trigger-value"
        fs-assert-visible="#el">Test</div>
    `;

    cleanupFn = init(config);
    document.dispatchEvent(new CustomEvent("my-event"));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          trigger: "event:my-event",
        })],
        config
      )
    );
  });
});
