import { ApiPayload } from "../types";

// --- State ---
let shadowRoot: ShadowRoot | null = null;
let hostElement: HTMLElement | null = null;
let panelBody: HTMLElement | null = null;
let panelContainer: HTMLElement | null = null;
let badgeElement: HTMLElement | null = null;

let state: "none" | "visible" | "minimized" | "dismissed" = "none";
const buffer: ApiPayload[] = [];
let badgeCount = 0;

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

  .fs-body {
    overflow-y: auto;
    flex: 1;
    max-height: 360px;
  }
  .fs-body::-webkit-scrollbar { width: 6px; }
  .fs-body::-webkit-scrollbar-track { background: transparent; }
  .fs-body::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }

  .fs-empty {
    padding: 24px;
    text-align: center;
    color: #71717a;
    font-size: 12px;
  }

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
  .fs-reason {
    color: #fca5a5;
    font-size: 11px;
    padding-left: 16px;
    margin-top: 2px;
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
  }
  .fs-badge:hover { background: #27272a; }
  .fs-badge.hidden { display: none; }
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

  const minimizeBtn = document.createElement("button");
  minimizeBtn.className = "fs-btn";
  minimizeBtn.textContent = "\u2013"; // en dash as minimize icon
  minimizeBtn.title = "Minimize";
  minimizeBtn.addEventListener("click", minimize);

  const closeBtn = document.createElement("button");
  closeBtn.className = "fs-btn";
  closeBtn.textContent = "\u00d7"; // multiplication sign as close icon
  closeBtn.title = "Close";
  closeBtn.addEventListener("click", dismiss);

  controls.appendChild(minimizeBtn);
  controls.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(controls);

  // Body
  panelBody = document.createElement("div");
  panelBody.className = "fs-body";

  panelContainer.appendChild(header);
  panelContainer.appendChild(panelBody);
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
}

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

  let detailText = `${payload.assertion_type}`;
  if (payload.assertion_type_value) {
    detailText += ` \u2192 ${payload.assertion_type_value}`;
  }
  detailText += `  \u00b7  ${payload.assertion_trigger}`;

  // Modifiers
  const modKeys = Object.keys(payload.assertion_type_modifiers || {});
  if (modKeys.length > 0) {
    const modStr = modKeys
      .filter(k => k !== "timeout" && k !== "mpa" && k !== "response-status")
      .map(k => `${k}=${(payload.assertion_type_modifiers as Record<string, string>)[k]}`)
      .join(", ");
    if (modStr) {
      detailText += `  \u00b7  [${modStr}]`;
    }
  }

  detail.textContent = detailText;

  row.appendChild(rowHeader);
  row.appendChild(detail);

  // Failure reason
  if (payload.status_reason) {
    const reason = document.createElement("div");
    reason.className = "fs-reason";
    reason.textContent = payload.status_reason;
    row.appendChild(reason);
  }

  // Prepend (most recent at top)
  panelBody.insertBefore(row, panelBody.firstChild);
}

function formatTime(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  if (diff < 1000) return "now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

// --- Lifecycle ---

function minimize(): void {
  if (!panelContainer || !badgeElement) return;
  state = "minimized";
  panelContainer.classList.add("hidden");
  badgeCount = 0;
  updateBadge();
  badgeElement.classList.remove("hidden");
}

function dismiss(): void {
  if (!panelContainer || !badgeElement) return;
  state = "dismissed";
  panelContainer.classList.add("hidden");
  badgeCount = 0;
  updateBadge();
  // Badge starts hidden when dismissed with 0 new — shows when new assertions arrive
}

function restore(): void {
  if (!panelContainer || !badgeElement) return;

  // Flush buffer
  for (const payload of buffer) {
    renderRow(payload);
  }
  buffer.length = 0;
  badgeCount = 0;

  state = "visible";
  panelContainer.classList.remove("hidden");
  badgeElement.classList.add("hidden");
}

function updateBadge(): void {
  if (!badgeElement) return;
  if (badgeCount > 0) {
    badgeElement.textContent = `FaultSense \u00b7 ${badgeCount} new`;
    badgeElement.classList.remove("hidden");
  }
}

export function cleanupPanel(): void {
  if (hostElement && hostElement.parentNode) {
    hostElement.parentNode.removeChild(hostElement);
  }
  hostElement = null;
  shadowRoot = null;
  panelBody = null;
  panelContainer = null;
  badgeElement = null;
  state = "none";
  buffer.length = 0;
  badgeCount = 0;
}

// --- Collector Function ---

const panelCollector = (payload: ApiPayload): void => {
  if (state === "none") {
    createPanel();
  }

  if (state === "visible") {
    renderRow(payload);
  } else if (state === "minimized" || state === "dismissed") {
    buffer.push(payload);
    badgeCount++;
    updateBadge();
  }
};

// Self-register on the Faultsense global
window.Faultsense = window.Faultsense || {};
window.Faultsense.collectors = window.Faultsense.collectors || {};
window.Faultsense.collectors.panel = panelCollector;
