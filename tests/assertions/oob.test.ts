// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - OOB (Out-of-Band) Assertions", () => {
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
      (global as any).HTMLElement = class {};
    }
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
  });

  afterEach(() => {
    cleanupFn();
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleErrorMock.mockRestore();
    sendToServerMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
  });

  it("should fire OOB assertion when parent assertion passes", async () => {
    // Use real timers for OOB tests — fake timers interfere with
    // the microtask chain (MutationObserver → settle → OOB → checkImmediateResolved)
    vi.useRealTimers();

    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-updated="#target"
        fs-assert="action/do-thing">Click</button>
      <div id="target">old</div>

      <!-- OOB element: when action/do-thing passes, check counter was updated -->
      <div id="counter"
        fs-assert="action/counter-check"
        fs-assert-oob-updated="action/do-thing"
        fs-assert-updated="[text-matches=Count: \\d+]">
        Count: 1
      </div>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("target")!.textContent = "new";
      document.getElementById("counter")!.textContent = "Count: 2";
    });
    button.click();

    await vi.waitFor(() => {
      const calls = sendToServerMock.mock.calls;
      const allAssertions = calls.flatMap((c: any[]) => c[0]);
      expect(allAssertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "action/do-thing",
            status: "passed",
          }),
          expect.objectContaining({
            assertionKey: "action/counter-check",
            status: "passed",
          }),
        ])
      );
    });
  });

  it("should NOT fire OOB assertion when parent assertion fails", async () => {
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-updated="#target"
        fs-assert="action/do-thing"
        fs-assert-timeout="1000">Click</button>
      <div id="target">unchanged</div>

      <!-- OOB: should not fire because parent will fail (timeout) -->
      <div id="counter"
        fs-assert="action/counter-check"
        fs-assert-oob-updated="action/do-thing"
        fs-assert-updated="[text-matches=Count: \\d+]">
        Count: 1
      </div>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    // Click but don't change #target — parent assertion will time out
    button.click();

    fixedDateNow += 1001;
    vi.advanceTimersByTime(1000);

    await vi.waitFor(() => {
      const calls = sendToServerMock.mock.calls;
      const allAssertions = calls.flatMap((c: any[]) => c[0]);
      // Parent failed
      expect(allAssertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "action/do-thing",
            status: "failed",
          }),
        ])
      );
      // OOB should NOT be present
      const oobAssertions = allAssertions.filter(
        (a: any) => a.assertionKey === "action/counter-check"
      );
      expect(oobAssertions).toHaveLength(0);
    });
  });

  it("should support multiple parent keys (comma-separated)", async () => {
    vi.useRealTimers();
    document.body.innerHTML = `
      <button id="btn-a"
        fs-trigger="click"
        fs-assert-updated="#result"
        fs-assert="action/a">A</button>
      <div id="result">old</div>

      <!-- OOB triggered by action/a OR action/b -->
      <div id="sidebar"
        fs-assert="ui/sidebar-check"
        fs-assert-oob-updated="action/a,action/b"
        fs-assert-updated="[text-matches=Updated]">
        Updated
      </div>
    `;

    cleanupFn = init(config);

    const btn = document.querySelector("#btn-a") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      document.getElementById("result")!.textContent = "new";
    });
    btn.click();

    await vi.waitFor(() => {
      const calls = sendToServerMock.mock.calls;
      const allAssertions = calls.flatMap((c: any[]) => c[0]);
      expect(allAssertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "ui/sidebar-check",
            status: "passed",
          }),
        ])
      );
    });
  });

  it("should self-target when selector is empty (only modifiers)", async () => {
    vi.useRealTimers();
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-updated="#target"
        fs-assert="action/update">Click</button>
      <div id="target">old</div>

      <!-- Self-targeting OOB: no selector, just modifiers -->
      <div id="count"
        fs-assert="display/count"
        fs-assert-oob-updated="action/update"
        fs-assert-updated="[text-matches=\\d+]">
        42
      </div>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("target")!.textContent = "new";
      document.getElementById("count")!.textContent = "43";
    });
    button.click();

    await vi.waitFor(() => {
      const calls = sendToServerMock.mock.calls;
      const allAssertions = calls.flatMap((c: any[]) => c[0]);
      expect(allAssertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "display/count",
            status: "passed",
          }),
        ])
      );
    });
  });

  it("should only send OOB to collector once when parent passes multiple times", async () => {
    vi.useRealTimers();

    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-updated="#target"
        fs-assert="action/do-thing">Click</button>
      <div id="target">old</div>

      <div id="counter"
        fs-assert="action/counter-check"
        fs-assert-oob-visible="action/do-thing"
        fs-assert-visible="[text-matches=Count: \\d+]">
        Count: 1
      </div>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    let clickCount = 0;
    button.addEventListener("click", () => {
      clickCount++;
      document.getElementById("target")!.textContent = `updated-${clickCount}`;
      document.getElementById("counter")!.textContent = `Count: ${clickCount + 1}`;
    });

    // First click — parent passes, OOB fires and passes
    button.click();

    await vi.waitFor(() => {
      const calls = sendToServerMock.mock.calls;
      const allAssertions = calls.flatMap((c: any[]) => c[0]);
      expect(allAssertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "action/counter-check",
            status: "passed",
          }),
        ])
      );
    });

    const countAfterFirst = sendToServerMock.mock.calls
      .flatMap((c: any[]) => c[0])
      .filter((a: any) => a.assertionKey === "action/counter-check").length;
    expect(countAfterFirst).toBe(1);

    // Second click — parent passes again, OOB retries but status unchanged (passed → passed)
    button.click();

    // Wait for mutations to process
    await new Promise(resolve => setTimeout(resolve, 100));

    // OOB should still only have been sent once — dedup filters passed → passed
    const allAssertions = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0]);
    const oobAssertions = allAssertions.filter(
      (a: any) => a.assertionKey === "action/counter-check"
    );
    expect(oobAssertions).toHaveLength(1);
  });

  it("should NOT chain — OOB passing should not trigger further OOB", async () => {
    vi.useRealTimers();
    document.body.innerHTML = `
      <button
        fs-trigger="click"
        fs-assert-updated="#target"
        fs-assert="action/root">Click</button>
      <div id="target">old</div>

      <!-- First OOB: triggered by action/root -->
      <div id="oob1"
        fs-assert="action/oob1"
        fs-assert-oob-updated="action/root"
        fs-assert-updated="[text-matches=.+]">
        data
      </div>

      <!-- Second OOB: would be triggered by action/oob1 if chaining were allowed -->
      <div id="oob2"
        fs-assert="action/oob2"
        fs-assert-oob-updated="action/oob1"
        fs-assert-updated="[text-matches=.+]">
        data
      </div>
    `;

    cleanupFn = init(config);

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("target")!.textContent = "new";
    });
    button.click();

    // Wait for root and oob1 to settle
    await vi.waitFor(() => {
      const calls = sendToServerMock.mock.calls;
      const allAssertions = calls.flatMap((c: any[]) => c[0]);
      expect(allAssertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ assertionKey: "action/root", status: "passed" }),
          expect.objectContaining({ assertionKey: "action/oob1", status: "passed" }),
        ])
      );
    });

    // Wait a bit and confirm oob2 never fires (no chaining)
    await new Promise(resolve => setTimeout(resolve, 100));
    const calls = sendToServerMock.mock.calls;
    const allAssertions = calls.flatMap((c: any[]) => c[0]);
    const oob2 = allAssertions.filter((a: any) => a.assertionKey === "action/oob2");
    expect(oob2).toHaveLength(0);
  });
});
