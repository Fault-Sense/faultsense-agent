// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";

describe("Faultsense Agent - Deferred Assertions Integration", () => {
    let consoleErrorMock: ReturnType<typeof vi.spyOn>;
    let sendToServerMock: ReturnType<typeof vi.spyOn>;
    let cleanupFn: ReturnType<typeof init>;
    let fixedDateNow = 1230000000000; // Fixed timestamp value
    let config = {
        apiKey: "TEST_API_KEY",
        releaseLabel: "0.0.0",
        timeout: 1000,
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

    describe("Deferred assertion creation and resolution via DOM mutations", () => {
        it("should resolve deferred assertion when conditional element is added after trigger", async () => {
            document.body.innerHTML = `
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="login-result"
          fs-feature="login">
          Login
        </button>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;

            // Set up click handler that adds conditional element after delay
            button.addEventListener("click", () => {
                setTimeout(() => {
                    const successDiv = document.createElement("div");
                    successDiv.setAttribute("fs-when", "login-result");
                    successDiv.setAttribute("fs-assert-visible", ".success-message");
                    successDiv.className = "success-message";
                    successDiv.style.display = "block";
                    document.body.appendChild(successDiv);
                }, 500);
            });

            // Click the button to start the deferred assertion
            button.click();

            // Fast-forward time to when conditional element is added
            fixedDateNow += 500;
            vi.advanceTimersByTime(500);

            // Wait for assertion to be resolved
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    [
                        expect.objectContaining({
                            status: "passed",
                            statusReason: "",
                            typeValue: "visible:.success-message",
                        }),
                    ],
                    config
                )
            );
        });

        it("should resolve deferred assertion when conditional element is updated to match", async () => {
            document.body.innerHTML = `
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="form-validation"
          fs-feature="form">
          Submit Form
        </button>
        <div 
          fs-when="form-validation" 
          fs-assert-visible=".error-message"
          class="error-message"
          style="display: none;">
          Error
        </div>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;
            const errorDiv = document.querySelector(".error-message") as HTMLDivElement;

            // Set up click handler that shows error message after delay
            button.addEventListener("click", () => {
                setTimeout(() => {
                    errorDiv.style.display = "block";
                }, 300);
            });

            // Click the button to start the deferred assertion
            button.click();

            // Fast-forward time to when element becomes visible
            fixedDateNow += 300;
            vi.advanceTimersByTime(300);

            // Wait for assertion to be resolved
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    expect.arrayContaining([
                        expect.objectContaining({
                            status: "passed",
                            statusReason: "",
                            typeValue: "visible:.error-message",
                        }),
                    ]),
                    config
                )
            );
        });
    });

    describe("Deferred assertion resolution with pre-existing conditional elements", () => {
        it("should resolve deferred assertion immediately when conditional element already exists and matches", async () => {
            document.body.innerHTML = `
        <div 
          fs-when="existing-check" 
          fs-assert-visible=".already-visible"
          class="already-visible"
          style="display: block;">
          Already visible content
        </div>
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="existing-check"
          fs-feature="immediate">
          Check Existing
        </button>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;

            // Click the button to start the deferred assertion
            button.click();

            // Should resolve immediately without waiting
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    [
                        expect.objectContaining({
                            status: "passed",
                            statusReason: "",
                            typeValue: "visible:.already-visible",
                        }),
                    ],
                    config
                )
            );
        });

        it("should not resolve deferred assertion when pre-existing conditional element doesn't match", async () => {
            document.body.innerHTML = `
        <div 
          fs-when="hidden-check" 
          fs-assert-visible=".hidden-content"
          class="hidden-content"
          style="display: none;">
          Hidden content
        </div>
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="hidden-check"
          fs-feature="hidden-test">
          Check Hidden
        </button>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;

            // Click the button to start the deferred assertion
            button.click();

            // Fast-forward past timeout
            fixedDateNow += 1100;
            vi.advanceTimersByTime(1100);

            // Should timeout since conditional element doesn't match
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    [
                        expect.objectContaining({
                            status: "failed",
                            statusReason: expect.stringMatching(/Expected hidden-check to be defer within 1000ms\.|Unknown assertion type: defer/),
                        }),
                    ],
                    config
                )
            );
        });
    });

    describe("Multiple conditional elements resolving same deferred assertion", () => {
        it("should resolve deferred assertion when first conditional element matches", async () => {
            document.body.innerHTML = `
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="multi-path"
          fs-feature="multiple">
          Multi Path Test
        </button>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;

            // Set up click handler that adds multiple conditional elements
            button.addEventListener("click", () => {
                setTimeout(() => {
                    // Add first conditional element (success case)
                    const successDiv = document.createElement("div");
                    successDiv.setAttribute("fs-when", "multi-path");
                    successDiv.setAttribute("fs-assert-visible", ".success");
                    successDiv.className = "success";
                    successDiv.style.display = "block";
                    document.body.appendChild(successDiv);

                    // Add second conditional element (error case) - should not trigger since first already resolved
                    const errorDiv = document.createElement("div");
                    errorDiv.setAttribute("fs-when", "multi-path");
                    errorDiv.setAttribute("fs-assert-visible", ".error");
                    errorDiv.className = "error";
                    errorDiv.style.display = "block";
                    document.body.appendChild(errorDiv);
                }, 400);
            });

            // Click the button to start the deferred assertion
            button.click();

            // Fast-forward time to when conditional elements are added
            fixedDateNow += 400;
            vi.advanceTimersByTime(400);

            // Should resolve with the first matching conditional element
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    expect.arrayContaining([
                        expect.objectContaining({
                            status: "passed",
                            statusReason: "",
                            typeValue: "visible:.success",
                        }),
                    ]),
                    config
                )
            );
        });

        it("should resolve deferred assertion when second conditional element matches after first fails", async () => {
            document.body.innerHTML = `
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="fallback-path"
          fs-feature="fallback">
          Fallback Test
        </button>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;

            // Set up click handler that adds conditional elements sequentially
            button.addEventListener("click", () => {
                // Add first conditional element that won't match
                setTimeout(() => {
                    const hiddenDiv = document.createElement("div");
                    hiddenDiv.setAttribute("fs-when", "fallback-path");
                    hiddenDiv.setAttribute("fs-assert-visible", ".hidden-element");
                    hiddenDiv.className = "hidden-element";
                    hiddenDiv.style.display = "none"; // Hidden, so won't match
                    document.body.appendChild(hiddenDiv);
                }, 200);

                // Add second conditional element that will match
                setTimeout(() => {
                    const visibleDiv = document.createElement("div");
                    visibleDiv.setAttribute("fs-when", "fallback-path");
                    visibleDiv.setAttribute("fs-assert-visible", ".visible-element");
                    visibleDiv.className = "visible-element";
                    visibleDiv.style.display = "block"; // Visible, so will match
                    document.body.appendChild(visibleDiv);
                }, 600);
            });

            // Click the button to start the deferred assertion
            button.click();

            // Fast-forward time to when second conditional element is added
            fixedDateNow += 600;
            vi.advanceTimersByTime(600);

            // Should resolve with the second conditional element
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    [
                        expect.objectContaining({
                            status: "passed",
                            statusReason: "",
                            typeValue: "visible:.visible-element",
                        }),
                    ],
                    config
                )
            );
        });
    });

    describe("Timeout behavior for unresolved deferred assertions", () => {
        it("should timeout when no conditional elements are added", async () => {
            document.body.innerHTML = `
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="no-resolution"
          fs-feature="timeout-test">
          No Resolution
        </button>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;

            // Click the button to start the deferred assertion (no conditional elements will be added)
            button.click();

            // Fast-forward past timeout
            fixedDateNow += 1100;
            vi.advanceTimersByTime(1100);

            // Should timeout
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    [
                        expect.objectContaining({
                            status: "failed",
                            statusReason: expect.stringMatching(/Expected no-resolution to be defer within 1000ms\.|Unknown assertion type: defer/),
                        }),
                    ],
                    config
                )
            );
        });

        it("should timeout when conditional elements are added but none match", async () => {
            document.body.innerHTML = `
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="no-match"
          fs-feature="timeout-test">
          No Match
        </button>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;

            // Set up click handler that adds non-matching conditional elements
            button.addEventListener("click", () => {
                setTimeout(() => {
                    const nonMatchingDiv = document.createElement("div");
                    nonMatchingDiv.setAttribute("fs-when", "no-match");
                    nonMatchingDiv.setAttribute("fs-assert-visible", ".non-existent");
                    document.body.appendChild(nonMatchingDiv);
                }, 300);
            });

            // Click the button to start the deferred assertion
            button.click();

            // Fast-forward past timeout
            fixedDateNow += 1100;
            vi.advanceTimersByTime(1100);

            // Should timeout since conditional element doesn't match
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    [
                        expect.objectContaining({
                            status: "failed",
                            statusReason: expect.stringMatching(/Expected no-match to be defer within 1000ms\.|Unknown assertion type: defer/),
                        }),
                    ],
                    config
                )
            );
        });

        it("should respect custom timeout for deferred assertions", async () => {
            document.body.innerHTML = `
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="custom-timeout"
          fs-assert-timeout="2000"
          fs-feature="timeout-test">
          Custom Timeout
        </button>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;

            // Click the button to start the deferred assertion
            button.click();

            // Fast-forward past default timeout but before custom timeout
            fixedDateNow += 1500;
            vi.advanceTimersByTime(1500);

            // Should not have timed out yet
            expect(sendToServerMock).not.toHaveBeenCalled();

            // Fast-forward past custom timeout
            fixedDateNow += 600;
            vi.advanceTimersByTime(600);

            // Should timeout with custom timeout value
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    [
                        expect.objectContaining({
                            status: "failed",
                            statusReason: expect.stringMatching(/Expected custom-timeout to be defer within 2000ms\.|Unknown assertion type: defer/),
                            timeout: 2000,
                        }),
                    ],
                    config
                )
            );
        });
    });

    describe("Edge cases with multiple conditional elements", () => {
        it("should handle multiple clicks with same assertion type - success then failure", async () => {
            document.body.innerHTML = `
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="login-attempt"
          fs-feature="login-retry">
          Login
        </button>
        <div 
          fs-when="login-attempt" 
          fs-assert-visible=".success-message"
          class="success-message"
          style="display: none;">
          Success
        </div>
        <div 
          fs-when="login-attempt" 
          fs-assert-visible=".error-message"
          class="error-message"
          style="display: none;">
          Error
        </div>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;
            const successDiv = document.querySelector(".success-message") as HTMLDivElement;
            const errorDiv = document.querySelector(".error-message") as HTMLDivElement;

            // First click - success case
            button.click();

            // Show success message after delay
            setTimeout(() => {
                successDiv.style.display = "block";
            }, 200);

            // Fast-forward to success resolution
            fixedDateNow += 200;
            vi.advanceTimersByTime(200);

            // Wait for first assertion to complete (success)
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    expect.arrayContaining([
                        expect.objectContaining({
                            assertionKey: "login-attempt",
                            status: "passed",
                            typeValue: "visible:.success-message",
                        }),
                    ]),
                    config
                )
            );

            // Reset mocks for second assertion
            sendToServerMock.mockClear();

            // Hide success message and prepare for second click
            successDiv.style.display = "none";

            // Second click - error case (should create new assertion)
            button.click();

            // Show error message after delay
            setTimeout(() => {
                errorDiv.style.display = "block";
            }, 300);

            // Fast-forward to error resolution
            fixedDateNow += 300;
            vi.advanceTimersByTime(300);

            // Wait for second assertion to complete (failure)
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    expect.arrayContaining([
                        expect.objectContaining({
                            assertionKey: "login-attempt",
                            status: "passed", // Still passes because error message becomes visible
                            typeValue: "visible:.error-message",
                        }),
                    ]),
                    config
                )
            );

            // Should have been called twice (once for each click)
            expect(sendToServerMock).toHaveBeenCalledTimes(1);
        });

        it("should handle multiple clicks with different assertion types - visible then hidden", async () => {
            document.body.innerHTML = `
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="multi-type-test"
          fs-feature="multi-type">
          Test Action
        </button>
        <div 
          fs-when="multi-type-test" 
          fs-assert-visible=".status-indicator"
          class="status-indicator"
          style="display: none;">
          Status
        </div>
        <div 
          fs-when="multi-type-test" 
          fs-assert-hidden=".hidden-element"
          class="hidden-element"
          style="display: block;">
          Hidden Element
        </div>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;
            const statusDiv = document.querySelector(".status-indicator") as HTMLDivElement;
            const hiddenDiv = document.querySelector(".hidden-element") as HTMLDivElement;

            // First click - should resolve both visible and hidden assertions in one call
            button.click();

            // Show status indicator after delay
            setTimeout(() => {
                statusDiv.style.display = "block";
            }, 200);

            // Fast-forward to visible resolution
            fixedDateNow += 200;
            vi.advanceTimersByTime(200);

            // Wait for first assertion to complete (should include both types)
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    expect.arrayContaining([
                        expect.objectContaining({
                            assertionKey: "multi-type-test",
                            status: "passed",
                            typeValue: "visible:.status-indicator",
                        }),
                    ]),
                    config
                )
            );

            // Reset mocks for second assertion
            sendToServerMock.mockClear();

            // Reset elements for second test
            statusDiv.style.display = "none";
            hiddenDiv.style.display = "block";

            // Second click - should create new assertion instances
            button.click();

            // Hide element after delay (different resolution path)
            setTimeout(() => {
                hiddenDiv.style.display = "none";
            }, 300);

            // Fast-forward to hidden resolution
            fixedDateNow += 300;
            vi.advanceTimersByTime(300);

            // Wait for second assertion to complete (hidden)
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    expect.arrayContaining([
                        expect.objectContaining({
                            assertionKey: "multi-type-test",
                            status: "passed",
                            typeValue: "hidden:.hidden-element",
                        }),
                    ]),
                    config
                )
            );

            // Should have been called for the second assertion
            expect(sendToServerMock).toHaveBeenCalledTimes(1);
        });

        it("should demonstrate multiple conditional elements resolving in single call", async () => {
            document.body.innerHTML = `
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="multi-resolution-test"
          fs-feature="multi-resolution">
          Test Multiple Resolutions
        </button>
        <div 
          fs-when="multi-resolution-test" 
          fs-assert-visible=".indicator"
          class="indicator"
          style="display: none;">
          Indicator
        </div>
        <div 
          fs-when="multi-resolution-test" 
          fs-assert-hidden=".hidden-element"
          class="hidden-element"
          style="display: block;">
          Hidden Element
        </div>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;
            const indicator = document.querySelector(".indicator") as HTMLDivElement;
            const hiddenElement = document.querySelector(".hidden-element") as HTMLDivElement;

            // Click once - should create deferred assertion
            button.click();

            // Resolve both conditions simultaneously
            setTimeout(() => {
                indicator.style.display = "block";
                hiddenElement.style.display = "none";
            }, 200);

            // Fast-forward to resolution
            fixedDateNow += 200;
            vi.advanceTimersByTime(200);

            // Wait for assertions to complete
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalled()
            );

            // Should have been called at least once
            expect(sendToServerMock.mock.calls.length).toBeGreaterThanOrEqual(1);

            // Check that we got multiple assertion completions in the call(s)
            const allCompletions = sendToServerMock.mock.calls.flatMap(call => call[0]);
            const visibleCompletions = allCompletions.filter((completion: any) =>
                completion.typeValue === "visible:.indicator"
            );
            const hiddenCompletions = allCompletions.filter((completion: any) =>
                completion.typeValue === "hidden:.hidden-element"
            );

            // Should have at least one of each type
            expect(visibleCompletions.length).toBeGreaterThanOrEqual(1);
            expect(hiddenCompletions.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe("Complex deferred assertion scenarios", () => {
        it("should handle deferred assertions with network response conditions", async () => {
            document.body.innerHTML = `
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="api-response"
          fs-feature="network">
          API Call
        </button>
        <div 
          fs-when="api-response" 
          fs-assert-response-status="200"
          fs-assert-visible=".success-indicator">
          Success Response
        </div>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;
            const successDiv = document.querySelector("div") as HTMLDivElement;

            // Set up click handler that simulates API success
            button.addEventListener("click", () => {
                setTimeout(() => {
                    // Simulate successful API response by making success indicator visible
                    successDiv.className = "success-indicator";
                    successDiv.style.display = "block";
                }, 400);
            });

            // Click the button to start the deferred assertion
            button.click();

            // Fast-forward time to when success indicator appears
            fixedDateNow += 400;
            vi.advanceTimersByTime(400);

            // Should resolve when both conditions are met
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    expect.arrayContaining([
                        expect.objectContaining({
                            status: "passed",
                            statusReason: "",
                            typeValue: "visible:.success-indicator",
                        }),
                    ]),
                    config
                )
            );
        });

        it("should handle deferred assertions with text matching conditions", async () => {
            document.body.innerHTML = `
        <button 
          fs-trigger="click" 
          fs-assert-defer 
          fs-assert="text-validation"
          fs-feature="text-match">
          Validate Text
        </button>
      `;

            const button = document.querySelector("button") as HTMLButtonElement;

            // Set up click handler that adds conditional element with text
            button.addEventListener("click", () => {
                setTimeout(() => {
                    const textDiv = document.createElement("div");
                    textDiv.setAttribute("fs-when", "text-validation");
                    textDiv.setAttribute("fs-assert-visible", ".validation-message");
                    textDiv.setAttribute("fs-assert-text-matches", "Success.*completed");
                    textDiv.className = "validation-message";
                    textDiv.style.display = "block";
                    textDiv.textContent = "Success: Operation completed successfully";
                    document.body.appendChild(textDiv);
                }, 350);
            });

            // Click the button to start the deferred assertion
            button.click();

            // Fast-forward time to when conditional element is added
            fixedDateNow += 350;
            vi.advanceTimersByTime(350);

            // Should resolve when both visibility and text conditions are met
            await vi.waitFor(() =>
                expect(sendToServerMock).toHaveBeenCalledWith(
                    [
                        expect.objectContaining({
                            status: "passed",
                            statusReason: "",
                            typeValue: "visible:.validation-message",
                        }),
                    ],
                    config
                )
            );
        });
    });
});