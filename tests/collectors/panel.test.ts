// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApiPayload } from "../../src/types";
import { cleanupPanel } from "../../src/collectors/panel";

// Import triggers self-registration
import "../../src/collectors/panel";

function makePayload(overrides: Partial<ApiPayload> = {}): ApiPayload {
  return {
    assertion_key: "checkout/submit",
    assertion_trigger: "click",
    assertion_type: "added",
    assertion_type_value: ".success-message",
    assertion_type_modifiers: {},
    element_snapshot: "<button>Submit</button>",
    release_label: "dev",
    status: "passed",
    status_reason: "",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function getCollector(): (payload: ApiPayload) => void {
  return window.Faultsense!.collectors!.panel;
}

function getHost(): HTMLElement | null {
  return document.getElementById("fs-panel-host");
}

function getShadowRoot(): ShadowRoot {
  const host = getHost();
  expect(host).not.toBeNull();
  return host!.shadowRoot!;
}

function getPanel(): HTMLElement {
  return getShadowRoot().querySelector(".fs-panel") as HTMLElement;
}

function getRows(): NodeListOf<Element> {
  return getShadowRoot().querySelectorAll(".fs-row");
}

function getBadge(): HTMLElement {
  return getShadowRoot().querySelector(".fs-badge") as HTMLElement;
}

function clickButton(title: string): void {
  const btn = getShadowRoot().querySelector(
    `.fs-btn[title="${title}"]`
  ) as HTMLElement;
  expect(btn).not.toBeNull();
  btn.click();
}

describe("Panel Collector", () => {
  beforeEach(() => {
    cleanupPanel();
  });

  afterEach(() => {
    cleanupPanel();
  });

  describe("self-registration", () => {
    it("should register on window.Faultsense.collectors.panel", () => {
      expect(window.Faultsense).toBeDefined();
      expect(window.Faultsense!.collectors).toBeDefined();
      expect(typeof window.Faultsense!.collectors!.panel).toBe("function");
    });
  });

  describe("lazy panel creation", () => {
    it("should not create panel DOM before first payload", () => {
      expect(getHost()).toBeNull();
    });

    it("should create panel on first payload", () => {
      getCollector()(makePayload());
      expect(getHost()).not.toBeNull();
      expect(getShadowRoot()).toBeDefined();
    });

    it("should create panel inside a Shadow DOM", () => {
      getCollector()(makePayload());
      const host = getHost()!;
      expect(host.shadowRoot).not.toBeNull();
      expect(host.shadowRoot!.mode).toBe("open");
    });

    it("should contain a style element in the shadow root", () => {
      getCollector()(makePayload());
      const style = getShadowRoot().querySelector("style");
      expect(style).not.toBeNull();
      expect(style!.textContent).toContain(".fs-panel");
    });
  });

  describe("row rendering", () => {
    it("should render a row for each payload", () => {
      const collector = getCollector();
      collector(makePayload({ assertion_key: "auth/login" }));
      collector(makePayload({ assertion_key: "checkout/cart" }));
      expect(getRows().length).toBe(2);
    });

    it("should show most recent at top", () => {
      const collector = getCollector();
      collector(makePayload({ assertion_key: "first" }));
      collector(makePayload({ assertion_key: "second" }));

      const rows = getRows();
      const firstKey = rows[0].querySelector(".fs-key")!.textContent;
      expect(firstKey).toBe("second");
    });

    it("should display the assertion key", () => {
      getCollector()(makePayload({ assertion_key: "profile/upload" }));
      const key = getShadowRoot().querySelector(".fs-key")!;
      expect(key.textContent).toBe("profile/upload");
    });

    it("should show status dot with correct class", () => {
      getCollector()(makePayload({ status: "passed" }));
      const dot = getShadowRoot().querySelector(".fs-status-dot")!;
      expect(dot.classList.contains("passed")).toBe(true);
    });

    it("should show failed status", () => {
      getCollector()(makePayload({ status: "failed" }));
      const dot = getShadowRoot().querySelector(".fs-status-dot")!;
      expect(dot.classList.contains("failed")).toBe(true);
    });

    it("should display type and selector in detail", () => {
      getCollector()(
        makePayload({
          assertion_type: "added",
          assertion_type_value: ".success-msg",
        })
      );
      const detail = getShadowRoot().querySelector(".fs-detail")!;
      expect(detail.textContent).toContain("added");
      expect(detail.textContent).toContain(".success-msg");
    });

    it("should display trigger event in detail", () => {
      getCollector()(makePayload({ assertion_trigger: "submit" }));
      const detail = getShadowRoot().querySelector(".fs-detail")!;
      expect(detail.textContent).toContain("submit");
    });

    it("should display modifiers when present", () => {
      getCollector()(
        makePayload({
          assertion_type_modifiers: { "text-matches": "\\d+" } as any,
        })
      );
      const detail = getShadowRoot().querySelector(".fs-detail")!;
      expect(detail.textContent).toContain("text-matches");
    });

    it("should display failure reason when present", () => {
      getCollector()(
        makePayload({
          status: "failed",
          status_reason: "Expected .success to be added within 1000ms",
        })
      );
      const reason = getShadowRoot().querySelector(".fs-reason")!;
      expect(reason).not.toBeNull();
      expect(reason.textContent).toContain(
        "Expected .success to be added within 1000ms"
      );
    });

    it("should not show reason element when no reason", () => {
      getCollector()(makePayload({ status_reason: "" }));
      const reason = getShadowRoot().querySelector(".fs-reason");
      expect(reason).toBeNull();
    });
  });

  describe("minimize and restore", () => {
    it("should hide panel when minimize is clicked", () => {
      getCollector()(makePayload());
      clickButton("Minimize");

      const panel = getPanel();
      expect(panel.classList.contains("hidden")).toBe(true);
    });

    it("should show badge when minimized", () => {
      getCollector()(makePayload());
      clickButton("Minimize");

      const badge = getBadge();
      // Badge is visible but shows 0 new initially
      // It becomes visible with count when new assertions arrive
      expect(badge).not.toBeNull();
    });

    it("should buffer payloads while minimized", () => {
      const collector = getCollector();
      collector(makePayload({ assertion_key: "first" }));
      const initialRows = getRows().length;

      clickButton("Minimize");
      collector(makePayload({ assertion_key: "buffered-1" }));
      collector(makePayload({ assertion_key: "buffered-2" }));

      // Rows should not have increased while minimized
      expect(getRows().length).toBe(initialRows);
    });

    it("should show badge with pass/fail counts while minimized", () => {
      const collector = getCollector();
      collector(makePayload());
      clickButton("Minimize");

      collector(makePayload({ assertion_key: "new-1", status: "passed" }));
      collector(makePayload({ assertion_key: "new-2", status: "failed" }));
      collector(makePayload({ assertion_key: "new-3", status: "passed" }));

      const badge = getBadge();
      expect(badge.textContent).toContain("Faultsense");
      expect(badge.textContent).toContain("2"); // 2 passed
      expect(badge.textContent).toContain("1"); // 1 failed
    });

    it("should flush buffer and restore panel on badge click", () => {
      const collector = getCollector();
      collector(makePayload({ assertion_key: "before" }));
      clickButton("Minimize");

      collector(makePayload({ assertion_key: "buffered" }));
      getBadge().click();

      const panel = getPanel();
      expect(panel.classList.contains("hidden")).toBe(false);
      expect(getRows().length).toBe(2);

      // Badge should be hidden after restore
      expect(getBadge().classList.contains("hidden")).toBe(true);
    });
  });

  describe("cleanup", () => {
    it("should remove all panel DOM", () => {
      getCollector()(makePayload());
      expect(getHost()).not.toBeNull();

      cleanupPanel();
      expect(getHost()).toBeNull();
    });

    it("should allow re-creation after cleanup", () => {
      getCollector()(makePayload({ assertion_key: "first-run" }));
      cleanupPanel();

      getCollector()(makePayload({ assertion_key: "second-run" }));
      expect(getHost()).not.toBeNull();
      expect(getRows().length).toBe(1);

      const key = getShadowRoot().querySelector(".fs-key")!;
      expect(key.textContent).toBe("second-run");
    });
  });
});
