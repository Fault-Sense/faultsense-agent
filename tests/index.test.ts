/**
 * Tests for the auto-init IIFE in src/index.ts.
 *
 * The IIFE registers a DOMContentLoaded listener that reads `<script id="fs-agent">`
 * attributes into a config and calls init(). In Vite dev mode (e.g. TanStack Start)
 * the classic script effectively runs twice — once during initial parse, once after
 * HMR connects. Without an explicit cleanup-before-reinit step, the prior agent's
 * listeners and MutationObserver leak.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as resolveModule from "../src/assertions/server";

// Importing this module runs the IIFE which attaches the DOMContentLoaded
// listener and exposes window.Faultsense.init + cleanup.
import "../src/index";

describe("auto-init (DOMContentLoaded)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(resolveModule, "sendToCollector").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Discard any lingering cleanup from a prior test.
    window.Faultsense?.cleanup?.();
    if (window.Faultsense) window.Faultsense.cleanup = undefined;

    const script = document.createElement("script");
    script.id = "fs-agent";
    script.setAttribute("data-release-label", "test");
    script.setAttribute("data-api-key", "test");
    script.setAttribute("data-collector-url", "http://localhost:9999");
    document.head.appendChild(script);
  });

  afterEach(() => {
    window.Faultsense?.cleanup?.();
    if (window.Faultsense) window.Faultsense.cleanup = undefined;
    document.querySelector("script#fs-agent")?.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("invokes the previous cleanup before re-initializing on a second DOMContentLoaded", () => {
    // First dispatch — fresh init, cleanup is stored on the global.
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(typeof window.Faultsense?.cleanup).toBe("function");

    // Wrap the real cleanup in a spy so the test can detect whether it was
    // invoked before the second init overwrote it. The wrapper still calls
    // the real cleanup so listener/observer teardown happens either way.
    const firstCleanup = window.Faultsense!.cleanup!;
    const cleanupSpy = vi.fn(() => firstCleanup());
    window.Faultsense!.cleanup = cleanupSpy;

    // Second dispatch — simulates Vite dev-mode re-parse after HMR connects.
    // Without the fix, the IIFE handler overwrites `cleanup` without calling
    // the prior one, so the spy is never invoked.
    document.dispatchEvent(new Event("DOMContentLoaded"));

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    expect(typeof window.Faultsense?.cleanup).toBe("function");
    expect(window.Faultsense?.cleanup).not.toBe(cleanupSpy);
  });
});
