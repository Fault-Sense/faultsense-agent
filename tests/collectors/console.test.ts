// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ApiPayload } from "../../src/types";

// Import triggers self-registration
import "../../src/collectors/console";

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

describe("Console Collector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should register on window.Faultsense.collectors.console", () => {
    expect(window.Faultsense).toBeDefined();
    expect(window.Faultsense!.collectors).toBeDefined();
    expect(typeof window.Faultsense!.collectors!.console).toBe("function");
  });

  it("should log assertion to console as a collapsed group", () => {
    const groupSpy = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const endSpy = vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const collector = window.Faultsense!.collectors!.console;
    collector(makePayload({ assertion_key: "auth/login", status: "passed" }));

    expect(groupSpy).toHaveBeenCalledWith(
      expect.stringContaining("[PASSED]")
    );
    expect(groupSpy).toHaveBeenCalledWith(
      expect.stringContaining("auth/login")
    );
    expect(logSpy).toHaveBeenCalledWith("Status:", "passed");
    expect(endSpy).toHaveBeenCalled();
  });

  it("should log failure reason when present", () => {
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const collector = window.Faultsense!.collectors!.console;
    collector(
      makePayload({
        status: "failed",
        status_reason: "Timeout exceeded",
      })
    );

    expect(logSpy).toHaveBeenCalledWith("Reason:", "Timeout exceeded");
  });

  it("should not log reason when empty", () => {
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const collector = window.Faultsense!.collectors!.console;
    collector(makePayload({ status_reason: "" }));

    const reasonCalls = logSpy.mock.calls.filter(
      (call) => call[0] === "Reason:"
    );
    expect(reasonCalls.length).toBe(0);
  });
});
