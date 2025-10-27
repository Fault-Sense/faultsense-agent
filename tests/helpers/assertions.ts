/**
 * Not current used
 */
import { vi } from "vitest";
import * as resolveModule from "../../src/assertions/server";
import { isVisible } from "../../src/utils/elements";

let fixedDatedNow = 1230000000000; // Fixed timestamp value

export function beforeAssertions() {
  if (typeof HTMLElement === "undefined") {
    (global as any).HTMLElement = class { };
  }

  // Use fake timers to control setInterval
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => { });
  vi.spyOn(Date, "now").mockImplementation(() => fixedDatedNow);

  const mocks = {
    sendToServerMock: vi
      .spyOn(resolveModule, "sendToCollector")
      .mockImplementation(() => { }),
    simulateTimeout: async (timeout: number) => {
      await vi.advanceTimersByTime(timeout); // Advance the fake timers
      fixedDatedNow += timeout; // Increment the fixedDateNow
    },
  };

  return mocks;
}

export function afterAssertions() {
  // Restore original timers and mocks
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
}
