/**
 * Layer 2 driver — React 19 + Vite harness.
 *
 * Drives conformance/react/ — a minimal purpose-built React 19 single-
 * page component that exercises React's reconciliation, hooks state,
 * keyed list updates, and conditional rendering. Each test delegates
 * the body to the shared runners in `conformance/shared/runners.ts`;
 * this file only declares the harness config and the scenario list it
 * supports.
 *
 * Scope: the full 10-scenario SPA set. Plain React 19 — no router, no
 * SSR, no TanStack Start. TanStack-specific quirks (HMR double-init,
 * SSR hydration) are out of scope; the full-stack example at
 * examples/todolist-tanstack/ stays in place as a marketing/manual
 * demo and is no longer driven by the conformance suite.
 */

import { test } from "@playwright/test";
import {
  runners,
  standardBeforeEach,
  type HarnessConfig,
} from "../shared/runners";

const config: HarnessConfig = {
  name: "react",
};

test.describe("react harness", () => {
  test.beforeEach(async ({ page, request }) => {
    await standardBeforeEach(page, request, config);
  });

  test("todos/add-item — conditional mutex success (added + emitted)", ({
    page,
  }) => runners["todos/add-item"](page, config));

  test("todos/toggle-complete — updated with classlist flip", ({ page }) =>
    runners["todos/toggle-complete"](page, config));

  test("todos/remove-item — removed from keyed list", ({ page }) =>
    runners["todos/remove-item"](page, config));

  test("todos/edit-item — added with focused modifier (conditional render)", ({
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
