/**
 * Layer 2 driver — HTMX 2 + Express/EJS harness.
 *
 * Drives conformance/htmx/ — a minimal Express + EJS app that exercises
 * HTMX's hx-* attribute surface (hx-post, hx-patch, hx-delete) with
 * outerHTML swaps, hx-swap="delete", and hx-swap-oob for multi-region
 * updates. HTMX is language-agnostic, so a Node backend is a faithful
 * harness — the Turbo-specific Rails helpers live in conformance/hotwire/.
 *
 * Scenarios mirror conformance/htmx/views/index.ejs:
 *   1. todos/add-item             hx-post + swap-oob count
 *   2. todos/toggle-complete      hx-patch + outerHTML swap (PAT-03)
 *   3. todos/remove-item          hx-delete + hx-swap="delete"
 *   4. todos/char-count-updated   input trigger + text-matches
 *   5. layout/empty-state-shown   mount trigger + visible
 *   6. todos/count-updated        OOB triggered by every CRUD action
 *   7. layout/title-visible       invariant (violation path)
 */

import { test, expect } from "@playwright/test";
import {
  readCapturedAssertions,
  resetCapturedAssertions,
  waitForFsAssertion,
} from "../shared/assertions";

test.describe("htmx harness", () => {
  test.beforeEach(async ({ page, request }) => {
    // Clear the Express in-memory store so every test starts clean.
    await request.post("/todos/reset");
    await page.goto("/");
    // Let HTMX finish hx-boot and let the agent's init-time scan run.
    await page.waitForTimeout(300);
    await resetCapturedAssertions(page);
  });

  test("todos/add-item — HTMX post + swap-oob produces a passing success variant", async ({
    page,
  }) => {
    await page.locator("#add-todo-input").fill("ship it");
    await page.getByRole("button", { name: "Add" }).click();

    const payload = await waitForFsAssertion(page, "todos/add-item", {
      match: (a) => a.status === "passed",
    });
    expect(payload).toMatchObject({
      assertion_key: "todos/add-item",
      status: "passed",
      condition_key: "success",
      assertion_type: "added",
    });

    const all = await readCapturedAssertions(page);
    const errors = all.filter(
      (a) =>
        a.assertion_key === "todos/add-item" && a.condition_key === "error"
    );
    expect(errors).toEqual([]);
  });

  test("todos/toggle-complete — hx-patch + outerHTML swap resolves via updated+ID", async ({
    page,
  }) => {
    await page.locator("#add-todo-input").fill("toggle me");
    await page.getByRole("button", { name: "Add" }).click();
    await waitForFsAssertion(page, "todos/add-item", {
      match: (a) => a.status === "passed",
    });
    await resetCapturedAssertions(page);

    await page.locator(".toggle-btn").first().click();

    const payload = await waitForFsAssertion(page, "todos/toggle-complete", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("updated");
  });

  test("todos/remove-item — hx-delete pulls the li out of the list", async ({
    page,
  }) => {
    await page.locator("#add-todo-input").fill("delete me");
    await page.getByRole("button", { name: "Add" }).click();
    await waitForFsAssertion(page, "todos/add-item", {
      match: (a) => a.status === "passed",
    });
    await resetCapturedAssertions(page);

    await page.locator(".remove-btn").first().click();

    const payload = await waitForFsAssertion(page, "todos/remove-item", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("removed");
  });

  test("todos/char-count-updated — input trigger + text-matches on the counter span", async ({
    page,
  }) => {
    await page.locator("#add-todo-input").fill("hi");

    const payload = await waitForFsAssertion(
      page,
      "todos/char-count-updated",
      { match: (a) => a.status === "passed" }
    );
    expect(payload.assertion_type).toBe("visible");
  });

  test("layout/empty-state-shown — mount trigger on server-rendered empty state", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForTimeout(300);

    const payload = await waitForFsAssertion(page, "layout/empty-state-shown", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("visible");
  });

  test("todos/count-updated — OOB triggered by hx-swap-oob on add", async ({
    page,
  }) => {
    await page.locator("#add-todo-input").fill("count me");
    await page.getByRole("button", { name: "Add" }).click();

    const payload = await waitForFsAssertion(page, "todos/count-updated", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_trigger).toBe("oob");
    expect(payload.assertion_type).toBe("visible");
  });

  test("layout/title-visible — invariant reports failure if the title is hidden", async ({
    page,
  }) => {
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
