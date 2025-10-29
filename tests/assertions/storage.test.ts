// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadAssertions, storeAssertions } from "../../src/assertions/storage";
import { Assertion, AssertionModifiers } from "../../src/types";
import { storageKey } from "../../src/config";

describe("Faultsense Agent - Assertion Storage", () => {
    let mockLocalStorage: { [key: string]: string };
    let localStorageGetItemSpy: any;
    let localStorageSetItemSpy: any;
    let localStorageRemoveItemSpy: any;

    const createMockAssertion = (overrides: Partial<Assertion> = {}): Assertion => ({
        assertionKey: "test-assertion",
        assertionLabel: "Test Assertion",
        featureKey: "test-feature",
        featureLabel: "Test Feature",
        trigger: "click",
        type: "visible",
        typeValue: "#test-element",
        timeout: 1000,
        status: undefined,
        modifiers: {} as Record<AssertionModifiers, string>,
        statusReason: "",
        startTime: Date.now(),
        endTime: Date.now(),
        previousStatus: undefined,
        previousStatusReason: "",
        previousStartTime: Date.now(),
        previousEndTime: Date.now(),
        mpa_mode: false,
        elementSnapshot: "<div>test</div>",
        ...overrides
    });

    beforeEach(() => {
        // Mock localStorage
        mockLocalStorage = {};

        localStorageGetItemSpy = vi.spyOn(Storage.prototype, 'getItem')
            .mockImplementation((key: string) => mockLocalStorage[key] || null);

        localStorageSetItemSpy = vi.spyOn(Storage.prototype, 'setItem')
            .mockImplementation((key: string, value: string) => {
                mockLocalStorage[key] = value;
            });

        localStorageRemoveItemSpy = vi.spyOn(Storage.prototype, 'removeItem')
            .mockImplementation((key: string) => {
                delete mockLocalStorage[key];
            });
    });

    afterEach(() => {
        localStorageGetItemSpy.mockRestore();
        localStorageSetItemSpy.mockRestore();
        localStorageRemoveItemSpy.mockRestore();
    });

    describe("loadAssertions", () => {
        it("should return empty array when no assertions are stored", () => {
            const assertions = loadAssertions();

            expect(assertions).toEqual([]);
            expect(localStorageGetItemSpy).toHaveBeenCalledWith(storageKey);
            // removeItem is only called when data exists
            expect(localStorageRemoveItemSpy).not.toHaveBeenCalled();
        });

        it("should load and remove stored assertions when they exist", () => {
            const storedAssertions = [
                createMockAssertion({ assertionKey: "assertion-1", status: "passed" }),
                createMockAssertion({ assertionKey: "assertion-2", status: "failed" })
            ];

            mockLocalStorage[storageKey] = JSON.stringify(storedAssertions);

            const assertions = loadAssertions();

            expect(assertions).toEqual(storedAssertions);
            expect(localStorageGetItemSpy).toHaveBeenCalledWith(storageKey);
            expect(localStorageRemoveItemSpy).toHaveBeenCalledWith(storageKey);
            expect(mockLocalStorage[storageKey]).toBeUndefined();
        });

        it("should handle empty array in localStorage", () => {
            mockLocalStorage[storageKey] = JSON.stringify([]);

            const assertions = loadAssertions();

            expect(assertions).toEqual([]);
            expect(localStorageGetItemSpy).toHaveBeenCalledWith(storageKey);
            expect(localStorageRemoveItemSpy).toHaveBeenCalledWith(storageKey);
        });
    });

    describe("storeAssertions", () => {
        it("should not store anything when given empty array", () => {
            storeAssertions([]);

            expect(localStorageGetItemSpy).not.toHaveBeenCalled();
            expect(localStorageSetItemSpy).not.toHaveBeenCalled();
        });

        it("should store assertions when localStorage is empty", () => {
            const assertions = [
                createMockAssertion({ assertionKey: "first-assertion", status: "passed" }),
                createMockAssertion({ assertionKey: "second-assertion", status: "failed" })
            ];

            storeAssertions(assertions);

            expect(localStorageGetItemSpy).toHaveBeenCalledWith(storageKey);
            expect(localStorageSetItemSpy).toHaveBeenCalledWith(
                storageKey,
                JSON.stringify(assertions)
            );
            expect(mockLocalStorage[storageKey]).toBe(JSON.stringify(assertions));
        });

        it("should APPEND new assertions to existing ones (not overwrite)", () => {
            // Setup existing assertions in localStorage
            const existingAssertions = [
                createMockAssertion({ assertionKey: "existing-1", status: "passed" }),
                createMockAssertion({ assertionKey: "existing-2", status: "failed" })
            ];
            mockLocalStorage[storageKey] = JSON.stringify(existingAssertions);

            // Add new assertions
            const newAssertions = [
                createMockAssertion({ assertionKey: "new-1", status: undefined }),
                createMockAssertion({ assertionKey: "new-2", status: "passed" })
            ];
            storeAssertions(newAssertions);

            // Verify they were APPENDED, not overwritten
            const expectedAssertions = [...existingAssertions, ...newAssertions];
            expect(localStorageSetItemSpy).toHaveBeenCalledWith(
                storageKey,
                JSON.stringify(expectedAssertions)
            );
            expect(mockLocalStorage[storageKey]).toBe(JSON.stringify(expectedAssertions));

            // Verify order is preserved: existing first, then new
            const finalState = JSON.parse(mockLocalStorage[storageKey]);
            expect(finalState).toHaveLength(4);
            expect(finalState[0].assertionKey).toBe("existing-1");
            expect(finalState[1].assertionKey).toBe("existing-2");
            expect(finalState[2].assertionKey).toBe("new-1");
            expect(finalState[3].assertionKey).toBe("new-2");
        });

        it("should handle multiple append operations correctly", () => {
            // First batch of assertions
            const firstBatch = [
                createMockAssertion({ assertionKey: "batch-1-item-1", status: "passed" })
            ];
            storeAssertions(firstBatch);

            // Second batch - should append to first
            const secondBatch = [
                createMockAssertion({ assertionKey: "batch-2-item-1", status: "failed" }),
                createMockAssertion({ assertionKey: "batch-2-item-2", status: undefined })
            ];
            storeAssertions(secondBatch);

            // Third batch - should append to both previous
            const thirdBatch = [
                createMockAssertion({ assertionKey: "batch-3-item-1", status: "passed" })
            ];
            storeAssertions(thirdBatch);

            // Verify all batches are preserved in order
            const finalState = JSON.parse(mockLocalStorage[storageKey]);
            expect(finalState).toHaveLength(4);
            expect(finalState[0].assertionKey).toBe("batch-1-item-1");
            expect(finalState[1].assertionKey).toBe("batch-2-item-1");
            expect(finalState[2].assertionKey).toBe("batch-2-item-2");
            expect(finalState[3].assertionKey).toBe("batch-3-item-1");
        });

        it("should allow duplicate assertion keys when appending", () => {
            // Setup existing assertion
            const existingAssertions = [
                createMockAssertion({ assertionKey: "duplicate-key", status: "passed" })
            ];
            mockLocalStorage[storageKey] = JSON.stringify(existingAssertions);

            // Add new assertion with same key
            const newAssertions = [
                createMockAssertion({ assertionKey: "duplicate-key", status: "failed" })
            ];
            storeAssertions(newAssertions);

            // Should have both assertions (duplicates allowed)
            const finalState = JSON.parse(mockLocalStorage[storageKey]);
            expect(finalState).toHaveLength(2);
            expect(finalState[0].assertionKey).toBe("duplicate-key");
            expect(finalState[0].status).toBe("passed");
            expect(finalState[1].assertionKey).toBe("duplicate-key");
            expect(finalState[1].status).toBe("failed");
        });

        it("should handle corrupted localStorage gracefully", () => {
            // Setup corrupted data in localStorage
            mockLocalStorage[storageKey] = "corrupted json data";

            const assertions = [
                createMockAssertion({ assertionKey: "recovery-assertion", status: "passed" })
            ];

            // Should throw error when trying to parse corrupted JSON
            expect(() => storeAssertions(assertions)).toThrow();
        });

        it("should preserve assertion data integrity during append", () => {
            // Setup existing assertion with specific data
            const existingAssertions = [
                createMockAssertion({
                    assertionKey: "detailed-assertion",
                    status: "passed",
                    statusReason: "Element found successfully",
                    timeout: 5000,
                    elementSnapshot: "<button>Click me</button>"
                })
            ];
            mockLocalStorage[storageKey] = JSON.stringify(existingAssertions);

            // Add new assertion with different data
            const newAssertions = [
                createMockAssertion({
                    assertionKey: "another-assertion",
                    status: "failed",
                    statusReason: "Timeout exceeded",
                    timeout: 3000,
                    elementSnapshot: "<div>Not found</div>"
                })
            ];
            storeAssertions(newAssertions);

            // Verify all data is preserved correctly
            const finalState = JSON.parse(mockLocalStorage[storageKey]);
            expect(finalState).toHaveLength(2);

            // First assertion data preserved
            expect(finalState[0].assertionKey).toBe("detailed-assertion");
            expect(finalState[0].status).toBe("passed");
            expect(finalState[0].statusReason).toBe("Element found successfully");
            expect(finalState[0].timeout).toBe(5000);
            expect(finalState[0].elementSnapshot).toBe("<button>Click me</button>");

            // Second assertion data preserved
            expect(finalState[1].assertionKey).toBe("another-assertion");
            expect(finalState[1].status).toBe("failed");
            expect(finalState[1].statusReason).toBe("Timeout exceeded");
            expect(finalState[1].timeout).toBe(3000);
            expect(finalState[1].elementSnapshot).toBe("<div>Not found</div>");
        });
    });

    describe("Integration: Load and Store Cycle", () => {
        it("should demonstrate complete load-store-append cycle", () => {
            // 1. Start with some stored assertions
            const initialAssertions = [
                createMockAssertion({ assertionKey: "initial-1", status: "passed" }),
                createMockAssertion({ assertionKey: "initial-2", status: "failed" })
            ];
            mockLocalStorage[storageKey] = JSON.stringify(initialAssertions);

            // 2. Load assertions (this removes them from storage)
            const loadedAssertions = loadAssertions();
            expect(loadedAssertions).toEqual(initialAssertions);
            expect(mockLocalStorage[storageKey]).toBeUndefined();

            // 3. Store new assertions (should start fresh since storage was cleared)
            const newAssertions = [
                createMockAssertion({ assertionKey: "new-1", status: undefined })
            ];
            storeAssertions(newAssertions);
            expect(mockLocalStorage[storageKey]).toBe(JSON.stringify(newAssertions));

            // 4. Store more assertions (should append to the new ones)
            const moreAssertions = [
                createMockAssertion({ assertionKey: "more-1", status: "passed" })
            ];
            storeAssertions(moreAssertions);

            const finalState = JSON.parse(mockLocalStorage[storageKey]);
            expect(finalState).toHaveLength(2);
            expect(finalState[0].assertionKey).toBe("new-1");
            expect(finalState[1].assertionKey).toBe("more-1");
        });
    });
});