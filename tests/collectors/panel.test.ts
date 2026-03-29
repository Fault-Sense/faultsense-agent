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

// X-Ray helpers

function getXrayHost(): HTMLElement | null {
  return document.getElementById("fs-xray-host");
}

function getXrayShadowRoot(): ShadowRoot | null {
  const host = getXrayHost();
  return host?.shadowRoot ?? null;
}

function getXrayDots(): NodeListOf<Element> {
  const sr = getXrayShadowRoot();
  if (!sr) return document.querySelectorAll(".nonexistent");
  return sr.querySelectorAll(".fs-xray-dot");
}

function getXrayToggle(): HTMLElement {
  return getShadowRoot().querySelector(".fs-xray-toggle") as HTMLElement;
}

function getTabs(): NodeListOf<Element> {
  return getShadowRoot().querySelectorAll(".fs-tab");
}

function getActiveTab(): HTMLElement {
  return getShadowRoot().querySelector(".fs-tab.active") as HTMLElement;
}

function getTabContent(name: string): HTMLElement {
  return getShadowRoot().querySelector(
    `.fs-tab-content[data-tab="${name}"]`
  ) as HTMLElement;
}

function createInstrumentedElement(attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("fs-assert", attrs["fs-assert"] || "test/assertion");
  el.setAttribute("fs-trigger", attrs["fs-trigger"] || "click");
  for (const [k, v] of Object.entries(attrs)) {
    if (k !== "fs-assert" && k !== "fs-trigger") {
      el.setAttribute(k, v);
    }
  }
  // Give it dimensions so it's not zero-size
  Object.defineProperty(el, "getBoundingClientRect", {
    value: () => ({
      width: 100, height: 40, top: 50, left: 50, bottom: 90, right: 150, x: 50, y: 50,
      toJSON: () => {},
    }),
  });
  document.body.appendChild(el);
  return el;
}

