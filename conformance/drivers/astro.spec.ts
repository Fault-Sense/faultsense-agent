/**
 * Layer 2 driver — Astro 6 (static output, React island) harness.
 *
 * Drives conformance/astro/ — an Astro 6 page whose frontmatter is
 * re-run by the dev server on every request and whose body contains a
 * React island hydrated under `client:load`. This is the matrix's
 * empirical PAT-09 (hydration upgrade) probe: the agent scans an
 * SSR-rendered DOM before React hydrates, then React upgrades the
 * island to a reactive surface, and the agent must not double-fire
 * mount triggers or lose pending assertions across that boundary.
 *
 * The 10-scenario SPA set runs inside the island exactly as it would
 * against a plain React 19 app. The `hydration/island-mount` scenario
 * is unique to this harness and sanity-checks the single-fire rule
 * for mount triggers across hydration.
 */

import { test } from "@playwright/test";
import {
  runners,
  standardBeforeEach,
  type HarnessConfig,
} from "../shared/runners";

const config: HarnessConfig = {
  name: "astro",
  // Astro's dev server + React hydration need a bit more grace than
  // plain Vite SPAs on every `page.goto`: Astro re-SSRs the page,
  // React hydrates the island, then the agent's init scan runs. The
  // fixed wait only exists to give slow machines a head start; the
  // deterministic sync point is `waitForReady` below, which blocks
  // on the post-hydration marker set by TodoApp's top-level
  // `useEffect`. Without this, `click()` in the first test can land
  // before React has attached onClick and the handler never runs.
  settleMs: 500,
  waitForReady: async (page) => {
    await page.waitForFunction(
      () => (window as typeof window & { __faultsenseIslandHydrated?: boolean })
        .__faultsenseIslandHydrated === true,
      undefined,
      { timeout: 10_000 }
    );
  },
};

test.describe("astro harness", () => {
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

  test("layout/empty-state-shown — mount trigger on SSR-rendered empty state", ({
    page,
  }) => runners["layout/empty-state-shown"](page, config));

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

  test("hydration/island-mount — mount fires exactly once across hydration (PAT-09 empirical)", ({
    page,
  }) => runners["hydration/island-mount"](page, config));
});
