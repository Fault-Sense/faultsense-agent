// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Modifier: focused", () => {
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
    sendToServerMock = vi.spyOn(resolveModule, "sendToCollector").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mock("../../src/utils/elements", () => ({
      isVisible: vi.fn().mockImplementation((element: HTMLElement) => {
        return element.style.display !== "none" && element.style.visibility !== "hidden";
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

  it("should pass when element is focused and [focused=true]", async () => {
    document.body.innerHTML = `
      <input id="target" type="text" />
      <button fs-trigger="click"
        fs-assert-updated='#target[focused=true]'
        fs-assert="form/focus-check">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const target = document.getElementById("target") as HTMLInputElement;
      target.focus();
      // Trigger a DOM mutation so the updated resolver runs
      target.setAttribute("data-focused", "true");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  it("should fail when element is not focused and [focused=true]", async () => {
    document.body.innerHTML = `
      <input id="target" type="text" />
      <input id="other" type="text" />
      <button fs-trigger="click"
        fs-assert-updated='#target[focused=true]'
        fs-assert="form/focus-check">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      (document.getElementById("other") as HTMLInputElement).focus();
      // Mutate target so the resolver evaluates the assertion
      document.getElementById("target")!.setAttribute("data-check", "true");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "failed", statusReason: expect.stringContaining("focused") })],
        config
      )
    );
  });

  it("should pass when element is not focused and [focused=false]", async () => {
    document.body.innerHTML = `
      <input id="target" type="text" />
      <button fs-trigger="click"
        fs-assert-updated='#target[focused=false]'
        fs-assert="form/no-focus-check">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("target")!.setAttribute("data-check", "true");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  // Note: jsdom does not support :focus-within in el.matches(), so this test
  // verifies the modifier evaluates without error and produces the correct
  // failure reason. In a real browser, :focus-within works correctly.
  it("should evaluate focused-within modifier without error", async () => {
    document.body.innerHTML = `
      <div id="container"><input id="child" type="text" /></div>
      <button fs-trigger="click"
        fs-assert-updated='#container[focused-within=true]'
        fs-assert="form/focus-within-check">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      (document.getElementById("child") as HTMLInputElement).focus();
      document.getElementById("container")!.setAttribute("data-check", "true");
    });

    button.click();

    // In jsdom, :focus-within is not supported so this will fail with the
    // correct failure reason rather than throwing an error
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ statusReason: expect.stringContaining("focused-within") })],
        config
      )
    );
  });

  it("should pass with [focused-within=false] when no descendant is focused", async () => {
    document.body.innerHTML = `
      <div id="container"><input id="child" type="text" /></div>
      <button fs-trigger="click"
        fs-assert-updated='#container[focused-within=false]'
        fs-assert="form/no-focus-within">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("container")!.setAttribute("data-check", "true");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });
});
