// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Invariant Assertions", () => {
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
  let sendToServerMock: ReturnType<typeof vi.spyOn>;
  let cleanupFn: ReturnType<typeof init>;
  let fixedDateNow = 1230000000000;
  let config = {
    apiKey: "TEST_API_KEY",
    releaseLabel: "0.0.0",
    gcInterval: 30000, unloadGracePeriod: 2000,
    collectorURL: "http://localhost:9000",
    debug: true,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);

    // Snapshot assertions at call time — invariant auto-retry in settle()
    // mutates assertion objects after sendToCollector returns.
    sendToServerMock = vi
      .spyOn(resolveModule, "sendToCollector")
      .mockImplementation((assertions: any[], cfg: any) => {
        sendToServerMock.mock.calls[sendToServerMock.mock.calls.length - 1][0] =
          assertions.map((a: any) => ({ ...a }));
      });

    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});

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
    cleanupFn();
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleErrorMock.mockRestore();
    sendToServerMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
    // Reset visibilityState if it was mocked
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("invariant stays pending when condition holds — no collector calls", async () => {
    document.body.innerHTML = `
      <nav id="main-nav"
        fs-assert="layout/nav-visible"
        fs-trigger="invariant"
        fs-assert-visible="#main-nav">Nav</nav>
    `;

    cleanupFn = init(config);

    // Trigger some mutations to exercise the invariant evaluation
    const div = document.createElement("div");
    document.body.appendChild(div);

    fixedDateNow += 2000;
    vi.advanceTimersByTime(2000);

    // No calls — invariant holds, no timeout fires
    expect(sendToServerMock).not.toHaveBeenCalled();
  });

  it("invariant failure reported when condition violated", async () => {
    vi.useRealTimers();
    document.body.innerHTML = `
      <nav id="main-nav"
        fs-assert="layout/nav-visible"
        fs-trigger="invariant"
        fs-assert-visible="#main-nav">Nav</nav>
    `;

    cleanupFn = init(config);

    // Hide the nav — violate the invariant
    const nav = document.getElementById("main-nav")!;
    nav.style.display = "none";

    await vi.waitFor(() => {
      const allAssertions = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0]);
      expect(allAssertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "layout/nav-visible",
            status: "failed",
          }),
        ])
      );
    });
  });

  it("invariant recovery reported after failure", async () => {
    vi.useRealTimers();
    document.body.innerHTML = `
      <nav id="main-nav"
        fs-assert="layout/nav-visible"
        fs-trigger="invariant"
        fs-assert-visible="#main-nav">Nav</nav>
    `;

    cleanupFn = init(config);

    const nav = document.getElementById("main-nav")!;

    // Violate
    nav.style.display = "none";

    await vi.waitFor(() => {
      const allAssertions = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0]);
      expect(allAssertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "layout/nav-visible",
            status: "failed",
          }),
        ])
      );
    });

    // Recover
    nav.style.display = "";

    await vi.waitFor(() => {
      const allAssertions = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0]);
      expect(allAssertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "layout/nav-visible",
            status: "passed",
          }),
        ])
      );
    });
  });

  it("no timeout fires for invariants", async () => {
    document.body.innerHTML = `
      <nav id="main-nav"
        fs-assert="layout/nav-visible"
        fs-trigger="invariant"
        fs-assert-visible="#main-nav">Nav</nav>
    `;

    cleanupFn = init(config);

    // Advance way past default timeout
    fixedDateNow += 10000;
    vi.advanceTimersByTime(10000);

    // No timeout failure — invariants are perpetual
    expect(sendToServerMock).not.toHaveBeenCalled();
  });

  it("page unload auto-passes pending invariants", async () => {
    document.body.innerHTML = `
      <nav id="main-nav"
        fs-assert="layout/nav-visible"
        fs-trigger="invariant"
        fs-assert-visible="#main-nav">Nav</nav>
    `;

    cleanupFn = init(config);

    // No violations — invariant is pending
    expect(sendToServerMock).not.toHaveBeenCalled();

    // Simulate page unload (visibilityState must be "hidden" for real unload)
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    window.dispatchEvent(new Event("pagehide"));

    expect(sendToServerMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          assertionKey: "layout/nav-visible",
          status: "passed",
        }),
      ],
      config
    );
  });

  it("page unload does NOT auto-pass failed invariants", async () => {
    vi.useRealTimers();
    document.body.innerHTML = `
      <nav id="main-nav"
        fs-assert="layout/nav-visible"
        fs-trigger="invariant"
        fs-assert-visible="#main-nav">Nav</nav>
    `;

    cleanupFn = init(config);

    // Violate
    const nav = document.getElementById("main-nav")!;
    nav.style.display = "none";

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalled()
    );

    const callsBeforeUnload = sendToServerMock.mock.calls.length;

    // Simulate page unload
    window.dispatchEvent(new Event("pagehide"));

    // No additional calls — the failure stands
    expect(sendToServerMock.mock.calls.length).toBe(callsBeforeUnload);
  });

  it("element removal leaves invariant pending — auto-passed on page unload", async () => {
    vi.useRealTimers();
    document.body.innerHTML = `
      <nav id="main-nav"
        fs-assert="layout/nav-visible"
        fs-trigger="invariant"
        fs-assert-visible="#main-nav">Nav</nav>
    `;

    cleanupFn = init(config);

    // Remove the element entirely (component unmount)
    document.getElementById("main-nav")!.remove();

    // Wait for mutations to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // No auto-pass on removal — invariant stays pending
    expect(sendToServerMock).not.toHaveBeenCalled();

    // Page unload auto-passes it
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    window.dispatchEvent(new Event("pagehide"));

    expect(sendToServerMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          assertionKey: "layout/nav-visible",
          status: "passed",
        }),
      ],
      config
    );
  });

  it("dynamic invariant discovered via MutationObserver", async () => {
    vi.useRealTimers();
    document.body.innerHTML = `<div id="app"></div>`;

    cleanupFn = init(config);

    // Dynamically add an invariant element
    const nav = document.createElement("nav");
    nav.id = "dynamic-nav";
    nav.setAttribute("fs-assert", "layout/dynamic-nav");
    nav.setAttribute("fs-trigger", "invariant");
    nav.setAttribute("fs-assert-visible", "#dynamic-nav");
    nav.textContent = "Nav";
    document.getElementById("app")!.appendChild(nav);

    // Wait for MutationObserver to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Now hide it to trigger failure
    nav.style.display = "none";

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "layout/dynamic-nav",
            status: "failed",
          }),
        ],
        config
      )
    );
  });
});
