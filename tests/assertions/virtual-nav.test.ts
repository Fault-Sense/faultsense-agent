// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

/**
 * Virtual-nav lifecycle tests — covers hx-boost / React Router / TanStack
 * Router SPA navigation that does not fire a real pagehide/beforeunload.
 *
 * A virtual nav is detected when pushState/replaceState/popstate changes
 * the URL pathname. On path change, the manager runs the same flush logic
 * as handlePageUnload:
 *   - Auto-pass pending invariants from the old "page"
 *   - Fail stale non-invariant, non-route assertions older than grace period
 *   - Reload any MPA assertions from storage
 */
describe("Faultsense Agent - Virtual Nav Lifecycle (pushState path change)", () => {
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
  let consoleWarnMock: ReturnType<typeof vi.spyOn>;
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

  let originalPushState: typeof history.pushState;
  let originalReplaceState: typeof history.replaceState;

  beforeEach(() => {
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;

    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);

    // Snapshot assertions at call time — the manager mutates assertion
    // objects after sendToCollector returns.
    sendToServerMock = vi
      .spyOn(resolveModule, "sendToCollector")
      .mockImplementation((assertions: any[]) => {
        sendToServerMock.mock.calls[sendToServerMock.mock.calls.length - 1][0] =
          assertions.map((a: any) => ({ ...a }));
      });

    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnMock = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.mock("../../src/utils/elements", async () => ({
      ...(await vi.importActual("../../src/utils/elements") as any),
      isVisible: vi.fn().mockImplementation((element: HTMLElement) => {
        return (
          element.style.display !== "none" &&
          element.style.visibility !== "hidden"
        );
      }),
    }));

    // Reset to a known path before each test
    history.replaceState({}, "", "/old-page");
    localStorage.clear();
  });

  afterEach(() => {
    cleanupFn();
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleErrorMock.mockRestore();
    consoleWarnMock.mockRestore();
    sendToServerMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    localStorage.clear();
  });

  it("fails stale non-invariant assertion on URL-path change after grace period", async () => {
    document.body.innerHTML = `
      <button fs-assert="feature/do-thing" fs-trigger="click" fs-assert-added=".result">Go</button>
    `;

    cleanupFn = init(config);

    // Click creates a pending assertion at fixedDateNow
    (document.querySelector("button") as HTMLButtonElement).click();

    // Advance past the grace period
    fixedDateNow += 3000;

    // Boost-style nav to a new path
    history.pushState({}, "", "/new-page");

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "feature/do-thing",
            status: "failed",
          }),
        ]),
        expect.any(Object)
      )
    );
  });

  it("does NOT fail fresh assertions (younger than grace period) on URL-path change", async () => {
    document.body.innerHTML = `
      <button fs-assert="feature/do-thing" fs-trigger="click" fs-assert-added=".result">Go</button>
    `;

    cleanupFn = init(config);

    (document.querySelector("button") as HTMLButtonElement).click();

    // Advance by less than grace period
    fixedDateNow += 500;
    history.pushState({}, "", "/new-page");

    // Give microtasks a chance to run
    await vi.advanceTimersByTimeAsync(1);

    const failedCalls = sendToServerMock.mock.calls.filter((call: any[]) =>
      call[0].some(
        (a: any) =>
          a.assertionKey === "feature/do-thing" && a.status === "failed"
      )
    );
    expect(failedCalls).toHaveLength(0);
  });

  it("auto-passes pending invariant on URL-path change", async () => {
    document.body.innerHTML = `
      <nav id="main-nav"
        fs-assert="layout/nav-visible"
        fs-trigger="invariant"
        fs-assert-visible="#main-nav">Nav</nav>
    `;

    cleanupFn = init(config);

    // Invariant is pending (condition holds)
    fixedDateNow += 3000;
    history.pushState({}, "", "/new-page");

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "layout/nav-visible",
            status: "passed",
            trigger: "invariant",
          }),
        ]),
        expect.any(Object)
      )
    );
  });

  it("does NOT flush on same-path pushState (hash/query change)", async () => {
    document.body.innerHTML = `
      <button fs-assert="feature/do-thing" fs-trigger="click" fs-assert-added=".result">Go</button>
    `;

    cleanupFn = init(config);

    (document.querySelector("button") as HTMLButtonElement).click();
    fixedDateNow += 3000;

    // Same-path pushState (e.g., changing query string)
    history.pushState({}, "", "/old-page?tab=settings");

    await vi.advanceTimersByTimeAsync(1);

    const failedCalls = sendToServerMock.mock.calls.filter((call: any[]) =>
      call[0].some(
        (a: any) =>
          a.assertionKey === "feature/do-thing" && a.status === "failed"
      )
    );
    expect(failedCalls).toHaveLength(0);
  });

  it("route assertion still resolves normally on URL-path change (regression)", async () => {
    document.body.innerHTML = `
      <button fs-assert="nav/dashboard" fs-trigger="click" fs-assert-route="/dashboard">Go</button>
    `;

    cleanupFn = init(config);

    (document.querySelector("button") as HTMLButtonElement).click();

    history.pushState({}, "", "/dashboard");

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "nav/dashboard",
            status: "passed",
          }),
        ]),
        expect.any(Object)
      )
    );
  });

  it("reloads MPA assertions from storage on URL-path change", async () => {
    // Pre-seed localStorage as if a prior hard nav stored an MPA assertion
    const mpaAssertion = {
      assertionKey: "flow/step-2",
      type: "added",
      typeValue: ".step-2-result",
      trigger: "mount",
      startTime: fixedDateNow,
      mpa_mode: true,
      timeout: 0,
      modifiers: {},
    };
    localStorage.setItem("faultsense-active-assertions", JSON.stringify([mpaAssertion]));

    document.body.innerHTML = `<div id="host"></div>`;
    cleanupFn = init(config);

    // Initial init calls loadAssertions which clears storage; re-seed.
    localStorage.setItem("faultsense-active-assertions", JSON.stringify([mpaAssertion]));

    // Simulate the next-page DOM present before the virtual nav
    document.body.innerHTML = `<div class="step-2-result">Done</div>`;

    history.pushState({}, "", "/next");

    // The MPA assertion should be re-hydrated and resolve against the new DOM
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "flow/step-2",
            status: "passed",
          }),
        ]),
        expect.any(Object)
      )
    );

    // Storage should be cleared after reload
    expect(localStorage.getItem("faultsense-active-assertions")).toBeNull();
  });
});
