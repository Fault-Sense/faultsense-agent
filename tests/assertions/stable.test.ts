// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Assertion Type: stable", () => {
  let sendToServerMock: ReturnType<typeof vi.spyOn>;
  let cleanupFn: ReturnType<typeof init>;
  let fixedDateNow = 1230000000000;
  let config = {
    apiKey: "TEST_API_KEY",
    releaseLabel: "0.0.0",
    gcInterval: 30000,
    unloadGracePeriod: 2000,
    collectorURL: "http://localhost:9000",
  };

  beforeEach(() => {
    if (typeof HTMLElement === "undefined") {
      (global as any).HTMLElement = class {};
    }
    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);
    sendToServerMock = vi
      .spyOn(resolveModule, "sendToCollector")
      .mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
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
    vi.restoreAllMocks();
  });

  it("should pass when SLA timeout fires without any mutation (inverted)", async () => {
    document.body.innerHTML = `
      <div id="panel">Stable content</div>
      <button fs-trigger="click"
        fs-assert-stable="#panel"
        fs-assert="dashboard/panel-stable"
        fs-assert-timeout="2000">Check Stability</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // Advance past the SLA timeout — no mutations happened
    fixedDateNow += 2001;
    vi.advanceTimersByTime(2001);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed", // inverted: timeout → pass
            statusReason: "",
          }),
        ],
        config
      )
    );
  });

  it("should fail when a child element is mutated (inverted)", async () => {
    document.body.innerHTML = `
      <div id="panel"><span id="child">Hello</span></div>
      <button fs-trigger="click"
        fs-assert-stable="#panel"
        fs-assert="dashboard/panel-stable"
        fs-assert-timeout="2000">Check Stability</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Mutate a child — this should trigger the updated matcher
      setTimeout(() => {
        document.getElementById("child")!.textContent = "Changed!";
      }, 100);
    });

    button.click();

    fixedDateNow += 101;
    vi.advanceTimersByTime(101);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "failed", // inverted: mutation detected → fail
          }),
        ],
        config
      )
    );
  });

  it("should fail when target attribute changes", async () => {
    document.body.innerHTML = `
      <div id="panel">Content</div>
      <button fs-trigger="click"
        fs-assert-stable="#panel"
        fs-assert="dashboard/panel-stable"
        fs-assert-timeout="2000">Check Stability</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      setTimeout(() => {
        document.getElementById("panel")!.setAttribute("data-state", "changed");
      }, 50);
    });

    button.click();

    fixedDateNow += 51;
    vi.advanceTimersByTime(51);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "failed" })],
        config
      )
    );
  });

  it("should fail when a child element is added", async () => {
    document.body.innerHTML = `
      <div id="panel">Content</div>
      <button fs-trigger="click"
        fs-assert-stable="#panel"
        fs-assert="dashboard/panel-stable"
        fs-assert-timeout="2000">Check Stability</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      setTimeout(() => {
        const child = document.createElement("span");
        child.textContent = "New child";
        document.getElementById("panel")!.appendChild(child);
      }, 50);
    });

    button.click();

    fixedDateNow += 51;
    vi.advanceTimersByTime(51);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "failed" })],
        config
      )
    );
  });

  it("should fail on any attribute mutation including data-fs-*", async () => {
    document.body.innerHTML = `
      <div id="panel">Content</div>
      <button fs-trigger="click"
        fs-assert-stable="#panel"
        fs-assert="dashboard/panel-stable"
        fs-assert-timeout="1000">Check Stability</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      setTimeout(() => {
        document.getElementById("panel")!.setAttribute("data-fs-oob-target", "true");
      }, 50);
    });

    button.click();

    fixedDateNow += 51;
    vi.advanceTimersByTime(51);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "failed" })],
        config
      )
    );
  });

  it("should pass via GC when no SLA timeout is set", async () => {
    document.body.innerHTML = `
      <div id="panel">Content</div>
      <button fs-trigger="click"
        fs-assert-stable="#panel"
        fs-assert="dashboard/panel-stable">Check Stability</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // Advance past the GC interval — no mutations happened
    fixedDateNow += config.gcInterval + 1;
    vi.advanceTimersByTime(config.gcInterval + 1);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed", // inverted: GC timeout → pass
          }),
        ],
        config
      )
    );
  });

  it("should pass on page unload when stale (inverted)", async () => {
    document.body.innerHTML = `
      <div id="panel">Content</div>
      <button fs-trigger="click"
        fs-assert-stable="#panel"
        fs-assert="dashboard/panel-stable"
        fs-assert-timeout="5000">Check Stability</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // Advance past unloadGracePeriod so it's considered stale
    fixedDateNow += config.unloadGracePeriod + 1;
    vi.advanceTimersByTime(1);

    // Simulate page unload
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new Event("pagehide"));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            status: "passed", // inverted: stale unload → pass (no mutation)
            statusReason: "",
          }),
        ],
        config
      )
    );

    // Restore visibilityState
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });
  });

  it("should work with conditional sibling dismissal", async () => {
    document.body.innerHTML = `
      <div id="panel">Content</div>
      <div id="error-msg" style="display:none">Error</div>
      <button fs-trigger="click"
        fs-assert="form/submit"
        fs-assert-mutex="each"
        fs-assert-stable-success="#panel"
        fs-assert-added-error="#error-msg"
        fs-assert-timeout="1000">Submit</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();

    // No mutations happen — stable-success should pass via SLA timeout
    fixedDateNow += 1001;
    vi.advanceTimersByTime(1001);

    await vi.waitFor(() => {
      expect(sendToServerMock).toHaveBeenCalled();
      const calls = sendToServerMock.mock.calls;
      const allAssertions = calls.flatMap((c: any) => c[0]);
      // stable-success should pass (inverted timeout)
      const passed = allAssertions.filter((a: any) => a.status === "passed");
      expect(passed.length).toBeGreaterThanOrEqual(1);
      expect(passed[0].conditionKey).toBe("success");
      // Dismissed assertions are filtered by getAssertionsToSettle and not sent
      // to the collector — the error sibling is dismissed internally only
      const errorSent = allAssertions.filter((a: any) => a.conditionKey === "error");
      expect(errorSent.length).toBe(0);
    });
  });
});
