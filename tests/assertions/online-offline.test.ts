// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Online/Offline Triggers", () => {
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

  it("offline trigger: elements are processed when the offline event fires on window", async () => {
    document.body.innerHTML = `
      <div fs-trigger="offline" fs-assert="network/went-offline" fs-assert-visible="#offline-banner">
        <div id="offline-banner">You are offline</div>
      </div>
    `;

    cleanupFn = init(config);

    window.dispatchEvent(new Event("offline"));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "network/went-offline",
            status: "passed",
          }),
        ],
        config
      )
    );
  });

  it("online trigger: elements are processed when the online event fires on window", async () => {
    document.body.innerHTML = `
      <div fs-trigger="online" fs-assert="network/came-online" fs-assert-visible="#online-indicator">
        <div id="online-indicator">Connected</div>
      </div>
    `;

    cleanupFn = init(config);

    window.dispatchEvent(new Event("online"));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "network/came-online",
            status: "passed",
          }),
        ],
        config
      )
    );
  });

  it("on init with navigator.onLine === false, offline elements are auto-processed", async () => {
    // Mock navigator.onLine to return false
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });

    document.body.innerHTML = `
      <div fs-trigger="offline" fs-assert="network/offline-on-load" fs-assert-visible="#offline-msg">
        <div id="offline-msg">No connection</div>
      </div>
    `;

    cleanupFn = init(config);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "network/offline-on-load",
            status: "passed",
          }),
        ],
        config
      )
    );

    // Restore
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  it("on init with navigator.onLine === true, online elements are NOT auto-processed", async () => {
    // navigator.onLine defaults to true in jsdom
    document.body.innerHTML = `
      <div fs-trigger="online" fs-assert="network/online-on-load" fs-assert-visible="#online-msg">
        <div id="online-msg">Connected</div>
      </div>
    `;

    cleanupFn = init(config);

    // Advance past any potential async processing
    vi.advanceTimersByTime(1000);

    // Should NOT have been called — online is the default state, no auto-processing
    expect(sendToServerMock).not.toHaveBeenCalledWith(
      [
        expect.objectContaining({
          assertionKey: "network/online-on-load",
        }),
      ],
      config
    );
  });

  it("cleanup function removes the window listeners", async () => {
    document.body.innerHTML = `
      <div fs-trigger="offline" fs-assert="network/cleanup-test" fs-assert-visible="#banner">
        <div id="banner">Offline</div>
      </div>
    `;

    cleanupFn = init(config);
    cleanupFn();

    // After cleanup, firing offline should not process elements
    window.dispatchEvent(new Event("offline"));

    vi.advanceTimersByTime(1000);

    expect(sendToServerMock).not.toHaveBeenCalledWith(
      [
        expect.objectContaining({
          assertionKey: "network/cleanup-test",
        }),
      ],
      config
    );

    // Prevent double-cleanup in afterEach
    cleanupFn = () => {};
  });

  it("online/offline triggers work with assertion types (added)", async () => {
    document.body.innerHTML = `
      <div fs-trigger="offline" fs-assert="network/show-fallback" fs-assert-added="#fallback-ui"></div>
    `;

    cleanupFn = init(config);

    // Simulate offline, then add the fallback element
    window.dispatchEvent(new Event("offline"));

    const fallback = document.createElement("div");
    fallback.id = "fallback-ui";
    document.body.appendChild(fallback);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "network/show-fallback",
            status: "passed",
          }),
        ],
        config
      )
    );
  });

  it("online/offline triggers work with conditional assertions", async () => {
    document.body.innerHTML = `
      <div fs-trigger="offline"
        fs-assert="network/reconnect-attempt"
        fs-assert-mutex="each"
        fs-assert-visible-cached="#cached-data"
        fs-assert-added-unavailable="#unavailable-msg">
        <div id="cached-data">Cached content</div>
      </div>
    `;

    cleanupFn = init(config);

    window.dispatchEvent(new Event("offline"));

    // The cached-data div is already visible, so the "cached" conditional should win
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "network/reconnect-attempt",
            status: "passed",
          }),
        ],
        config
      )
    );
  });
});
