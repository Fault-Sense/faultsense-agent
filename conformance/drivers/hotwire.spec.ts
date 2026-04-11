/**
 * Layer 2 driver — Hotwire (Rails 8 + Turbo 8) harness.
 *
 * Drives conformance/hotwire/ — a minimal Rails + turbo-rails app
 * running in a Docker container (see conformance/hotwire/Dockerfile).
 * Each test exercises one Turbo Stream mutation shape against a real
 * Rails response, which is the point of Phase 5: Turbo's wire format
 * and mutation pipeline are what the harness is here to cover. No
 * other harness can do that faithfully.
 *
 * Scenarios mirror conformance/hotwire/app/views/todos/index.html.erb:
 *   1. todos/add-item             — Turbo Stream append + conditional mutex
 *   2. todos/toggle-complete      — Turbo Stream replace (outerHTML swap)
 *   3. todos/remove-item          — Turbo Stream remove
 *   4. todos/char-count-updated   — input trigger + text-matches
 *   5. layout/empty-state-shown   — mount trigger + visible
 *   6. todos/count-updated        — OOB triggered by add/toggle/remove
 *   7. layout/title-visible       — invariant (violation path)
 */

import { test, expect } from "@playwright/test";
import {
  readCapturedAssertions,
  resetCapturedAssertions,
  waitForFsAssertion,
} from "../shared/assertions";

test.describe("hotwire harness", () => {
  test.beforeEach(async ({ page, request }) => {
    // Clear the Rails in-memory store so every test starts with a
    // known-empty todo list. The /todos/reset endpoint is a dev-only
    // route wired up in config/routes.rb.
    await request.post("/todos/reset");
    await page.goto("/");
    // Let Turbo finish booting and the agent's init-time scan run
    // before the test interacts.
    await page.waitForTimeout(400);
    await resetCapturedAssertions(page);
  });

  test("todos/add-item — Turbo Stream append produces a passing success variant", async ({
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

    // Error variant must be dismissed under mutex="conditions".
    const all = await readCapturedAssertions(page);
    const errors = all.filter(
      (a) =>
        a.assertion_key === "todos/add-item" && a.condition_key === "error"
    );
    expect(errors).toEqual([]);
  });

  test("todos/toggle-complete — Turbo Stream replace swaps the li with the flipped classlist", async ({
    page,
  }) => {
    await page.locator("#add-todo-input").fill("toggle me");
    await page.getByRole("button", { name: "Add" }).click();
    await waitForFsAssertion(page, "todos/add-item", {
      match: (a) => a.status === "passed",
    });
    await resetCapturedAssertions(page);

    // The toggle button lives inside the newly-appended li. Click it and
    // expect the turbo_stream.replace response to produce a new li with
    // `completed:true` in its classlist.
    await page.locator(".toggle-btn").first().click();

    const payload = await waitForFsAssertion(page, "todos/toggle-complete", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("added");
  });

  test("todos/remove-item — Turbo Stream remove pulls the li out of the list", async ({
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
    // The harness starts empty (Store.reset via container restart) so
    // the empty-state section is present on initial render. Force a
    // fresh navigation so the mount trigger captures it.
    await page.goto("/");
    await page.waitForTimeout(400);

    const payload = await waitForFsAssertion(page, "layout/empty-state-shown", {
      match: (a) => a.status === "passed",
    });
    expect(payload.assertion_type).toBe("visible");
  });

  test("todos/count-updated — OOB triggered by a Turbo Stream add", async ({
    page,
  }) => {
    await page.locator("#add-todo-input").fill("count this");
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
    // Invariants only emit on failure or recovery (see
    // src/assertions/assertion.ts:144-148). Force a violation by
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
