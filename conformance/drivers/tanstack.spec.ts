/**
 * Layer 2 driver — TanStack Start + React 19 harness.
 *
 * Drives examples/todolist-tanstack running under VITE_FS_COLLECTOR=conformance
 * (see examples/todolist-tanstack/src/routes/__root.tsx and the webServer entry
 * in ../playwright.config.ts). The driver talks to the app through a real
 * Chromium instance, reads captured payloads from window.__fsAssertions,
 * and asserts the payload shape matches the agent's serialized output.
 *
 * Phase 3 scope: one smoke scenario (todos/add-item). The full 20-scenario
 * matrix lands in Phase 4 once the vue3 harness is up and the driver pattern
 * is proven.
 */

import { test, expect } from "@playwright/test";
import {
  readCapturedAssertions,
  resetCapturedAssertions,
  waitForFsAssertion,
} from "../shared/assertions";

test.describe("tanstack harness", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Settle window: in Vite dev mode the tanstack-start client boot
    // re-runs the agent init after HMR connects, which appears as a
    // second "[Faultsense]: Initializing agent..." log. A small delay
    // lets both init passes complete before we interact, otherwise the
    // click can land during the second init and its resulting payloads
    // never reach the collector. Follow-up: run this harness in
    // production build mode to avoid the HMR re-init entirely.
    await page.waitForTimeout(500);
    // Drop any payload captured during initial render (e.g., the
    // layout/title-visible invariant) so each test inspects only the
    // payloads produced by its own interactions.
    await resetCapturedAssertions(page);
  });

  test("todos/add-item — adding a todo produces a passing added assertion", async ({
    page,
  }) => {
    const input = page.locator("#add-todo-input");
    await expect(input).toBeVisible();
    await input.fill("Ship conformance smoke test");

    // The Add button carries the todos/add-item assertion with
    // mutex="conditions" — success variant should win and the error
    // sibling should be dismissed (and therefore never captured).
    await page.getByRole("button", { name: "Add" }).click();

    const payload = await waitForFsAssertion(page, "todos/add-item", {
      match: (a) => a.status === "passed",
    });

    expect(payload).toMatchObject({
      assertion_key: "todos/add-item",
      status: "passed",
      // The passing variant must be the success branch of the conditional group.
      condition_key: "success",
    });
    // Either the added or emitted success variant can pass first; both are
    // valid hits under mutex="conditions" same-key sibling survival.
    expect(["added", "emitted"]).toContain(payload.assertion_type);

    // The dismissed error sibling must NOT reach the collector.
    const all = await readCapturedAssertions(page);
    const errorSiblings = all.filter(
      (a) =>
        a.assertion_key === "todos/add-item" && a.condition_key === "error"
    );
    expect(errorSiblings).toEqual([]);
  });
});
