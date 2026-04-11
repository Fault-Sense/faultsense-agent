/**
 * Layer 2 driver — Svelte 5 (runes mode) + Vite harness.
 *
 * Drives conformance/svelte/ — a minimal purpose-built Svelte 5 single-
 * page component exercising Svelte's signal-based fine-grained
 * reactivity and compile-time-optimized updates. Each test delegates
 * to the shared runners in `conformance/shared/runners.ts`.
 */

import { test } from "@playwright/test";
import {
  runners,
  standardBeforeEach,
  type HarnessConfig,
} from "../shared/runners";

const config: HarnessConfig = {
  name: "svelte",
};

test.describe("svelte harness", () => {
  test.beforeEach(async ({ page, request }) => {
    await standardBeforeEach(page, request, config);
  });

  test("todos/add-item — conditional mutex success (added + emitted)", ({
    page,
  }) => runners["todos/add-item"](page, config));

  test("todos/toggle-complete — updated with classlist flip", ({ page }) =>
    runners["todos/toggle-complete"](page, config));

  test("todos/remove-item — removed from keyed each-block", ({ page }) =>
    runners["todos/remove-item"](page, config));

  test("todos/edit-item — added with focused modifier ({#if} render)", ({
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
