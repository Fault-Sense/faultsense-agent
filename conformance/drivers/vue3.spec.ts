/**
 * Layer 2 driver — Vue 3 + Vite harness.
 *
 * Drives conformance/vue3/ (a minimal purpose-built Vue 3 single-page
 * component that exercises Vue's fine-grained reactivity and nextTick
 * microtask batching) through a real Chromium. Each test mirrors one
 * scenario in conformance/vue3/src/App.vue.
 *
 * Phase 4 scope: 10 focused scenarios covering the mutation patterns
 * Vue uniquely exercises. The full tanstack 20-scenario parity (auth,
 * routing, offline) is intentionally out of scope — those test app
 * ceremony, not Vue.
 */

import { test, expect } from "@playwright/test";
import {
  readCapturedAssertions,
  resetCapturedAssertions,
  waitForFsAssertion,
} from "../shared/assertions";

test.describe("vue3 harness", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Let Vue finish mounting and let the agent's init-time scan for
    // mount/invariant elements complete before the test interacts.
    await page.waitForTimeout(300);
    await resetCapturedAssertions(page);
  });

  test("todos/add-item — conditional mutex success (added + emitted)", async ({
    page,
  }) => {
    await page.locator("#add-todo-input").fill("buy milk");
    await page.getByRole("button", { name: "Add" }).click();

    const payload = await waitForFsAssertion(page, "todos/add-item", {
      match: (a) => a.status === "passed",
    });
    expect(payload).toMatchObject({
      assertion_key: "todos/add-item",
      status: "passed",
      condition_key: "success",
    });
    // success variants (added + emitted) can pass in either order.
    expect(["added", "emitted"]).toContain(payload.assertion_type);

    // The dismissed error variant must never reach the collector.
    const all = await readCapturedAssertions(page);
    const errors = all.filter(
      (a) =>
        a.assertion_key === "todos/add-item" && a.condition_key === "error"
    );
    expect(errors).toEqual([]);
  });

  test("todos/toggle-complete — updated with classlist flip", async ({
    page,
  }) => {
    await page.locator("#add-todo-input").fill("read book");
    await page.getByRole("button", { name: "Add" }).click();
    await page.waitForSelector(".todo-item");
    await resetCapturedAssertions(page);

    // Check the newly-added item's checkbox.
    await page.locator(".todo-item input[type=checkbox]").first().check();

    const payload = await waitForFsAssertion(page, "todos/toggle-complete", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("updated");
  });

  test("todos/remove-item — removed from v-for list", async ({ page }) => {
    await page.locator("#add-todo-input").fill("delete me");
    await page.getByRole("button", { name: "Add" }).click();
    await page.waitForSelector(".todo-item");
    await resetCapturedAssertions(page);

    await page.locator(".remove-btn").first().click();

    const payload = await waitForFsAssertion(page, "todos/remove-item", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("removed");
  });

  test("todos/edit-item — added with focused modifier (v-if render)", async ({
    page,
  }) => {
    await page.locator("#add-todo-input").fill("edit me");
    await page.getByRole("button", { name: "Add" }).click();
    await page.waitForSelector(".todo-item");
    await resetCapturedAssertions(page);

    await page.locator(".edit-first").click();

    const payload = await waitForFsAssertion(page, "todos/edit-item", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("added");
  });

  test("todos/char-count-updated — input trigger + text-matches", async ({
    page,
  }) => {
    await page.locator("#add-todo-input").fill("hi");

    const payload = await waitForFsAssertion(page, "todos/char-count-updated", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("visible");
  });

  test("layout/empty-state-shown — mount trigger + visible", async ({
    page,
  }) => {
    // Empty state is rendered on initial mount (no todos yet).
    // resetCapturedAssertions in beforeEach clears the buffer so we
    // assert the empty-state payload is not already there — instead,
    // re-navigate to force a fresh mount.
    await page.goto("/");
    await page.waitForTimeout(300);

    const payload = await waitForFsAssertion(page, "layout/empty-state-shown", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("visible");
  });

  test("todos/count-updated — OOB triggered by add-item", async ({ page }) => {
    await page.locator("#add-todo-input").fill("count me");
    await page.getByRole("button", { name: "Add" }).click();

    const payload = await waitForFsAssertion(page, "todos/count-updated", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("visible");
    expect(payload.assertion_trigger).toBe("oob");
  });

  test("guide/advance-after-add — `after` sequence passes once add-item has passed", async ({
    page,
  }) => {
    // First, satisfy the parent sequence: add a todo.
    await page.locator("#add-todo-input").fill("prereq");
    await page.getByRole("button", { name: "Add" }).click();
    await waitForFsAssertion(page, "todos/add-item", {
      match: (a) => a.status === "passed",
    });

    await resetCapturedAssertions(page);

    // Click advance; the `after` assertion should pass because add-item
    // has already resolved passed in this session.
    await page.locator(".advance-btn").click();

    const payload = await waitForFsAssertion(page, "guide/advance-after-add", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("after");
  });

  test("actions/log-updated — custom event trigger + added", async ({
    page,
  }) => {
    await page.locator("#add-todo-input").fill("log this");
    await page.getByRole("button", { name: "Add" }).click();

    const payload = await waitForFsAssertion(page, "actions/log-updated", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("added");
    expect(payload.assertion_trigger).toBe("event:action-logged");
  });

  test("layout/title-visible — invariant reports failure if the title is hidden", async ({
    page,
  }) => {
    // The invariant holds at mount time; invariants only emit on failure
    // or recovery (see src/assertions/assertion.ts:144-148). Force a
    // violation by hiding the title from the outside.
    await page.evaluate(() => {
      const el = document.getElementById("app-title");
      if (el) (el as HTMLElement).style.display = "none";
    });

    const payload = await waitForFsAssertion(page, "layout/title-visible", {
      match: (a) => a.status === "failed",
    });
    expect(payload.assertion_trigger).toBe("invariant");
  });
});
