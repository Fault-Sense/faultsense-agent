// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import { init } from "../src/index";
import * as resolveModule from "../src/assertions/server";
import { afterEach } from "node:test";

describe("Faultsense Agent - Configuration Validation", () => {
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorMock.mockRestore();
  });

  it("Should return true for a valid configuration", async () => {
    // Initialize the agent script
    const cleanupFn = init({
      apiKey: "TEST_API_KEY",
      releaseLabel: "0.0.0",
      timeout: 1000,
      collectorURL: "http://localhost:9000",
    });
    expect(consoleErrorMock).not.toHaveBeenCalledWith(
      "[Faultsense]: Invalid configuration. Agent not initialized."
    );
    cleanupFn();
  });

  it("Should require an API key", async () => {
    const config = {
      releaseLabel: "0.0.0",
      timeout: 1000,
      collectorURL: "http://localhost:9000",
    } as any;
    const cleanupFn = init(config);
    expect(consoleErrorMock).toHaveBeenNthCalledWith(
      1,
      "[Faultsense]: Invalid configuration value for 'apiKey'",
      config
    );
    cleanupFn();
  });

  it("Should not require a collector URL (uses defualt)", async () => {
    const config = {
      apiKey: "TEST_API_KEY",
      releaseLabel: "0.0.0",
      timeout: 1000,
    } as any;
    const cleanupFn = init(config);
    expect(consoleErrorMock).not.toHaveBeenCalled();
    cleanupFn();
  });

  it("Should not require a timeout (uses defualt)", async () => {
    const config = {
      apiKey: "TEST_API_KEY",
      releaseLabel: "0.0.0",
      collectorURL: "http://localhost:9000",
    } as any;
    const cleanupFn = init(config);
    expect(consoleErrorMock).not.toHaveBeenCalled();
    cleanupFn();
  });

  it("Should require a release label", async () => {
    const config = {
      apiKey: "TEST_API_KEY",
      timeout: 1000,
      collectorURL: "http://localhost:9000",
    } as any;
    const cleanupFn = init(config);
    expect(consoleErrorMock).toHaveBeenNthCalledWith(
      1,
      "[Faultsense]: Invalid configuration value for 'releaseLabel'",
      config
    );
    cleanupFn();
  });
});
