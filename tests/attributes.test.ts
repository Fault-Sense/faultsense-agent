// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import { init } from "../src/index";
import * as resolveModule from "../src/assertions/server";
import { afterEach } from "node:test";

describe("Faultsense Agent - Attribute Validation", () => {
  let cleanupFn: ReturnType<typeof init>;
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
  let sendToServerMock: ReturnType<typeof vi.spyOn>;
  let fixedDateNow = 1230000000000; // Fixed timestamp value
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);

    sendToServerMock = vi
      .spyOn(resolveModule, "sendToCollector")
      .mockImplementation(() => { });

    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => { });

    // Initialize the agent script
    cleanupFn = init({
      apiKey: "TEST_API_KEY",
      releaseLabel: "0.0.0",
      timeout: 1000,
      collectorURL: "http://localhost:9000",
    });
  });

  afterEach(() => {
    cleanupFn();
    // Restore original timers and mocks
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleErrorMock.mockRestore();
    sendToServerMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
  });

  it("Should require a feature key", async () => {
    document.body.innerHTML = `<button fs-trigger="click">Click</button>`;

    const button = document.querySelector(
      'button[fs-trigger="click"]'
    ) as HTMLElement;
    button.click();

    expect(consoleErrorMock).toHaveBeenCalledWith(
      "[Faultsense]: Missing 'fs-feature' on assertion.",
      { element: button }
    );
  });

  it("Should require an assertion key", async () => {
    document.body.innerHTML = `<button fs-trigger="click" fs-feature="feature1">Click</button>`;

    const button = document.querySelector("button") as HTMLElement;
    button.click();

    expect(consoleErrorMock).toHaveBeenCalledWith(
      "[Faultsense]: Missing 'fs-assert' on assertion.",
      { element: button }
    );
  });

  it("Should require at least one assertion type", async () => {
    document.body.innerHTML = `
        <button 
          fs-trigger="click"
          fs-feature="feature1"
          fs-assert="assert1">Click</button>`;

    const button = document.querySelector("button") as HTMLElement;
    button.click();

    expect(consoleErrorMock).toHaveBeenCalledWith(
      "[Faultsense]: An assertion type must be provided.",
      { element: button }
    );
  });

  it("Should allow supported assertion types", async () => {
    document.body.innerHTML = `
        <button
          fs-trigger="click"
          fs-feature="feature1"
          fs-assert="assert1"
          fs-assert-added="#id">Click</button>`;

    const button = document.querySelector("button") as HTMLElement;
    button.click();

    expect(consoleErrorMock).not.toHaveBeenCalled();
  });

  it("Should allow the response-headers assertion type", async () => {
    document.body.innerHTML = `
        <button
          fs-trigger="click"
          fs-feature="feature1"
          fs-assert="assert1"
          fs-assert-response-headers='{"status": "200", "Content-Type": "application/json"}'
        >Click</button>`;

    const button = document.querySelector("button") as HTMLElement;
    button.click();

    expect(consoleErrorMock).not.toHaveBeenCalled();
  });

  it("Should fail if the response-headers assertion is not valid JSON", async () => {
    document.body.innerHTML = `
        <button
          fs-trigger="click"
          fs-feature="feature1"
          fs-assert="assert1"
          fs-assert-response-headers="200"
        >Click</button>`;

    const button = document.querySelector("button") as HTMLElement;
    button.click();

    expect(consoleErrorMock).toHaveBeenCalled();
  });
});
