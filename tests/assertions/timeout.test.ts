// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Timeout Override", () => {
    let consoleErrorMock: ReturnType<typeof vi.spyOn>;
    let sendToServerMock: ReturnType<typeof vi.spyOn>;
    let cleanupFn: ReturnType<typeof init>;
    let fixedDateNow = 1230000000000; // Fixed timestamp value
    let config = {
        apiKey: "TEST_API_KEY",
        releaseLabel: "0.0.0",
        timeout: 1000, // Default timeout: 1 second
        collectorURL: "http://localhost:9000",
    };

    beforeEach(() => {
        // Ensure HTMLElement is mocked on every test run (in case watch mode clears it)
        if (typeof HTMLElement === "undefined") {
            (global as any).HTMLElement = class { };
        }

        // Use fake timers to control setTimeout/setInterval
        vi.useFakeTimers();
        // Mock Date.now() to return a fixed timestamp
        vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);

        // Mock the sendToCollector function in the resolve module
        sendToServerMock = vi
            .spyOn(resolveModule, "sendToCollector")
            .mockImplementation(() => { });

        consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => { });

        vi.mock("../../src/utils/elements", () => ({
            isVisible: vi.fn().mockImplementation((element: HTMLElement) => {
                return (
                    element.style.display !== "none" &&
                    element.style.visibility !== "hidden"
                );
            }),
        }));

        // Initialize the agent script
        cleanupFn = init(config);
    });

    afterEach(() => {
        // Restore original timers and mocks
        cleanupFn();
        vi.clearAllTimers();
        vi.useRealTimers();
        consoleErrorMock.mockRestore();
        sendToServerMock.mockRestore();
        vi.spyOn(Date, "now").mockRestore();
    });

    it("Should pass when element appears within timeout override (longer than default timeout)", async () => {
        document.body.innerHTML = `
      <div id="delayed-content" style="display: none;">Content loaded!</div>
      <button 
        fs-trigger="click" 
        fs-assert-visible="#delayed-content" 
        fs-assert-timeout="2000"
        fs-assert="delayed-show" 
        fs-feature="timeout-test">
        Show Content
      </button>
    `;

        const button = document.querySelector("button") as HTMLButtonElement;
        const content = document.querySelector("#delayed-content") as HTMLDivElement;

        // Set up click handler that shows element after 1500ms
        // This is longer than default timeout (1000ms) but shorter than override (2000ms)
        button.addEventListener("click", () => {
            setTimeout(() => {
                content.style.display = "block";
            }, 1500);
        });

        // Click the button to start the assertion
        button.click();

        // Fast-forward time to just before the element appears (1400ms)
        // At this point, default timeout would have failed, but override should still be waiting
        fixedDateNow += 1400;
        vi.advanceTimersByTime(1400);

        // Verify no assertion has been sent yet (still waiting)
        expect(sendToServerMock).not.toHaveBeenCalled();

        // Fast-forward to when element appears (1500ms total)
        fixedDateNow += 100;
        vi.advanceTimersByTime(100);

        // Wait for assertion to be processed
        await vi.waitFor(() =>
            expect(sendToServerMock).toHaveBeenNthCalledWith(
                1,
                [
                    expect.objectContaining({
                        status: "passed",
                        statusReason: "",
                        timeout: 2000, // Should use the override timeout
                    }),
                ],
                config
            )
        );
    });

    it("Should fail when element doesn't appear within timeout override", async () => {
        document.body.innerHTML = `
      <div id="delayed-content" style="display: none;">Content loaded!</div>
      <button 
        fs-trigger="click" 
        fs-assert-visible="#delayed-content" 
        fs-assert-timeout="1500"
        fs-assert="delayed-show-fail" 
        fs-feature="timeout-test">
        Show Content (Will Fail)
      </button>
    `;

        const button = document.querySelector("button") as HTMLButtonElement;
        const content = document.querySelector("#delayed-content") as HTMLDivElement;

        // Set up click handler that shows element after 2000ms
        // This is longer than both default timeout (1000ms) and override (1500ms)
        button.addEventListener("click", () => {
            setTimeout(() => {
                content.style.display = "block";
            }, 2000);
        });

        // Click the button to start the assertion
        button.click();

        // Fast-forward time past the override timeout (1500ms)
        fixedDateNow += 1600;
        vi.advanceTimersByTime(1600);

        // Wait for assertion to fail due to timeout
        await vi.waitFor(() =>
            expect(sendToServerMock).toHaveBeenNthCalledWith(
                1,
                [
                    expect.objectContaining({
                        status: "failed",
                        statusReason: "Expected #delayed-content to be visible within 1500ms.",
                        timeout: 1500, // Should use the override timeout
                    }),
                ],
                config
            )
        );
    });

    it("Should use default timeout when no override is specified", async () => {
        document.body.innerHTML = `
      <div id="delayed-content" style="display: none;">Content loaded!</div>
      <button 
        fs-trigger="click" 
        fs-assert-visible="#delayed-content" 
        fs-assert="default-timeout" 
        fs-feature="timeout-test">
        Show Content (Default Timeout)
      </button>
    `;

        const button = document.querySelector("button") as HTMLButtonElement;
        const content = document.querySelector("#delayed-content") as HTMLDivElement;

        // Set up click handler that shows element after 1200ms
        // This is longer than default timeout (1000ms)
        button.addEventListener("click", () => {
            setTimeout(() => {
                content.style.display = "block";
            }, 1200);
        });

        // Click the button to start the assertion
        button.click();

        // Fast-forward time past the default timeout (1000ms)
        fixedDateNow += 1100;
        vi.advanceTimersByTime(1100);

        // Wait for assertion to fail due to default timeout
        await vi.waitFor(() =>
            expect(sendToServerMock).toHaveBeenNthCalledWith(
                1,
                [
                    expect.objectContaining({
                        status: "failed",
                        statusReason: "Expected #delayed-content to be visible within 1000ms.",
                    }),
                ],
                config
            )
        );
    });
});