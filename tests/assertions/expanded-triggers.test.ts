// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Expanded Triggers", () => {
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

  describe("hover trigger (mouseenter)", () => {
    it("creates assertion on mouseenter event", async () => {
      document.body.innerHTML = `
        <div id="tooltip-trigger"
          fs-trigger="hover"
          fs-assert="ui/tooltip-shown"
          fs-assert-added="#tooltip">Hover me</div>
      `;

      const trigger = document.getElementById("tooltip-trigger")!;

      // Simulate hover, then add the tooltip element
      trigger.dispatchEvent(new Event("mouseenter", { bubbles: true }));

      const tooltip = document.createElement("div");
      tooltip.id = "tooltip";
      document.body.appendChild(tooltip);

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              assertionKey: "ui/tooltip-shown",
              status: "passed",
            }),
          ],
          config
        )
      );
    });

    it("also works with direct mouseenter trigger", async () => {
      document.body.innerHTML = `
        <div id="hover-direct"
          fs-trigger="mouseenter"
          fs-assert="ui/hover-direct"
          fs-assert-added="#result">Hover</div>
      `;

      const trigger = document.getElementById("hover-direct")!;
      trigger.dispatchEvent(new Event("mouseenter", { bubbles: true }));

      const result = document.createElement("div");
      result.id = "result";
      document.body.appendChild(result);

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              assertionKey: "ui/hover-direct",
              status: "passed",
            }),
          ],
          config
        )
      );
    });
  });

  describe("focus trigger (focusin)", () => {
    it("creates assertion on focusin event", async () => {
      document.body.innerHTML = `
        <input id="search-input"
          fs-trigger="focus"
          fs-assert="ui/autocomplete-shown"
          fs-assert-added="#autocomplete-dropdown" />
      `;

      const input = document.getElementById("search-input")!;
      input.dispatchEvent(new Event("focusin", { bubbles: true }));

      const dropdown = document.createElement("div");
      dropdown.id = "autocomplete-dropdown";
      document.body.appendChild(dropdown);

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              assertionKey: "ui/autocomplete-shown",
              status: "passed",
            }),
          ],
          config
        )
      );
    });
  });

  describe("input trigger", () => {
    it("creates assertion on input event", async () => {
      document.body.innerHTML = `
        <input id="char-input"
          fs-trigger="input"
          fs-assert="form/char-count-updated"
          fs-assert-visible="#char-count" />
        <span id="char-count">5/100</span>
      `;

      const input = document.getElementById("char-input")!;
      input.dispatchEvent(new Event("input", { bubbles: true }));

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              assertionKey: "form/char-count-updated",
              status: "passed",
            }),
          ],
          config
        )
      );
    });
  });

  describe("keydown trigger", () => {
    it("unfiltered keydown creates assertion on any key", async () => {
      document.body.innerHTML = `
        <div id="shortcut-target"
          fs-trigger="keydown"
          fs-assert="ui/key-pressed"
          fs-assert-visible="#shortcut-target">Target</div>
      `;

      const target = document.getElementById("shortcut-target")!;
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              assertionKey: "ui/key-pressed",
              status: "passed",
            }),
          ],
          config
        )
      );
    });

    it("keydown:Escape creates assertion only when Escape is pressed", async () => {
      document.body.innerHTML = `
        <div id="modal"
          fs-trigger="keydown:Escape"
          fs-assert="ui/modal-closed"
          fs-assert-removed="#modal">Modal</div>
      `;

      const modal = document.getElementById("modal")!;

      // Wrong key — should NOT create assertion
      modal.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

      // Advance time to ensure no assertion was created
      vi.advanceTimersByTime(100);
      expect(sendToServerMock).not.toHaveBeenCalled();

      // Correct key — should create assertion
      modal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

      // Remove the modal to resolve the assertion
      modal.remove();

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              assertionKey: "ui/modal-closed",
              status: "passed",
            }),
          ],
          config
        )
      );
    });

    it("keydown:ctrl+s creates assertion only with correct modifier", async () => {
      document.body.innerHTML = `
        <div id="editor"
          fs-trigger="keydown:ctrl+s"
          fs-assert="editor/save"
          fs-assert-visible="#save-indicator">Editor</div>
        <div id="save-indicator">Saved</div>
      `;

      const editor = document.getElementById("editor")!;

      // s without ctrl — should NOT match
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }));
      vi.advanceTimersByTime(100);
      expect(sendToServerMock).not.toHaveBeenCalled();

      // ctrl+s — should match
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              assertionKey: "editor/save",
              status: "passed",
            }),
          ],
          config
        )
      );
    });

    it("full trigger value is preserved on the assertion", async () => {
      document.body.innerHTML = `
        <div id="target"
          fs-trigger="keydown:Escape"
          fs-assert="ui/escape-pressed"
          fs-assert-visible="#target">Target</div>
      `;

      const target = document.getElementById("target")!;
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              assertionKey: "ui/escape-pressed",
              trigger: "keydown:Escape",
            }),
          ],
          config
        )
      );
    });
  });

  describe("re-trigger re-evaluation", () => {
    it("pending assertion resolves on re-trigger when condition is now met", async () => {
      document.body.innerHTML = `
        <button id="btn"
          fs-trigger="click"
          fs-assert="ui/panel-added"
          fs-assert-added="#panel">Click</button>
      `;

      const btn = document.getElementById("btn")!;

      // First click — creates assertion, but panel doesn't exist yet
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      vi.advanceTimersByTime(100);

      // Panel doesn't exist yet, assertion should still be pending
      expect(sendToServerMock).not.toHaveBeenCalled();

      // Now add the panel
      const panel = document.createElement("div");
      panel.id = "panel";
      document.body.appendChild(panel);

      // Second click — re-trigger, should re-evaluate and find the panel
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      await vi.waitFor(() =>
        expect(sendToServerMock).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              assertionKey: "ui/panel-added",
              status: "passed",
            }),
          ],
          config
        )
      );
    });
  });

  describe("config derivation", () => {
    it("eventTriggerAliases maps mouseenter to hover", async () => {
      const { eventTriggerAliases } = await import("../../src/config");
      expect(eventTriggerAliases["mouseenter"]).toContain("mouseenter");
      expect(eventTriggerAliases["mouseenter"]).toContain("hover");
    });

    it("eventTriggerAliases maps focusin to focus", async () => {
      const { eventTriggerAliases } = await import("../../src/config");
      expect(eventTriggerAliases["focusin"]).toContain("focusin");
      expect(eventTriggerAliases["focusin"]).toContain("focus");
    });

    it("supportedTriggers includes all new trigger names", async () => {
      const { supportedTriggers } = await import("../../src/config");
      expect(supportedTriggers).toContain("hover");
      expect(supportedTriggers).toContain("focus");
      expect(supportedTriggers).toContain("keydown");
      expect(supportedTriggers).toContain("input");
      expect(supportedTriggers).toContain("mouseenter");
      expect(supportedTriggers).toContain("focusin");
    });
  });
});
