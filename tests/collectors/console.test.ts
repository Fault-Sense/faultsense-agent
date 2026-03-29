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

  it("should log error context when present", () => {
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const errorContext = { message: "ReferenceError: foo is not defined", stack: "at bar:1:1" };
    const collector = window.Faultsense!.collectors!.console;
    collector(makePayload({ error_context: errorContext }));

    expect(logSpy).toHaveBeenCalledWith("Error Context:", errorContext);
  });

  it("should not log error context when absent", () => {
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const collector = window.Faultsense!.collectors!.console;
    collector(makePayload({}));

    const errorCalls = logSpy.mock.calls.filter(
      (call) => call[0] === "Error Context:"
    );
    expect(errorCalls.length).toBe(0);
  });
});
