/**
 * Layer 2 driver — Alpine.js 3 + static Express harness.
 *
 * Drives conformance/alpine/ — a purely client-side Alpine harness
 * (no backend logic, just static file serving) that exercises
 * Alpine's x-data + x-for + x-show directives. Alpine's reactivity
 * model is one of the smallest in the matrix, so this harness acts as
 * a sanity floor: if it works on Alpine, it works on anything
 * directive-based. Each test delegates to the shared runners in
 * `conformance/shared/runners.ts`.
 */

import { test } from "@playwright/test";
import {
  runners,
  standardBeforeEach,
  type HarnessConfig,
} from "../shared/runners";

const config: HarnessConfig = {
  // Alpine loads from CDN with `defer` and runs its first mount at
  // DOMContentLoaded, which can lag behind Vite-backed SPAs. Bump the
  // settle wait so the agent's init-time scan sees the rendered DOM.
  name: "alpine",
  settleMs: 400,
};

test.describe("alpine harness", () => {
  test.beforeEach(async ({ page, request }) => {
    await standardBeforeEach(page, request, config);
  });

  test("todos/add-item — conditional mutex success (added + emitted)", ({
    page,
  }) => runners["todos/add-item"](page, config));

  test("todos/toggle-complete — updated with classlist flip", ({ page }) =>
    runners["todos/toggle-complete"](page, config));

  test("todos/remove-item — removed from x-for block", ({ page }) =>
    runners["todos/remove-item"](page, config));

  test("todos/edit-item — added with focused modifier (x-show branch)", ({
    page,
  }) => runners["todos/edit-item"](page, config));

  test("todos/char-count-updated — input trigger + text-matches", ({ page }) =>
    runners["todos/char-count-updated"](page, config));

  test("layout/empty-state-shown — mount trigger + visible", ({ page }) =>
    runners["layout/empty-state-shown"](page, config));

  test("todos/count-updated — OOB triggered by add-item", ({ page }) =>
    runners["todos/count-updated"](page, config));

  test("guide/advance-after-add — `after` sequence passes once add-item has passed", ({
    page,
  }) => runners["guide/advance-after-add"](page, config));

  test("actions/log-updated — custom event trigger + added", ({ page }) =>
    runners["actions/log-updated"](page, config));

  test("layout/title-visible — invariant reports failure if the title is hidden", ({
    page,
  }) => runners["layout/title-visible"](page, config));
});
