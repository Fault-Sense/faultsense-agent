// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Modifier: disabled", () => {
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
    vi.mock("../../src/utils/elements", async () => ({ ...await vi.importActual("../../src/utils/elements") as any,
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

  it("should pass when button has native .disabled and [disabled=true]", async () => {
    document.body.innerHTML = `
      <button id="submit-btn">Submit</button>
      <form fs-trigger="submit"
        fs-assert-updated='#submit-btn[disabled=true]'
        fs-assert="form/submit-disable">
        <input type="submit" value="Go" />
      </form>
    `;

    const form = document.querySelector("form") as HTMLFormElement;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const btn = document.getElementById("submit-btn") as HTMLButtonElement;
      btn.disabled = true;
    });

    form.dispatchEvent(new Event("submit", { bubbles: true }));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  it("should pass when element has aria-disabled='true' and [disabled=true]", async () => {
    document.body.innerHTML = `
      <div id="target">Action</div>
      <button fs-trigger="click"
        fs-assert-updated='#target[disabled=true]'
        fs-assert="aria/disabled-check">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("target")!.setAttribute("aria-disabled", "true");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  it("should fail when aria-disabled='false' and [disabled=true]", async () => {
    document.body.innerHTML = `
      <div id="target" aria-disabled="true">Action</div>
      <button fs-trigger="click"
        fs-assert-updated='#target[disabled=true]'
        fs-assert="aria/disabled-check"
        fs-assert-timeout="1000">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("target")!.setAttribute("aria-disabled", "false");
    });

    button.click();

    fixedDateNow += 1001;
    vi.advanceTimersByTime(1000);

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "failed" })],
        config
      )
    );
  });

  it("should pass with [disabled=false] when element is enabled", async () => {
    document.body.innerHTML = `
      <button id="submit-btn" disabled>Submit</button>
      <button fs-trigger="click"
        fs-assert-updated='#submit-btn[disabled=false]'
        fs-assert="form/enable-check">Enable</button>
    `;

    const button = document.querySelector("button:not(#submit-btn)") as HTMLButtonElement;
    button.addEventListener("click", () => {
      (document.getElementById("submit-btn") as HTMLButtonElement).disabled = false;
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
