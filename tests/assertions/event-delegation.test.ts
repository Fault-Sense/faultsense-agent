// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

/**
 * Clicks inside an `fs-trigger` host (icon spans in a button, text in a
 * label, anything non-instrumented within an instrumented parent) must
 * still fire the host's assertion. `event.target` is the innermost node
 * clicked, not the button — the event processor walks up via `closest()`.
 */
describe("Faultsense Agent - Event delegation to fs-trigger host", () => {
  let sendToServerMock: ReturnType<typeof vi.spyOn>;
  let cleanupFn: ReturnType<typeof init>;
  let fixedDateNow = 1230000000000;
  const config = {
    apiKey: "TEST_API_KEY",
    releaseLabel: "0.0.0",
    gcInterval: 30000,
    unloadGracePeriod: 2000,
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
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mock("../../src/utils/elements", async () => ({
      ...(await vi.importActual("../../src/utils/elements") as any),
      isVisible: vi.fn().mockImplementation((element: HTMLElement) =>
        element.style.display !== "none" && element.style.visibility !== "hidden"
      ),
    }));
    cleanupFn = init(config);
  });

  afterEach(() => {
    cleanupFn();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fires when clicking a descendant span of a button with fs-trigger", async () => {
    // Pattern from the Faultsense landing page demo: a fake-checkbox button
    // whose clickable surface is nested spans, not the button itself.
    document.body.innerHTML = `
      <div id="todo-1" data-done="false"></div>
      <button fs-assert="todos/toggle" fs-trigger="click"
        fs-assert-updated="#todo-1[data-done=true]">
        <span class="outer">
          <span class="inner">✓</span>
        </span>
      </button>
    `;

    const inner = document.querySelector(".inner") as HTMLSpanElement;
    inner.addEventListener("click", () => {
      document.getElementById("todo-1")!.setAttribute("data-done", "true");
    });

    // Dispatch the click on the innermost span — event.target is the span,
    // not the button. The event processor must resolve up to the button.
    inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ assertionKey: "todos/toggle", status: "passed" })],
        config
      )
    );
  });

  it("fires when clicking deeply nested content inside the host", async () => {
    document.body.innerHTML = `
      <div id="panel"></div>
      <button fs-assert="panel/open" fs-trigger="click" fs-assert-added="#panel .content">
        <div class="wrapper">
          <div class="middle">
            <i class="icon">★</i>
          </div>
        </div>
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      const content = document.createElement("div");
      content.className = "content";
      document.getElementById("panel")!.appendChild(content);
    });

    const icon = document.querySelector(".icon") as HTMLElement;
    icon.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ assertionKey: "panel/open", status: "passed" })],
        config
      )
    );
  });

  it("resolves to the nearest fs-trigger ancestor when they are nested", async () => {
    // An inner button with its own fs-trigger should win over an outer one.
    document.body.innerHTML = `
      <div id="inner-target"></div>
      <div id="outer-target"></div>
      <div fs-assert="outer/clicked" fs-trigger="click" fs-assert-added="#outer-target .hit">
        <button fs-assert="inner/clicked" fs-trigger="click" fs-assert-added="#inner-target .hit">
          <span class="label">Click me</span>
        </button>
      </div>
    `;

    const innerBtn = document.querySelector("button") as HTMLButtonElement;
    innerBtn.addEventListener("click", () => {
      const hit = document.createElement("div");
      hit.className = "hit";
      document.getElementById("inner-target")!.appendChild(hit);
    });

    const label = document.querySelector(".label") as HTMLSpanElement;
    label.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await vi.waitFor(() =>
      expect(sendToServerMock).toHaveBeenCalledWith(
        [expect.objectContaining({ assertionKey: "inner/clicked", status: "passed" })],
        config
      )
    );
    // The outer assertion is not fired — only one host was resolved.
    const calls = sendToServerMock.mock.calls.flatMap((c: any[]) => c[0]);
    expect(calls.find((c: any) => c.assertionKey === "outer/clicked")).toBeUndefined();
  });

  it("does nothing when no ancestor has fs-trigger", async () => {
    document.body.innerHTML = `
      <div><span class="target">hello</span></div>
    `;
    const span = document.querySelector(".target") as HTMLSpanElement;
    span.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // Nothing to fire, nothing to enqueue.
    expect(sendToServerMock).not.toHaveBeenCalled();
  });
});
