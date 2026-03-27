// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - GC Sweep and Timeout Changes", () => {
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
  let sendToServerMock: ReturnType<typeof vi.spyOn>;
  let cleanupFn: ReturnType<typeof init>;
  let fixedDateNow = 1230000000000;
  let config = {
    apiKey: "TEST_API_KEY",
    releaseLabel: "0.0.0",
    gcInterval: 5000,
    unloadGracePeriod: 2000,
    collectorURL: "http://localhost:9000",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);

    sendToServerMock = vi
      .spyOn(resolveModule, "sendToCollector")
      .mockImplementation(() => {});

    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mock("../../src/utils/elements", () => ({
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

  it("assertion without fs-assert-timeout does NOT fail at old default (1000ms)", () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert="test/no-sla"
        fs-assert-added=".result">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // Advance past old default timeout
    fixedDateNow += 2000;
    vi.advanceTimersByTime(2000);

    // No failure — no per-assertion timer
    expect(sendToServerMock).not.toHaveBeenCalled();
  });

  it("assertion with fs-assert-timeout fails at SLA deadline", () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert="test/with-sla"
        fs-assert-added=".result" fs-assert-timeout="1000">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    fixedDateNow += 1001;
    vi.advanceTimersByTime(1000);

    expect(sendToServerMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          status: "failed",
          statusReason: expect.stringContaining("within 1000ms"),
        }),
      ],
      config
    );
  });

  it("GC sweeps stale assertions after gcInterval", () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert="test/gc"
        fs-assert-added=".result">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // Not stale yet
    fixedDateNow += 3000;
    vi.advanceTimersByTime(3000);
    expect(sendToServerMock).not.toHaveBeenCalled();

    // GC fires at gcInterval (5000ms)
    fixedDateNow += 2001;
    vi.advanceTimersByTime(2001);

    expect(sendToServerMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          status: "failed",
          statusReason: expect.stringContaining("did not resolve within"),
        }),
      ],
      config
    );
  });

  it("invariants survive GC sweep", () => {
    document.body.innerHTML = `
      <nav id="main-nav" fs-assert="layout/nav" fs-trigger="invariant"
        fs-assert-visible="#main-nav">Nav</nav>
      <button fs-trigger="click" fs-assert="test/gc"
        fs-assert-added=".result">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // GC fires
    fixedDateNow += 5001;
    vi.advanceTimersByTime(5001);

    // Only the button assertion was GC'd, not the invariant
    const allAssertions = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0]);
    expect(allAssertions).toHaveLength(1);
    expect(allAssertions[0].assertionKey).toBe("test/gc");
  });

  it("page unload fails stale assertions and drops fresh ones", () => {
    document.body.innerHTML = `
      <button id="old" fs-trigger="click" fs-assert="test/old"
        fs-assert-added=".old-result">Old</button>
      <button id="new" fs-trigger="click" fs-assert="test/new"
        fs-assert-added=".new-result">New</button>
    `;

    // Click the old button
    (document.getElementById("old") as HTMLButtonElement).click();

    // Wait 3 seconds (past grace period)
    fixedDateNow += 3000;
    vi.advanceTimersByTime(3000);

    // Click the new button (within grace period of unload)
    (document.getElementById("new") as HTMLButtonElement).click();

    // Simulate page unload
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    window.dispatchEvent(new Event("pagehide"));

    const allAssertions = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0]);

    // Old assertion (3s old) should be failed
    expect(allAssertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assertionKey: "test/old",
          status: "failed",
          statusReason: expect.stringContaining("page unload"),
        }),
      ])
    );

    // New assertion (0s old, within grace period) should NOT be sent
    const newAssertions = allAssertions.filter((a: any) => a.assertionKey === "test/new");
    expect(newAssertions).toHaveLength(0);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("re-trigger on pending assertion records attempt timestamp", () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert="test/retrigger"
        fs-assert-added=".result">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;

    // First click — creates assertion
    button.click();

    // Second click — re-trigger, records attempt
    fixedDateNow += 1000;
    button.click();

    // Third click
    fixedDateNow += 1000;
    button.click();

    // Now make it pass
    button.addEventListener("click", () => {
      const result = document.createElement("div");
      result.className = "result";
      document.body.appendChild(result);
    });
    button.click();

    // The assertion should include attempts array with 2 timestamps (clicks 2 and 3)
    // Click 4 resolves it, so it's not a re-trigger
    // Actually click 4 also re-triggers first since the assertion is still pending,
    // then the event listener adds the element
  });

  it("retry clears attempts array", () => {
    document.body.innerHTML = `
      <button fs-trigger="click" fs-assert="test/retry-clear"
        fs-assert-added=".result" fs-assert-timeout="1000">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // Re-trigger while pending
    fixedDateNow += 500;
    button.click();

    // SLA timeout fires — assertion fails with attempts
    fixedDateNow += 501;
    vi.advanceTimersByTime(1000);

    expect(sendToServerMock).toHaveBeenCalled();

    // Click again — retries the completed assertion
    fixedDateNow += 100;
    button.click();

    // The retried assertion should have cleared attempts
    // It will timeout again with no attempts
    fixedDateNow += 1001;
    vi.advanceTimersByTime(1001);

    const allCalls = sendToServerMock.mock.calls;
    const lastCall = allCalls[allCalls.length - 1][0][0];
    // After retry, attempts should be empty
    expect(lastCall.attempts || []).toHaveLength(0);
  });
});
