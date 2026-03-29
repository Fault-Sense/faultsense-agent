// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Assertion Type: route", () => {
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

  // Store originals so we can restore after each test
  let originalPushState: typeof history.pushState;
  let originalReplaceState: typeof history.replaceState;

  beforeEach(() => {
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;

    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);

    sendToServerMock = vi
      .spyOn(resolveModule, "sendToCollector")
      .mockImplementation(() => {});

    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnMock = vi.spyOn(console, "warn").mockImplementation(() => {});

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

    // Restore original History API methods
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  });

  describe("SPA resolution", () => {
    it("route assertion passes on pushState to matching path", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/dashboard" fs-assert="nav/dashboard">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      history.pushState({}, "", "/dashboard");

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              status: "passed",
              type: "route",
              typeValue: "/dashboard",
            }),
          ],
          config
        )
      );
    });

    it("route assertion stays pending on pushState to non-matching path", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/dashboard" fs-assert="nav/dashboard">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      history.pushState({}, "", "/wrong");

      // Advance a bit and confirm no resolution
      await vi.advanceTimersByTimeAsync(100);
      expect(sendToServerMock).not.toHaveBeenCalled();
    });

    it("matches dynamic segments with regex", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/users/\\d+" fs-assert="nav/user-profile">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      history.pushState({}, "", "/users/42");

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              status: "passed",
              type: "route",
            }),
          ],
          config
        )
      );
    });

    it("anchored regex prevents partial matches", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/dash" fs-assert="nav/dash">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      history.pushState({}, "", "/dashboard");

      // Should NOT match — /dash does not match /dashboard with anchored regex
      await vi.advanceTimersByTimeAsync(100);
      expect(sendToServerMock).not.toHaveBeenCalled();
    });

    it("replaceState triggers route resolution", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/settings" fs-assert="nav/settings">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      history.replaceState({}, "", "/settings");

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              status: "passed",
              type: "route",
              typeValue: "/settings",
            }),
          ],
          config
        )
      );
    });

    it("popstate triggers route resolution", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/previous" fs-assert="nav/back">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      // Simulate popstate by changing URL and dispatching event
      history.pushState({}, "", "/previous");

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              status: "passed",
              type: "route",
            }),
          ],
          config
        )
      );
    });

    it("resolves immediately if URL already matches on creation", async () => {
      // Set the current URL to /dashboard before creating the assertion
      history.pushState({}, "", "/dashboard");

      document.body.innerHTML = `
        <div fs-trigger="mount" fs-assert-route="/dashboard" fs-assert="nav/already-here"></div>
      `;

      // Re-init to process mount triggers
      cleanupFn();
      cleanupFn = init(config);

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              status: "passed",
              type: "route",
              typeValue: "/dashboard",
            }),
          ],
          config
        )
      );
    });
  });

  describe("URL pattern matching", () => {
    it("query param matches with regex value", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/callback?code=.*" fs-assert="auth/oauth">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      history.pushState({}, "", "/callback?code=abc123");

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              status: "passed",
              type: "route",
            }),
          ],
          config
        )
      );
    });

    it("query param with exact value match", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/users?role=admin" fs-assert="nav/admin">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      // Wrong value — should not match
      history.pushState({}, "", "/users?role=viewer");
      await vi.advanceTimersByTimeAsync(100);
      expect(sendToServerMock).not.toHaveBeenCalled();

      // Correct value
      history.pushState({}, "", "/users?role=admin");

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              status: "passed",
              type: "route",
            }),
          ],
          config
        )
      );
    });

    it("query param order does not matter", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/search?q=test&amp;page=\\d+" fs-assert="nav/search">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      // Params in reverse order — should still match
      history.pushState({}, "", "/search?page=3&q=test");

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              status: "passed",
              type: "route",
            }),
          ],
          config
        )
      );
    });

    it("missing required query param does not match", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/callback?code=.*" fs-assert="auth/missing-param">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      // No query params at all
      history.pushState({}, "", "/callback");

      await vi.advanceTimersByTimeAsync(100);
      expect(sendToServerMock).not.toHaveBeenCalled();
    });

    it("hash pattern matches (anchored)", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/docs#section-\\d+" fs-assert="nav/docs-section">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      history.pushState({}, "", "/docs#section-2");

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              status: "passed",
              type: "route",
            }),
          ],
          config
        )
      );
    });

    it("path + query + hash combined: all must match", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/page?tab=settings#panel" fs-assert="nav/page">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      // Only path + search, no hash — should NOT pass
      history.pushState({}, "", "/page?tab=settings");

      await vi.advanceTimersByTimeAsync(100);
      expect(sendToServerMock).not.toHaveBeenCalled();

      // Now navigate with all three
      history.pushState({}, "", "/page?tab=settings#panel");

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              status: "passed",
              type: "route",
            }),
          ],
          config
        )
      );
    });

    it("DOM modifier on route produces console warning", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/dashboard[text-matches=foo]" fs-assert="nav/bad-mod">Go</button>
      `;

      // Re-init to process the element
      cleanupFn();
      cleanupFn = init(config);

      // Click to trigger element processing (click triggers aren't processed at init)
      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      expect(consoleWarnMock).toHaveBeenCalledWith(
        expect.stringContaining('Modifier "text-matches" does not apply to "route" assertions')
      );
    });
  });

  describe("Conditionals", () => {
    it("route conditionals: first to match wins, other dismissed", async () => {
      document.body.innerHTML = `
        <button
          fs-trigger="click"
          fs-assert="auth/login"
          fs-assert-route-success="/dashboard"
          fs-assert-route-error="/login">Login</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      history.pushState({}, "", "/dashboard");

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              status: "passed",
              conditionKey: "success",
              type: "route",
            }),
          ],
          config
        )
      );

      // Only one call — error sibling was dismissed, not sent
      expect(sendToServerMock).toHaveBeenCalledTimes(1);
    });

    it("cross-type grouped: route pass dismisses DOM sibling", async () => {
      document.body.innerHTML = `
        <button
          fs-trigger="click"
          fs-assert="auth/login"
          fs-assert-mutex="each"
          fs-assert-route-success="/dashboard"
          fs-assert-added-error=".error-msg">Login</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      history.pushState({}, "", "/dashboard");

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              status: "passed",
              conditionKey: "success",
              type: "route",
            }),
          ],
          config
        )
      );

      // Only one call — the added-error sibling was dismissed
      expect(sendToServerMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("MPA", () => {
    it("route assertion with mpa persists to localStorage", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/dashboard" fs-assert="nav/mpa" fs-assert-mpa="true">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      const stored = localStorage.getItem("faultsense-active-assertions");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "route",
            typeValue: "/dashboard",
            mpa_mode: true,
          }),
        ])
      );
    });

    it("stored route assertion resolves against current pathname on page load", async () => {
      // Set the current URL
      history.pushState({}, "", "/dashboard");

      // Simulate a stored assertion from previous page
      localStorage.setItem(
        "faultsense-active-assertions",
        JSON.stringify([
          {
            assertionKey: "nav/mpa",
            elementSnapshot: "<button>Go</button>",
            mpa_mode: true,
            trigger: "click",
            timeout: 0,
            startTime: fixedDateNow - 100,
            type: "route",
            typeValue: "/dashboard",
            modifiers: {},
          },
        ])
      );

      // Re-init to load stored assertions and run checkAssertions
      cleanupFn();
      cleanupFn = init(config);

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              status: "passed",
              type: "route",
              typeValue: "/dashboard",
            }),
          ],
          config
        )
      );
    });
  });

  describe("Timeouts", () => {
    it("SLA timeout: route fails with message when URL doesn't match in time", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/dashboard" fs-assert="nav/timeout" fs-assert-timeout="2000">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      // No navigation happens — advance past the SLA timeout
      fixedDateNow += 2001;
      vi.advanceTimersByTime(2000);

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
    });

    it("GC sweep cleans up stale route assertion without explicit timeout", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/dashboard" fs-assert="nav/gc">Go</button>
      `;

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      // Advance past GC interval
      fixedDateNow += 31000;
      vi.advanceTimersByTime(30000);

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
    });
  });

  describe("Validation", () => {
    it("invalid regex pattern produces console warning and is skipped", async () => {
      // Use (unclosed as an invalid regex — parseTypeValue won't consume parens
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="/users/(unclosed" fs-assert="nav/bad-regex">Go</button>
      `;

      // Re-init to process the element
      cleanupFn();
      cleanupFn = init(config);

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      expect(consoleWarnMock).toHaveBeenCalledWith(
        expect.stringContaining('Invalid route pattern')
      );

      // Should not create any assertions for this element
      await vi.advanceTimersByTimeAsync(100);
      expect(sendToServerMock).not.toHaveBeenCalled();
    });

    it("empty typeValue produces warning and is skipped", async () => {
      document.body.innerHTML = `
        <button fs-trigger="click" fs-assert-route="" fs-assert="nav/empty-route">Go</button>
      `;

      cleanupFn();
      cleanupFn = init(config);

      const button = document.querySelector("button") as HTMLButtonElement;
      button.click();

      expect(consoleWarnMock).toHaveBeenCalledWith(
        expect.stringContaining('has no pattern')
      );
    });
  });
});
