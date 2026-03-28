// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Multi-Step Sequence Assertions", () => {
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

  it("after assertion passes when parent has already passed", async () => {
    // Step 1: parent assertion that will pass immediately
    document.body.innerHTML = `
      <div id="step1"
        fs-trigger="click"
        fs-assert="checkout/add-to-cart"
        fs-assert-visible="#step1">Step 1</div>
    `;

    const step1 = document.getElementById("step1")!;
    step1.click();

    // Wait for parent to resolve
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ assertionKey: "checkout/add-to-cart", status: "passed" })],
        config
      )
    );

    // Step 2: child assertion with after dependency
    const step2 = document.createElement("button");
    step2.id = "step2";
    step2.textContent = "Step 2";
    step2.setAttribute("fs-trigger", "click");
    step2.setAttribute("fs-assert", "checkout/submit-payment");
    step2.setAttribute("fs-assert-after", "checkout/add-to-cart");
    step2.setAttribute("fs-assert-visible", "#step2");
    document.body.appendChild(step2);

    step2.click();

    // Both the after assertion and the visible assertion should pass
    await vi.waitFor(() => {
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          assertionKey: "checkout/submit-payment",
          type: "after",
          status: "passed",
        })],
        config
      );
    });
  });

  it("after assertion fails when parent has not passed", async () => {
    document.body.innerHTML = `
      <button id="step2"
        fs-trigger="click"
        fs-assert="checkout/submit-payment"
        fs-assert-after="checkout/add-to-cart"
        fs-assert-visible="#step2">Step 2</button>
    `;

    const step2 = document.getElementById("step2")!;
    step2.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          assertionKey: "checkout/submit-payment",
          type: "after",
          status: "failed",
          statusReason: 'Precondition not met: "checkout/add-to-cart" has not passed.',
        })],
        config
      )
    );
  });

  it("produces two independent data points from one trigger", async () => {
    document.body.innerHTML = `
      <button id="btn"
        fs-trigger="click"
        fs-assert="flow/step-B"
        fs-assert-after="flow/step-A"
        fs-assert-visible="#btn">Step B</button>
    `;

    const btn = document.getElementById("btn")!;
    btn.click();

    // After should fail (no parent), visible should pass (element exists)
    await vi.waitFor(() => {
      // after assertion fails
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          assertionKey: "flow/step-B",
          type: "after",
          status: "failed",
        })],
        config
      );
      // visible assertion passes independently
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          assertionKey: "flow/step-B",
          type: "visible",
          status: "passed",
        })],
        config
      );
    });
  });

  it("after assertion resolves immediately via checkImmediateResolved", async () => {
    // Set up parent that passes on mount
    document.body.innerHTML = `
      <div id="parent"
        fs-trigger="mount"
        fs-assert="step/A"
        fs-assert-visible="#parent">Parent</div>
    `;

    // Re-init to process mount triggers
    cleanupFn();
    cleanupFn = init(config);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ assertionKey: "step/A", status: "passed" })],
        config
      )
    );

    // Now add step B that depends on step A
    const stepB = document.createElement("button");
    stepB.id = "step-b";
    stepB.textContent = "Step B";
    stepB.setAttribute("fs-trigger", "click");
    stepB.setAttribute("fs-assert", "step/B");
    stepB.setAttribute("fs-assert-after", "step/A");
    document.body.appendChild(stepB);

    stepB.click();

    // Should resolve immediately (same microtask via checkImmediateResolved)
    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          assertionKey: "step/B",
          type: "after",
          status: "passed",
        })],
        config
      )
    );
  });
});
