// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Modifier: value-matches", () => {
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

  it("should pass when input value matches the pattern", async () => {
    document.body.innerHTML = `
      <input id="search" type="text" value="" />
      <button fs-trigger="click"
        fs-assert-updated='#search[value-matches=hello]'
        fs-assert="search/value-check">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const input = document.getElementById("search") as HTMLInputElement;
      input.value = "hello world";
      input.setAttribute("data-changed", "true"); // trigger a mutation
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  it("should fail when input value does not match the pattern", async () => {
    document.body.innerHTML = `
      <input id="search" type="text" value="" />
      <button fs-trigger="click"
        fs-assert-updated='#search[value-matches=^\\d+$]'
        fs-assert="search/value-check">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const input = document.getElementById("search") as HTMLInputElement;
      input.value = "not-a-number";
      input.setAttribute("data-changed", "true");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "failed" })],
        config
      )
    );
  });

  it("should fail on non-form elements (no .value property)", async () => {
    document.body.innerHTML = `
      <div id="target">some text</div>
      <button fs-trigger="click"
        fs-assert-updated='#target[value-matches=hello]'
        fs-assert="div/value-check">Click</button>
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

  it("should read select element's selected option value", async () => {
    document.body.innerHTML = `
      <select id="sel">
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </select>
      <button fs-trigger="click"
        fs-assert-updated='#sel[value-matches=^b$]'
        fs-assert="select/value-check">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const sel = document.getElementById("sel") as HTMLSelectElement;
      sel.value = "b";
      sel.setAttribute("data-changed", "true");
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  it("should read textarea content", async () => {
    document.body.innerHTML = `
      <textarea id="ta"></textarea>
      <button fs-trigger="click"
        fs-assert-updated='#ta[value-matches=.{3,}]'
        fs-assert="textarea/value-check">Click</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const ta = document.getElementById("ta") as HTMLTextAreaElement;
      ta.value = "hello";
      ta.setAttribute("data-changed", "true");
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
