/**
 * Layer 2 driver — HTMX 2 + Express/EJS harness.
 *
 * Drives conformance/htmx/ — a minimal Express + EJS app that exercises
 * HTMX's hx-* attribute surface (hx-post, hx-patch, hx-delete) with
 * outerHTML swaps, hx-swap="delete", and hx-swap-oob for multi-region
 * updates. HTMX is language-agnostic, so a Node backend is a faithful
 * harness — the Turbo-specific Rails helpers live in conformance/hotwire/.
 */

import { test } from "@playwright/test";
import {
  runners,
  standardBeforeEach,
  type HarnessConfig,
} from "../shared/runners";

const config: HarnessConfig = {
  name: "htmx",
  // HTMX wraps the toggle action in a `.toggle-btn` form button, not a
  // checkbox. The hx-patch response swaps via outerHTML which lands on
  // `updatedElements` (ID selector match) rather than the raw element
  // identity. Still an `updated` assertion-type.
  toggleSelector: ".toggle-btn",
  toggleAction: "click",
  toggleExpectedType: "updated",
  addItemAllowedTypes: ["added"],
  resetBackend: async (_page, request) => {
    await request.post("/todos/reset");
  },
};

test.describe("htmx harness", () => {
  test.beforeEach(async ({ page, request }) => {
    await standardBeforeEach(page, request, config);
  });

  test("todos/add-item — HTMX post + swap-oob produces a passing success variant", ({
    page,
  }) => runners["todos/add-item"](page, config));

  test("todos/toggle-complete — hx-patch + outerHTML swap resolves via updated+ID", ({
    page,
  }) => runners["todos/toggle-complete"](page, config));

  test("todos/remove-item — hx-delete pulls the li out of the list", ({
    page,
  }) => runners["todos/remove-item"](page, config));

  test("todos/char-count-updated — input trigger + text-matches on the counter span", ({
    page,
  }) => runners["todos/char-count-updated"](page, config));

  test("layout/empty-state-shown — mount trigger on server-rendered empty state", ({
    page,
  }) => runners["layout/empty-state-shown"](page, config));

  test("todos/count-updated — OOB triggered by hx-swap-oob on add", ({
    page,
  }) => runners["todos/count-updated"](page, config));

  test("layout/title-visible — invariant reports failure if the title is hidden", ({
    page,
  }) => runners["layout/title-visible"](page, config));
});
