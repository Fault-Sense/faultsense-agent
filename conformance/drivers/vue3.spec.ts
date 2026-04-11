/**
 * Layer 2 driver — Vue 3 + Vite harness.
 *
 * Drives conformance/vue3/ (a minimal purpose-built Vue 3 single-page
 * component that exercises Vue's fine-grained reactivity and nextTick
 * microtask batching) through a real Chromium. Each test delegates to
 * the shared runners in `conformance/shared/runners.ts`.
 *
 * Scope: the full 10-scenario SPA set. The 20-scenario parity with
 * examples/todolist-tanstack/ (auth, routing, offline) is out of scope
 * — that full surface lives in the demo app, not here.
 */

import { test } from "@playwright/test";
import {
  runners,
  standardBeforeEach,
  type HarnessConfig,
} from "../shared/runners";

const config: HarnessConfig = {
  name: "vue3",
};

test.describe("vue3 harness", () => {
  test.beforeEach(async ({ page, request }) => {
    await standardBeforeEach(page, request, config);
  });

  test("todos/add-item — conditional mutex success (added + emitted)", ({
    page,
  }) => runners["todos/add-item"](page, config));

  test("todos/toggle-complete — updated with classlist flip", ({ page }) =>
    runners["todos/toggle-complete"](page, config));

  test("todos/remove-item — removed from v-for list", ({ page }) =>
    runners["todos/remove-item"](page, config));

  test("todos/edit-item — added with focused modifier (v-if render)", ({
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