describe("Panel Collector", () => {
  beforeEach(() => {
    cleanupPanel();
  });

  afterEach(() => {
    cleanupPanel();
    // Clean up any instrumented elements
    document.querySelectorAll("[fs-assert]").forEach((el) => el.remove());
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

    it("should display error context when present", () => {
      getCollector()(
        makePayload({
          status: "failed",
          error_context: { message: "ReferenceError: foo is not defined" },
        })
      );
      const errorCtx = getShadowRoot().querySelector(".fs-error-context")!;
      expect(errorCtx).not.toBeNull();
      expect(errorCtx.textContent).toContain("ReferenceError: foo is not defined");
    });

    it("should not show error context element when absent", () => {
      getCollector()(makePayload({}));
      const errorCtx = getShadowRoot().querySelector(".fs-error-context");
      expect(errorCtx).toBeNull();
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

  describe("tab layout", () => {
    it("should show Stream and X-Ray tabs", () => {
      getCollector()(makePayload());
      const tabs = getTabs();
      expect(tabs.length).toBe(2);
      expect(tabs[0].textContent).toBe("Stream");
      expect(tabs[1].textContent).toBe("X-Ray");
    });

    it("should default to Stream tab active", () => {
      getCollector()(makePayload());
      const active = getActiveTab();
      expect(active.dataset.tab).toBe("stream");
    });

    it("should switch tab content on click", () => {
      getCollector()(makePayload());
      const xrayTab = getShadowRoot().querySelector('.fs-tab[data-tab="xray"]') as HTMLElement;
      xrayTab.click();

      expect(getTabContent("stream").classList.contains("hidden")).toBe(true);
      expect(getTabContent("xray").classList.contains("hidden")).toBe(false);

      const streamTab = getShadowRoot().querySelector('.fs-tab[data-tab="stream"]') as HTMLElement;
      streamTab.click();

      expect(getTabContent("stream").classList.contains("hidden")).toBe(false);
      expect(getTabContent("xray").classList.contains("hidden")).toBe(true);
    });

    it("should render assertion rows in Stream tab", () => {
      const collector = getCollector();
      collector(makePayload({ assertion_key: "auth/login" }));
      collector(makePayload({ assertion_key: "checkout/cart" }));
      expect(getRows().length).toBe(2);

      // Rows are inside the stream tab content
      const streamContent = getTabContent("stream");
      expect(streamContent.querySelectorAll(".fs-row").length).toBe(2);
    });
  });

  describe("X-Ray toggle", () => {
    it("should add toggle button to toolbar", () => {
      getCollector()(makePayload());
      const toggle = getXrayToggle();
      expect(toggle).not.toBeNull();
      expect(toggle.title).toBe("X-Ray");
    });

    it("should default to inactive", () => {
      getCollector()(makePayload());
      const toggle = getXrayToggle();
      expect(toggle.classList.contains("active")).toBe(false);
    });

    it("should toggle xray state on click", () => {
      getCollector()(makePayload());
      const toggle = getXrayToggle();
      toggle.click();
      expect(toggle.classList.contains("active")).toBe(true);

      toggle.click();
      expect(toggle.classList.contains("active")).toBe(false);
    });

    it("should show active style when on", () => {
      getCollector()(makePayload());
      const toggle = getXrayToggle();
      toggle.click();
      expect(toggle.classList.contains("active")).toBe(true);
    });

    it("should not switch active tab when toggled", () => {
      getCollector()(makePayload());
      expect(getActiveTab().dataset.tab).toBe("stream");

      getXrayToggle().click();
      expect(getActiveTab().dataset.tab).toBe("stream");
    });
  });

  describe("X-Ray tab states", () => {
    it("should show empty state with enable button when X-Ray off", () => {
      getCollector()(makePayload());
      // Switch to X-Ray tab
      (getShadowRoot().querySelector('.fs-tab[data-tab="xray"]') as HTMLElement).click();

      const xrayContent = getTabContent("xray");
      expect(xrayContent.textContent).toContain("Enable X-Ray");
      expect(xrayContent.querySelector(".fs-empty-btn")).not.toBeNull();
    });

    it("should activate X-Ray when empty state button clicked", () => {
      getCollector()(makePayload());
      (getShadowRoot().querySelector('.fs-tab[data-tab="xray"]') as HTMLElement).click();

      const btn = getTabContent("xray").querySelector(".fs-empty-btn") as HTMLElement;
      btn.click();

      expect(getXrayToggle().classList.contains("active")).toBe(true);
      // X-Ray tab should now show the hover prompt
      expect(getTabContent("xray").textContent).toContain("Hover an element");
    });

    it("should show prompt text when X-Ray on and not hovering", () => {
      getCollector()(makePayload());
      getXrayToggle().click();
      (getShadowRoot().querySelector('.fs-tab[data-tab="xray"]') as HTMLElement).click();

      expect(getTabContent("xray").textContent).toContain("Hover an element to inspect its assertions");
    });
  });

  describe("dot overlay", () => {
    it("should create xray host when X-Ray enabled", () => {
      getCollector()(makePayload());
      expect(getXrayHost()).toBeNull();

      getXrayToggle().click();
      expect(getXrayHost()).not.toBeNull();
      expect(getXrayShadowRoot()).not.toBeNull();
    });

    it("should add dots for elements with fs-assert attribute", () => {
      getCollector()(makePayload());
      createInstrumentedElement();
      createInstrumentedElement({ "fs-assert": "checkout/submit" });

      getXrayToggle().click();
      expect(getXrayDots().length).toBe(2);
    });

    it("should remove xray host when X-Ray disabled", () => {
      getCollector()(makePayload());
      getXrayToggle().click();
      expect(getXrayHost()).not.toBeNull();

      getXrayToggle().click();
      expect(getXrayHost()).toBeNull();
    });

    it("should update dots when elements added to DOM", async () => {
      getCollector()(makePayload());
      getXrayToggle().click();
      expect(getXrayDots().length).toBe(0);

      createInstrumentedElement();
      // MutationObserver is async, wait for microtask
      await new Promise((r) => setTimeout(r, 0));

      expect(getXrayDots().length).toBe(1);
    });

    it("should remove dots when elements removed from DOM", async () => {
      getCollector()(makePayload());
      const el = createInstrumentedElement();
      getXrayToggle().click();
      expect(getXrayDots().length).toBe(1);

      el.remove();
      await new Promise((r) => setTimeout(r, 0));

      expect(getXrayDots().length).toBe(0);
    });
  });

  describe("hover-to-inspect", () => {
    it("should show detail card on dot mouseenter", () => {
      getCollector()(makePayload());
      createInstrumentedElement({
        "fs-assert": "checkout/submit",
        "fs-trigger": "click",
        "fs-assert-added": ".success",
      });

      getXrayToggle().click();
      (getShadowRoot().querySelector('.fs-tab[data-tab="xray"]') as HTMLElement).click();

      const dot = getXrayDots()[0] as HTMLElement;
      dot.dispatchEvent(new MouseEvent("mouseenter"));

      const card = getTabContent("xray").querySelector(".fs-xray-card");
      expect(card).not.toBeNull();
    });

    it("should show element tag and id in card", () => {
      getCollector()(makePayload());
      const el = createInstrumentedElement({ "fs-assert": "test/el" });
      el.id = "my-btn";

      getXrayToggle().click();
      (getShadowRoot().querySelector('.fs-tab[data-tab="xray"]') as HTMLElement).click();

      const dot = getXrayDots()[0] as HTMLElement;
      dot.dispatchEvent(new MouseEvent("mouseenter"));

      const elementLabel = getTabContent("xray").querySelector(".fs-xray-element");
      expect(elementLabel).not.toBeNull();
      expect(elementLabel!.textContent).toContain("div");
      expect(elementLabel!.textContent).toContain("my-btn");
    });

    it("should list all fs-* attributes", () => {
      getCollector()(makePayload());
      createInstrumentedElement({
        "fs-assert": "checkout/submit",
        "fs-trigger": "click",
        "fs-assert-added": ".success",
        "fs-assert-timeout": "2000",
      });

      getXrayToggle().click();
      (getShadowRoot().querySelector('.fs-tab[data-tab="xray"]') as HTMLElement).click();

      const dot = getXrayDots()[0] as HTMLElement;
      dot.dispatchEvent(new MouseEvent("mouseenter"));

      const attrNames = getTabContent("xray").querySelectorAll(".fs-xray-attr-name");
      const names = Array.from(attrNames).map((n) => n.textContent);
      expect(names).toContain("fs-assert");
      expect(names).toContain("fs-trigger");
      expect(names).toContain("fs-assert-added");
      expect(names).toContain("fs-assert-timeout");
    });

    it("should clear card on dot mouseleave", () => {
      getCollector()(makePayload());
      createInstrumentedElement();

      getXrayToggle().click();
      (getShadowRoot().querySelector('.fs-tab[data-tab="xray"]') as HTMLElement).click();

      const dot = getXrayDots()[0] as HTMLElement;
      dot.dispatchEvent(new MouseEvent("mouseenter"));
      expect(getTabContent("xray").querySelector(".fs-xray-card")).not.toBeNull();

      dot.dispatchEvent(new MouseEvent("mouseleave"));
      expect(getTabContent("xray").querySelector(".fs-xray-card")).toBeNull();
    });

    it("should show prompt text after mouseleave", () => {
      getCollector()(makePayload());
      createInstrumentedElement();

      getXrayToggle().click();
      (getShadowRoot().querySelector('.fs-tab[data-tab="xray"]') as HTMLElement).click();

      const dot = getXrayDots()[0] as HTMLElement;
      dot.dispatchEvent(new MouseEvent("mouseenter"));
      dot.dispatchEvent(new MouseEvent("mouseleave"));

      expect(getTabContent("xray").textContent).toContain("Hover an element");
    });
  });

  describe("minimize with X-Ray", () => {
    it("should hide overlay on minimize", () => {
      getCollector()(makePayload());
      createInstrumentedElement();
      getXrayToggle().click();

      clickButton("Minimize");

      const overlay = getXrayShadowRoot()?.querySelector(".fs-xray-overlay") as HTMLElement;
      expect(overlay.style.display).toBe("none");
    });

    it("should show overlay on restore if X-Ray was active", () => {
      getCollector()(makePayload());
      createInstrumentedElement();
      getXrayToggle().click();

      clickButton("Minimize");
      getBadge().click();

      const overlay = getXrayShadowRoot()?.querySelector(".fs-xray-overlay") as HTMLElement;
      expect(overlay.style.display).toBe("");
    });

    it("should not show overlay on restore if X-Ray was inactive", () => {
      getCollector()(makePayload());
      clickButton("Minimize");
      getBadge().click();

      expect(getXrayHost()).toBeNull();
    });
  });

  describe("cleanup with X-Ray", () => {
    it("should remove xray host on cleanup", () => {
      getCollector()(makePayload());
      getXrayToggle().click();
      expect(getXrayHost()).not.toBeNull();

      cleanupPanel();
      expect(getXrayHost()).toBeNull();
    });

    it("should allow re-creation after cleanup with X-Ray", () => {
      getCollector()(makePayload());
      getXrayToggle().click();
      cleanupPanel();

      getCollector()(makePayload({ assertion_key: "after-cleanup" }));
      expect(getHost()).not.toBeNull();
      expect(getXrayHost()).toBeNull(); // X-Ray should be off after cleanup
      expect(getXrayToggle().classList.contains("active")).toBe(false);
    });
  });
});
