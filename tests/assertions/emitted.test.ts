// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Emitted Assertion Type", () => {
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
    if (typeof HTMLElement === "undefined") {
      (global as any).HTMLElement = class { };
    }

    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);

    sendToServerMock = vi
      .spyOn(resolveModule, "sendToCollector")
      .mockImplementation(() => { });

    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => { });
    consoleWarnMock = vi.spyOn(console, "warn").mockImplementation(() => { });

    vi.mock("../../src/utils/elements", async () => ({ ...await vi.importActual("../../src/utils/elements") as any,
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

  it("emitted assertion passes when matching CustomEvent fires", async () => {
    document.body.innerHTML = `
      <button id="pay-btn"
        fs-trigger="click"
        fs-assert="payment/process"
        fs-assert-emitted="payment:complete">
        Pay Now
      </button>
    `;

    const btn = document.getElementById("pay-btn")!;
    btn.click();

    // Emitted assertion is now pending — dispatch the custom event
    document.dispatchEvent(new CustomEvent("payment:complete"));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          assertionKey: "payment/process",
          type: "emitted",
          status: "passed",
        })],
        config
      )
    );
  });

  it("emitted assertion stays pending when wrong event fires", async () => {
    document.body.innerHTML = `
      <button id="btn"
        fs-trigger="click"
        fs-assert="test/emitted"
        fs-assert-emitted="my-event">
        Test
      </button>
    `;

    const btn = document.getElementById("btn")!;
    btn.click();

    // Wrong event name
    document.dispatchEvent(new CustomEvent("other-event"));
    vi.advanceTimersByTime(100);

    // Should not have resolved
    expect(sendToServerMock).not.toHaveBeenCalledWith(
      [expect.objectContaining({ type: "emitted", status: "passed" })],
      config
    );
  });

  it("detail-matches with regex gates emitted resolution", async () => {
    document.body.innerHTML = `
      <button id="btn"
        fs-trigger="click"
        fs-assert="order/placed"
        fs-assert-emitted="order:complete[detail-matches=orderId:\\d+]">
        Place Order
      </button>
    `;

    const btn = document.getElementById("btn")!;
    btn.click();

    // Detail doesn't match regex
    document.dispatchEvent(new CustomEvent("order:complete", { detail: { orderId: "abc" } }));
    vi.advanceTimersByTime(100);
    expect(sendToServerMock).not.toHaveBeenCalledWith(
      [expect.objectContaining({ type: "emitted", status: "passed" })],
      config
    );

    // Detail matches regex
    document.dispatchEvent(new CustomEvent("order:complete", { detail: { orderId: "12345" } }));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          assertionKey: "order/placed",
          type: "emitted",
          status: "passed",
        })],
        config
      )
    );
  });

  it("emitted + DOM assertion produce two independent data points", async () => {
    document.body.innerHTML = `
      <button id="btn"
        fs-trigger="click"
        fs-assert="payment/process"
        fs-assert-emitted="payment:complete"
        fs-assert-visible="#btn">
        Pay
      </button>
    `;

    const btn = document.getElementById("btn")!;
    btn.click();

    // Visible assertion should pass immediately
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          assertionKey: "payment/process",
          type: "visible",
          status: "passed",
        })],
        config
      )
    );

    // Emitted should still be pending
    expect(sendToServerMock).not.toHaveBeenCalledWith(
      [expect.objectContaining({ type: "emitted", status: "passed" })],
      config
    );

    // Now fire the custom event
    document.dispatchEvent(new CustomEvent("payment:complete"));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          type: "emitted",
          status: "passed",
        })],
        config
      )
    );
  });

  it("GC fails unresolved emitted assertions", async () => {
    document.body.innerHTML = `
      <button id="btn"
        fs-trigger="click"
        fs-assert="test/gc-emitted"
        fs-assert-emitted="never-fires">
        Test
      </button>
    `;

    const btn = document.getElementById("btn")!;
    btn.click();

    // Advance time so the assertion is older than gcInterval
    fixedDateNow += config.gcInterval + 1000;
    vi.advanceTimersByTime(config.gcInterval + 1000);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          assertionKey: "test/gc-emitted",
          type: "emitted",
          status: "failed",
        })],
        config
      )
    );
  });

  it("MPA mode warns and is ignored for emitted assertions", () => {
    document.body.innerHTML = `
      <button id="btn"
        fs-trigger="click"
        fs-assert="test/mpa-emitted"
        fs-assert-emitted="some-event"
        fs-assert-mpa="true">
        Test
      </button>
    `;

    const btn = document.getElementById("btn")!;
    btn.click();

    expect(consoleWarnMock).toHaveBeenCalledWith(
      expect.stringContaining("emitted")
    );
  });
});
