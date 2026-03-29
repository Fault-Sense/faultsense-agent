import { ApiPayload } from "../types";

// --- State ---
let shadowRoot: ShadowRoot | null = null;
let hostElement: HTMLElement | null = null;
let panelBody: HTMLElement | null = null;
let panelContainer: HTMLElement | null = null;
let badgeElement: HTMLElement | null = null;
let xrayTabContent: HTMLElement | null = null;
let streamTabContent: HTMLElement | null = null;

let state: "none" | "visible" | "minimized" = "none";
let activeTab: "stream" | "xray" = "stream";
let xrayActive = false;
let hoveredElement: Element | null = null;
const buffer: ApiPayload[] = [];
let badgePassCount = 0;
let badgeFailCount = 0;

// X-Ray overlay state
let xrayHostElement: HTMLElement | null = null;
let xrayShadowRoot: ShadowRoot | null = null;
let xrayOverlay: HTMLElement | null = null;
let xrayObserver: MutationObserver | null = null;
const dotMap = new Map<Element, HTMLElement>();
let rafId = 0;

// --- Styles ---
const PANEL_CSS = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    color: #e4e4e7;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .fs-panel {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 380px;
    max-height: 420px;
    background: #18181b;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    z-index: 2147483647;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    overflow: hidden;
  }
  .fs-panel.hidden { display: none; }

  .fs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: #27272a;
    border-bottom: 1px solid #3f3f46;
    flex-shrink: 0;
    cursor: default;
    user-select: none;
  }
  .fs-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.025em;
    color: #a1a1aa;
    text-transform: uppercase;
  }
  .fs-controls { display: flex; gap: 4px; }
  .fs-btn {
    background: none;
    border: 1px solid transparent;
    color: #a1a1aa;
    cursor: pointer;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    line-height: 1;
  }
  .fs-btn:hover {
    background: #3f3f46;
    color: #e4e4e7;
  }
  .fs-btn.active {
    background: #eab308;
    color: #18181b;
    border-color: #ca8a04;
  }
  .fs-btn.active:hover {
    background: #facc15;
  }

  .fs-tabs {
    display: flex;
    border-bottom: 1px solid #3f3f46;
    flex-shrink: 0;
    user-select: none;
  }
  .fs-tab {
    flex: 1;
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    color: #71717a;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    text-align: center;
    font-family: inherit;
  }
  .fs-tab:hover { color: #a1a1aa; }
  .fs-tab.active {
    color: #e4e4e7;
    border-bottom-color: #e4e4e7;
  }

  .fs-tab-content {
    overflow-y: auto;
    flex: 1;
    max-height: 328px;
  }
  .fs-tab-content.hidden { display: none; }
  .fs-tab-content::-webkit-scrollbar { width: 6px; }
  .fs-tab-content::-webkit-scrollbar-track { background: transparent; }
  .fs-tab-content::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }

  .fs-empty {
    padding: 24px;
    text-align: center;
    color: #71717a;
    font-size: 12px;
  }
  .fs-empty-btn {
    margin-top: 12px;
    padding: 6px 16px;
    background: #eab308;
    color: #18181b;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .fs-empty-btn:hover { background: #facc15; }

  .fs-row {
    padding: 8px 12px;
    border-bottom: 1px solid #27272a;
  }
  .fs-row:last-child { border-bottom: none; }

  .fs-row-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .fs-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .fs-status-dot.passed { background: #22c55e; }
  .fs-status-dot.failed { background: #ef4444; }
  .fs-status-dot.dismissed { background: #a1a1aa; }

  .fs-key {
    font-weight: 600;
    font-size: 13px;
    color: #f4f4f5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .fs-time {
    font-size: 11px;
    color: #71717a;
    flex-shrink: 0;
  }

  .fs-detail {
    font-size: 11px;
    color: #a1a1aa;
    line-height: 1.4;
    padding-left: 16px;
  }
  .fs-detail span { color: #71717a; }
  .fs-error-context {
    color: #fca5a5;
    font-size: 11px;
    padding-left: 16px;
    margin-top: 2px;
  }

  .fs-user-context {
    color: #93c5fd;
    font-size: 10px;
    padding-left: 16px;
    margin-top: 2px;
  }

  .fs-xray-card {
    padding: 12px;
  }
  .fs-xray-element {
    font-size: 12px;
    font-weight: 600;
    color: #a78bfa;
    margin-bottom: 8px;
    font-family: monospace;
  }
  .fs-xray-attr {
    padding: 4px 0;
    border-bottom: 1px solid #27272a;
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  .fs-xray-attr:last-child { border-bottom: none; }
  .fs-xray-attr-name {
    font-size: 11px;
    color: #eab308;
    font-weight: 600;
    font-family: monospace;
    flex-shrink: 0;
  }
  .fs-xray-attr-value {
    font-size: 11px;
    color: #e4e4e7;
    font-family: monospace;
    word-break: break-all;
  }

  .fs-badge {
    position: fixed;
    bottom: 16px;
    right: 16px;
    background: #18181b;
    border: 1px solid #3f3f46;
    border-radius: 20px;
    padding: 6px 14px;
    color: #e4e4e7;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    cursor: pointer;
    z-index: 2147483647;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    user-select: none;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .fs-badge:hover { background: #27272a; }
  .fs-badge.hidden { display: none; }
  .fs-badge-count {
    font-weight: 600;
    font-size: 11px;
  }
  .fs-badge-count.pass { color: #22c55e; }
  .fs-badge-count.fail { color: #ef4444; }
`;

const XRAY_CSS = `
  :host {
    all: initial;
  }
  .fs-xray-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 2147483646;
  }
  .fs-xray-dot {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #eab308;
    border: 1.5px solid #ca8a04;
    pointer-events: auto;
    cursor: crosshair;
    z-index: 1;
    box-shadow: 0 0 0 2px rgba(234, 179, 8, 0.3);
    transition: transform 0.1s ease;
  }
  .fs-xray-dot:hover {
    transform: scale(1.4);
  }
`;

// --- DOM Construction ---

function createPanel(): void {
  if (!document.body) return;

  hostElement = document.createElement("div");
  hostElement.id = "fs-panel-host";
  document.body.appendChild(hostElement);

  shadowRoot = hostElement.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = PANEL_CSS;
  shadowRoot.appendChild(style);

  // Panel container
  panelContainer = document.createElement("div");
  panelContainer.className = "fs-panel";

  // Header
  const header = document.createElement("div");
  header.className = "fs-header";

  const title = document.createElement("div");
  title.className = "fs-title";
  title.textContent = "FaultSense";

  const controls = document.createElement("div");
  controls.className = "fs-controls";

  const xrayToggleBtn = document.createElement("button");
  xrayToggleBtn.className = "fs-btn fs-xray-toggle";
  xrayToggleBtn.textContent = "\u2299"; // circled dot ⊙
  xrayToggleBtn.title = "X-Ray";
  xrayToggleBtn.addEventListener("click", toggleXray);

  const minimizeBtn = document.createElement("button");
  minimizeBtn.className = "fs-btn";
  minimizeBtn.textContent = "\u2013"; // en dash as minimize icon
  minimizeBtn.title = "Minimize";
  minimizeBtn.addEventListener("click", minimize);

  controls.appendChild(xrayToggleBtn);
  controls.appendChild(minimizeBtn);
  header.appendChild(title);
  header.appendChild(controls);

  // Tabs
  const tabs = document.createElement("div");
  tabs.className = "fs-tabs";

  const streamTab = document.createElement("button");
  streamTab.className = "fs-tab active";
  streamTab.dataset.tab = "stream";
  streamTab.textContent = "Stream";
  streamTab.addEventListener("click", () => switchTab("stream"));

  const xrayTab = document.createElement("button");
  xrayTab.className = "fs-tab";
  xrayTab.dataset.tab = "xray";
  xrayTab.textContent = "X-Ray";
  xrayTab.addEventListener("click", () => switchTab("xray"));

  tabs.appendChild(streamTab);
  tabs.appendChild(xrayTab);

  // Tab contents
  streamTabContent = document.createElement("div");
  streamTabContent.className = "fs-tab-content";
  streamTabContent.dataset.tab = "stream";

  // panelBody is now the stream tab content (for renderRow compatibility)
  panelBody = streamTabContent;

  xrayTabContent = document.createElement("div");
  xrayTabContent.className = "fs-tab-content hidden";
  xrayTabContent.dataset.tab = "xray";

  panelContainer.appendChild(header);
  panelContainer.appendChild(tabs);
  panelContainer.appendChild(streamTabContent);
  panelContainer.appendChild(xrayTabContent);
  shadowRoot.appendChild(panelContainer);

  // Badge (hidden initially)
  badgeElement = document.createElement("div");
  badgeElement.className = "fs-badge hidden";
  badgeElement.addEventListener("click", restore);
  shadowRoot.appendChild(badgeElement);

  // Register cleanup hook
  if (window.Faultsense?.registerCleanupHook) {
    window.Faultsense.registerCleanupHook(cleanupPanel);
  }

  state = "visible";
  renderXrayTabContent();
}

// --- Tab Switching ---

function switchTab(tab: "stream" | "xray"): void {
  if (!shadowRoot || !streamTabContent || !xrayTabContent) return;
  activeTab = tab;

  // Update tab buttons
  const tabs = shadowRoot.querySelectorAll(".fs-tab");
  tabs.forEach((t) => {
    if ((t as HTMLElement).dataset.tab === tab) {
      t.classList.add("active");
    } else {
      t.classList.remove("active");
    }
  });

  // Update tab content visibility
  if (tab === "stream") {
    streamTabContent.classList.remove("hidden");
    xrayTabContent.classList.add("hidden");
  } else {
    streamTabContent.classList.add("hidden");
    xrayTabContent.classList.remove("hidden");
  }
}

// --- X-Ray Toggle ---

function toggleXray(): void {
  xrayActive = !xrayActive;

  // Update toggle button appearance
  if (shadowRoot) {
    const btn = shadowRoot.querySelector(".fs-xray-toggle");
    if (btn) {
      if (xrayActive) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    }
  }

  if (xrayActive) {
    startXray();
  } else {
    stopXray();
    hoveredElement = null;
  }

  renderXrayTabContent();
}

// --- X-Ray Tab Content ---

function renderXrayTabContent(): void {
  if (!xrayTabContent) return;
  xrayTabContent.innerHTML = "";

  if (!xrayActive) {
    // Off state: empty state with enable button
    const empty = document.createElement("div");
    empty.className = "fs-empty";
    empty.textContent = "Enable X-Ray to inspect instrumented elements";

    const btn = document.createElement("button");
    btn.className = "fs-empty-btn";
    btn.textContent = "Enable X-Ray";
    btn.addEventListener("click", toggleXray);

    empty.appendChild(btn);
    xrayTabContent.appendChild(empty);
  } else if (!hoveredElement) {
    // On, not hovering: prompt text
    const empty = document.createElement("div");
    empty.className = "fs-empty";
    empty.textContent = "Hover an element to inspect its assertions";
    xrayTabContent.appendChild(empty);
  } else {
    // On, hovering: detail card
    renderDetailCard(hoveredElement);
  }
}

function renderDetailCard(element: Element): void {
  if (!xrayTabContent) return;
  xrayTabContent.innerHTML = "";

  const card = document.createElement("div");
  card.className = "fs-xray-card";

  // Element identification: <tag#id.class>
  const elementLabel = document.createElement("div");
  elementLabel.className = "fs-xray-element";
  let label = `<${element.tagName.toLowerCase()}`;
  if (element.id) label += `#${element.id}`;
  const firstClass = element.classList[0];
  if (firstClass) label += `.${firstClass}`;
  label += ">";
  elementLabel.textContent = label;
  card.appendChild(elementLabel);

  // Collect and sort fs-* attributes
  const attrs: { name: string; value: string }[] = [];
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    if (attr.name.startsWith("fs-")) {
      attrs.push({ name: attr.name, value: attr.value });
    }
  }

  // Sort: fs-assert first, fs-trigger second, then types (fs-assert-*), then rest
  attrs.sort((a, b) => {
    const order = (name: string): number => {
      if (name === "fs-assert") return 0;
      if (name === "fs-trigger") return 1;
      if (name.startsWith("fs-assert-oob")) return 4;
      if (name.startsWith("fs-assert-after")) return 5;
      if (name.startsWith("fs-assert-timeout") || name.startsWith("fs-assert-mpa") || name.startsWith("fs-assert-mutex")) return 3;
      if (name.startsWith("fs-assert-")) return 2;
      return 6;
    };
    return order(a.name) - order(b.name) || a.name.localeCompare(b.name);
  });

  // Render attributes
  const attrsContainer = document.createElement("div");
  attrsContainer.className = "fs-xray-attrs";
  for (const attr of attrs) {
    const row = document.createElement("div");
    row.className = "fs-xray-attr";

    const name = document.createElement("span");
    name.className = "fs-xray-attr-name";
    name.textContent = attr.name;

    const value = document.createElement("span");
    value.className = "fs-xray-attr-value";
    value.textContent = attr.value || '""';

    row.appendChild(name);
    row.appendChild(value);
    attrsContainer.appendChild(row);
  }
  card.appendChild(attrsContainer);
  xrayTabContent.appendChild(card);
}

// --- X-Ray Overlay ---

function createXrayOverlay(): void {
  if (!document.body) return;

  xrayHostElement = document.createElement("div");
  xrayHostElement.id = "fs-xray-host";
  document.body.appendChild(xrayHostElement);

  xrayShadowRoot = xrayHostElement.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = XRAY_CSS;
  xrayShadowRoot.appendChild(style);

  xrayOverlay = document.createElement("div");
  xrayOverlay.className = "fs-xray-overlay";
  xrayShadowRoot.appendChild(xrayOverlay);
}

function destroyXrayOverlay(): void {
  if (xrayObserver) {
    xrayObserver.disconnect();
    xrayObserver = null;
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  window.removeEventListener("scroll", onScrollResize, true);
  window.removeEventListener("resize", onScrollResize);
  dotMap.clear();
  if (xrayHostElement && xrayHostElement.parentNode) {
    xrayHostElement.parentNode.removeChild(xrayHostElement);
  }
  xrayHostElement = null;
  xrayShadowRoot = null;
  xrayOverlay = null;
}

function startXray(): void {
  createXrayOverlay();
  scanElements();
  positionDots();

  // Observe DOM for dynamic elements
  xrayObserver = new MutationObserver(() => {
    scanElements();
    positionDots();
  });
  if (document.body) {
    xrayObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Scroll and resize listeners
  window.addEventListener("scroll", onScrollResize, { capture: true, passive: true });
  window.addEventListener("resize", onScrollResize);
}

function stopXray(): void {
  destroyXrayOverlay();
}

function onScrollResize(): void {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    positionDots();
  });
}

function scanElements(): void {
  if (!xrayOverlay) return;

  const currentElements = new Set(document.querySelectorAll("[fs-assert]"));

  // Remove dots for elements no longer in DOM
  for (const [element, dot] of dotMap) {
    if (!currentElements.has(element)) {
      dot.remove();
      dotMap.delete(element);
    }
  }

  // Add dots for new elements
  for (const element of currentElements) {
    if (!dotMap.has(element)) {
      const dot = createDot(element);
      xrayOverlay.appendChild(dot);
      dotMap.set(element, dot);
    }
  }
}

function createDot(target: Element): HTMLElement {
  const dot = document.createElement("div");
  dot.className = "fs-xray-dot";

  // Hover handlers for inspect
  dot.addEventListener("mouseenter", () => {
    hoveredElement = target;
    renderXrayTabContent();
  });
  dot.addEventListener("mouseleave", () => {
    hoveredElement = null;
    renderXrayTabContent();
  });

  // Click forwarding — don't block app interactions
  for (const eventType of ["click", "mousedown", "mouseup", "contextmenu"] as const) {
    dot.addEventListener(eventType, (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dot.style.display = "none";
      const realTarget = document.elementFromPoint(e.clientX, e.clientY);
      dot.style.display = "";
      if (realTarget) {
        realTarget.dispatchEvent(new MouseEvent(e.type, e));
      }
    });
  }

  return dot;
}

function positionDots(): void {
  for (const [element, dot] of dotMap) {
    const rect = element.getBoundingClientRect();

    // Hide dots for off-screen or zero-size elements
    if (rect.width === 0 || rect.height === 0 ||
        rect.bottom < 0 || rect.top > window.innerHeight ||
        rect.right < 0 || rect.left > window.innerWidth) {
      dot.style.display = "none";
      continue;
    }

    dot.style.display = "";
    dot.style.left = `${rect.left - 5}px`;
    dot.style.top = `${rect.top - 5}px`;
  }
}

// --- Row Rendering ---

function renderRow(payload: ApiPayload): void {
  if (!panelBody) return;

  const row = document.createElement("div");
  row.className = "fs-row";

  // Header: status dot + key + timestamp
  const rowHeader = document.createElement("div");
  rowHeader.className = "fs-row-header";

  const dot = document.createElement("div");
  dot.className = `fs-status-dot ${payload.status}`;

  const key = document.createElement("div");
  key.className = "fs-key";
  key.textContent = payload.assertion_key;

  const time = document.createElement("div");
  time.className = "fs-time";
  time.textContent = formatTime(payload.timestamp);

  rowHeader.appendChild(dot);
  rowHeader.appendChild(key);
  rowHeader.appendChild(time);

  // Detail line: type → selector | trigger
  const detail = document.createElement("div");
  detail.className = "fs-detail";

  const conditionSuffix = payload.condition_key ? `-${payload.condition_key}` : "";

  let detailText = `${payload.assertion_type}${conditionSuffix}`;
  if (payload.assertion_type_value) {
    detailText += ` \u2192 ${payload.assertion_type_value}`;
  }
  detailText += `  \u00b7  ${payload.assertion_trigger}`;

  // Modifiers
  const modKeys = Object.keys(payload.assertion_type_modifiers || {});
  if (modKeys.length > 0) {
    const modStr = modKeys
      .filter(k => k !== "timeout" && k !== "mpa" && k !== "mutex")
      .map(k => `${k}=${(payload.assertion_type_modifiers as Record<string, string>)[k]}`)
      .join(", ");
    if (modStr) {
      detailText += `  \u00b7  [${modStr}]`;
    }
  }

  detail.textContent = detailText;

  row.appendChild(rowHeader);
  row.appendChild(detail);

  // Error context
  if (payload.error_context) {
    const errorCtx = document.createElement("div");
    errorCtx.className = "fs-error-context";
    errorCtx.textContent = `\u26A0 ${payload.error_context.message}`;
    row.appendChild(errorCtx);
  }

  // User context
  if (payload.user_context) {
    const userCtx = document.createElement("div");
    userCtx.className = "fs-user-context";
    userCtx.textContent = Object.entries(payload.user_context)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    row.appendChild(userCtx);
  }

  // Prepend (most recent at top)
  panelBody.insertBefore(row, panelBody.firstChild);
}

function formatTime(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// --- Lifecycle ---

function minimize(): void {
  if (!panelContainer || !badgeElement) return;
  state = "minimized";
  panelContainer.classList.add("hidden");
  badgePassCount = 0;
  badgeFailCount = 0;
  updateBadge();
  badgeElement.classList.remove("hidden");

  // Hide X-Ray overlay while minimized (state persists)
  if (xrayActive && xrayOverlay) {
    xrayOverlay.style.display = "none";
  }
}

function restore(): void {
  if (!panelContainer || !badgeElement) return;

  // Flush buffer
  for (const payload of buffer) {
    renderRow(payload);
  }
  buffer.length = 0;
  badgePassCount = 0;
  badgeFailCount = 0;

  state = "visible";
  panelContainer.classList.remove("hidden");
  badgeElement.classList.add("hidden");

  // Restore X-Ray overlay if it was active
  if (xrayActive && xrayOverlay) {
    xrayOverlay.style.display = "";
    positionDots();
  }
}

function updateBadge(): void {
  if (!badgeElement) return;

  // Always show "Faultsense" label. Add pass/fail counts when there are buffered items.
  let html = "Faultsense";
  const parts: string[] = [];
  if (badgePassCount > 0) {
    parts.push(`<span class="fs-badge-count pass">${badgePassCount} \u2713</span>`);
  }
  if (badgeFailCount > 0) {
    parts.push(`<span class="fs-badge-count fail">${badgeFailCount} \u2717</span>`);
  }
  if (parts.length > 0) {
    html += ` \u00b7 ${parts.join("  ")}`;
  }
  badgeElement.innerHTML = html;
}

export function cleanupPanel(): void {
  // Tear down X-Ray overlay
  destroyXrayOverlay();
  xrayActive = false;
  hoveredElement = null;

  if (hostElement && hostElement.parentNode) {
    hostElement.parentNode.removeChild(hostElement);
  }
  hostElement = null;
  shadowRoot = null;
  panelBody = null;
  panelContainer = null;
  badgeElement = null;
  xrayTabContent = null;
  streamTabContent = null;
  activeTab = "stream";
  state = "none";
  buffer.length = 0;
  badgePassCount = 0;
  badgeFailCount = 0;
}

// --- Collector Function ---

const panelCollector = (payload: ApiPayload): void => {
  if (state === "none") {
    createPanel();
  }

  if (state === "visible") {
    renderRow(payload);
  } else if (state === "minimized") {
    buffer.push(payload);
    if (payload.status === "passed") {
      badgePassCount++;
    } else {
      badgeFailCount++;
    }
    updateBadge();
  }
};

// Self-register on the Faultsense global
window.Faultsense = window.Faultsense || {};
window.Faultsense.collectors = window.Faultsense.collectors || {};
window.Faultsense.collectors.panel = panelCollector;
