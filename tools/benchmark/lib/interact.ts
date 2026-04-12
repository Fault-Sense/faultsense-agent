import type { Page } from "@playwright/test";

const SETTLE_MS = 300;

/**
 * Canonical interaction sequence for the todolist-htmx demo.
 * Fires ~20 assertions: add (x3) + char-count + OOB count/item-count,
 * toggle (x2) + OOB count/count-stable, delete (x1) + OOB.
 *
 * Assumes the page is at /login. Logs in, runs CRUD, returns.
 */
export async function runCanonicalInteraction(page: Page): Promise<void> {
  // ── Login ────────────────────────────────────────────────────────
  await page.locator("input[name=username]").fill("demo");
  await page.locator("input[name=password]").fill("demo");
  await page.locator(".login-button").click();
  // HTMX uses HX-Location (client-side nav), NOT a full redirect.
  // Wait for the todo list to appear, not for a navigation event.
  await page.waitForSelector("#todo-list", { timeout: 10_000 });
  await page.waitForTimeout(SETTLE_MS);

  // ── Add 3 todos ──────────────────────────────────────────────────
  const todosToAdd = ["Benchmark todo A", "Benchmark todo B", "Benchmark todo C"];
  for (const text of todosToAdd) {
    const countBefore = await page.locator(".todo-item").count();
    await page.locator("#add-todo-input").fill(text);
    await page.locator("#add-todo-button").click();
    // Wait for new .todo-item to appear
    await page.waitForFunction(
      (expected) => document.querySelectorAll(".todo-item").length >= expected,
      countBefore + 1,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(SETTLE_MS);
  }

  // ── Toggle 2 todos ───────────────────────────────────────────────
  const checkboxes = page.locator(".todo-item input[type=checkbox]");
  for (let i = 0; i < 2; i++) {
    await checkboxes.nth(i).click();
    await page.waitForTimeout(SETTLE_MS);
  }

  // ── Delete 1 todo ────────────────────────────────────────────────
  const countBefore = await page.locator(".todo-item").count();
  await page.locator(".action-btn.delete-btn").first().click();
  // Wait for a .todo-item to be removed
  await page.waitForFunction(
    (expected) => document.querySelectorAll(".todo-item").length < expected,
    countBefore,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(SETTLE_MS);
}
