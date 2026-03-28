// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Modifier: count", () => {
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

  it("should pass when exact count matches [count=3]", async () => {
    document.body.innerHTML = `
      <ul id="list">
        <li class="item">One</li>
        <li class="item">Two</li>
      </ul>
      <button fs-trigger="click"
        fs-assert-added='.item[count=3]'
        fs-assert="list/count-check">Add Item</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const li = document.createElement("li");
      li.className = "item";
      li.textContent = "Three";
      document.getElementById("list")!.appendChild(li);
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  it("should fail when exact count does not match [count=3]", async () => {
    document.body.innerHTML = `
      <ul id="list">
        <li class="item">One</li>
      </ul>
      <button fs-trigger="click"
        fs-assert-added='.item[count=3]'
        fs-assert="list/count-check">Add Item</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const li = document.createElement("li");
      li.className = "item";
      li.textContent = "Two";
      document.getElementById("list")!.appendChild(li);
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          status: "failed",
          statusReason: expect.stringContaining("count does not match"),
        })],
        config
      )
    );
  });

  it("should pass with count-min when enough elements exist", async () => {
    document.body.innerHTML = `
      <ul id="list">
        <li class="item">One</li>
        <li class="item">Two</li>
      </ul>
      <button fs-trigger="click"
        fs-assert-added='.item[count-min=2]'
        fs-assert="list/min-check">Add Item</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const li = document.createElement("li");
      li.className = "item";
      li.textContent = "Three";
      document.getElementById("list")!.appendChild(li);
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  it("should fail with count-min when too few elements", async () => {
    document.body.innerHTML = `
      <ul id="list"></ul>
      <button fs-trigger="click"
        fs-assert-added='.item[count-min=3]'
        fs-assert="list/min-check">Add Item</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const li = document.createElement("li");
      li.className = "item";
      li.textContent = "One";
      document.getElementById("list")!.appendChild(li);
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({
          status: "failed",
          statusReason: expect.stringContaining("count below minimum"),
        })],
        config
      )
    );
  });

  it("should pass with count-max when within range", async () => {
    document.body.innerHTML = `
      <ul id="list">
        <li class="item">One</li>
      </ul>
      <button fs-trigger="click"
        fs-assert-added='.item[count-max=3]'
        fs-assert="list/max-check">Add Item</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const li = document.createElement("li");
      li.className = "item";
      li.textContent = "Two";
      document.getElementById("list")!.appendChild(li);
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  it("should work with count combined with per-element modifiers", async () => {
    document.body.innerHTML = `
      <ul id="list">
        <li class="item">Alpha</li>
        <li class="item">Beta</li>
      </ul>
      <button fs-trigger="click"
        fs-assert-added='.item[count=3][text-matches=Gamma]'
        fs-assert="list/combined-check">Add Item</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const li = document.createElement("li");
      li.className = "item";
      li.textContent = "Gamma";
      document.getElementById("list")!.appendChild(li);
    });

    button.click();

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        config
      )
    );
  });

  it("should warn on self-referencing count", async () => {
    const warnMock = vi.spyOn(console, "warn").mockImplementation(() => {});

    document.body.innerHTML = `
      <div fs-trigger="click"
        fs-assert-updated='[count=1]'
        fs-assert="self/count-check">Click</div>
    `;

    const div = document.querySelector("div") as HTMLDivElement;
    div.click();

    await vi.waitFor(() =>
      expect(warnMock).toHaveBeenCalledWith(
        expect.stringContaining("Count modifier on self-referencing assertion")
      )
    );
  });
});
