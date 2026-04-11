/**
 * Layer 2 driver — Svelte 5 (runes mode) + Vite harness.
 *
 * Drives conformance/svelte/ — a minimal purpose-built Svelte 5 single-
 * page component exercising Svelte's signal-based fine-grained reactivity
 * and compile-time-optimized updates. Each test mirrors one scenario in
 * conformance/svelte/src/App.svelte so the works-with matrix rows line
 * up exactly with the react and vue3 rows.
 */

import { test, expect } from "@playwright/test";
import {
  readCapturedAssertions,
  resetCapturedAssertions,
  waitForFsAssertion,
} from "../shared/assertions";

test.describe("svelte harness", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Let Svelte finish mounting and let the agent's init-time scan for
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

    await page.locator(".todo-item input[type=checkbox]").first().check();

    const payload = await waitForFsAssertion(page, "todos/toggle-complete", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("updated");
  });

  test("todos/remove-item — removed from keyed each-block", async ({ page }) => {
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

  test("todos/edit-item — added with focused modifier ({#if} render)", async ({
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
    // Empty state is rendered on initial mount (no todos yet). Navigate
    // fresh so the mount trigger captures it after the beforeEach reset.
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
    await page.locator("#add-todo-input").fill("prereq");
    await page.getByRole("button", { name: "Add" }).click();
    await waitForFsAssertion(page, "todos/add-item", {
      match: (a) => a.status === "passed",
    });

    await resetCapturedAssertions(page);

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
    // Invariants only emit on failure or recovery. Force a violation by
    // hiding the title from the outside.
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
