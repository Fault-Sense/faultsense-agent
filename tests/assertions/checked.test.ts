// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Modifier: checked", () => {
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

  it("should pass when checkbox is checked and [checked=true]", async () => {
    document.body.innerHTML = `
      <input id="cb" type="checkbox" />
      <button fs-trigger="click"
        fs-assert-updated='#cb[checked=true]'
        fs-assert="form/checkbox-check">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const cb = document.getElementById("cb") as HTMLInputElement;
      cb.checked = true;
      cb.setAttribute("data-changed", "true");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  it("should fail when checkbox is unchecked and [checked=true]", async () => {
    document.body.innerHTML = `
      <input id="cb" type="checkbox" />
      <button fs-trigger="click"
        fs-assert-updated='#cb[checked=true]'
        fs-assert="form/checkbox-check">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const cb = document.getElementById("cb") as HTMLInputElement;
      cb.checked = false;
      cb.setAttribute("data-changed", "true");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "failed", statusReason: expect.stringContaining("checked") })],
        config
      )
    );
  });

  it("should pass when checkbox is unchecked and [checked=false]", async () => {
    document.body.innerHTML = `
      <input id="cb" type="checkbox" checked />
      <button fs-trigger="click"
        fs-assert-updated='#cb[checked=false]'
        fs-assert="form/checkbox-uncheck">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const cb = document.getElementById("cb") as HTMLInputElement;
      cb.checked = false;
      cb.setAttribute("data-changed", "true");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  it("should fail on non-checkbox elements", async () => {
    document.body.innerHTML = `
      <div id="target">text</div>
      <button fs-trigger="click"
        fs-assert-updated='#target[checked=true]'
        fs-assert="div/checked-check">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("target")!.textContent = "updated";
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "failed" })],
        config
      )
    );
  });
});
