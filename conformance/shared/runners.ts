/**
 * Shared scenario runners for Layer 2 drivers.
 *
 * Each runner here is one scenario from `scenarios.js`. Drivers pick the
 * subset their harness supports, pass a `HarnessConfig`, and the runner
 * executes the full Playwright body: interactions, assertion polling, and
 * payload shape checks. The driver's job shrinks to "declare the scenario
 * keys, pass harness-specific knobs" — framework-specific variance lives
 * in the config, not in duplicated test bodies.
 *
 * Why runners-as-functions and not a `defineHarnessSuite()` shape:
 *   - Drivers keep explicit `test()` blocks, which Playwright's reporter
 *     and the matrix generator both key off of directly.
 *   - Framework-unique scenarios (e.g., Hotwire's morph/status-flip) can
 *     sit alongside shared ones in the same `test.describe` without
 *     fighting a generator abstraction.
 *   - Stack traces point at the runner source, not a generated block.
 *
 * Drift guard: every runner calls `requireScenario(key)` at registration
 * time, so a typo in a scenario key fails fast rather than quietly
 * dropping off the matrix.
 */

import { expect, type Page, type APIRequestContext } from "@playwright/test";
import {
  readCapturedAssertions,
  resetCapturedAssertions,
  waitForFsAssertion,
  type CapturedPayload,
} from "./assertions";
import { requireScenario } from "./scenarios.js";

// ---------------------------------------------------------------------------
// HarnessConfig — the single shape every driver passes to every runner.
// ---------------------------------------------------------------------------

export interface HarnessConfig {
  /** Human-readable harness name. Only used in error messages. */
  name: string;

  /**
   * Optional backend reset hook. Server-rendered frameworks (hotwire, htmx)
   * pass a function that POSTs to a dev-only reset route. SPAs omit it.
   */
  resetBackend?: (
    page: Page,
    request: APIRequestContext
  ) => Promise<void>;

  /**
   * Milliseconds to wait after `page.goto("/")` before the first
   * interaction or assertion. Gives the framework time to boot and the
   * agent's init-time scan to complete before the test touches anything.
   * Default 300ms covers Vite-powered SPAs; Docker-backed Rails needs 400.
   */
  settleMs?: number;

  /**
   * Selector for the toggle-complete interaction. SPAs use the checkbox
   * directly; HTMX/Hotwire wrap the toggle in a button. Default:
   * `.todo-item input[type=checkbox]`.
   */
  toggleSelector?: string;

  /**
   * How to trigger the toggle. Default: `check()` (for checkboxes).
   * Server harnesses override to `click()` on the wrapper button.
   */
  toggleAction?: "check" | "click";

  /**
   * Expected `assertion_type` on the toggle-complete payload. Default
   * `"updated"` — the mutation lands on the same element. Hotwire's
   * Turbo Stream replace produces `"added"` because the element is a
   * fresh insertion, not a mutation.
   */
  toggleExpectedType?: "updated" | "added";

  /**
   * Allowed `assertion_type` values on the add-item success payload.
   * SPAs have a mutex between an `added` and an `emitted` variant, so
   * either can win. Server harnesses only declare `added`. Default:
   * `["added", "emitted"]`.
   */
  addItemAllowedTypes?: string[];

  /**
   * Optional post-navigation hook run AFTER `settleMs` but BEFORE
   * resetting the captured-assertion buffer. Use for harnesses with
   * a deterministic "framework is ready" signal that's more robust
   * than a fixed timeout — e.g., Astro's React island sets
   * `window.__faultsenseIslandHydrated = true` from a top-level
   * `useEffect`, and this hook polls for it. If a harness doesn't
   * have a clean signal, leave it unset and tune `settleMs`.
   */
  waitForReady?: (page: Page) => Promise<void>;
}

type Runner = (page: Page, config: HarnessConfig) => Promise<void>;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function toggleLocator(page: Page, config: HarnessConfig) {
  const selector =
    config.toggleSelector ?? ".todo-item input[type=checkbox]";
  return page.locator(selector).first();
}

async function triggerToggle(page: Page, config: HarnessConfig) {
  const locator = toggleLocator(page, config);
  const action = config.toggleAction ?? "check";
  if (action === "check") {
    await locator.check();
  } else {
    await locator.click();
  }
}

async function addTodoAndWait(page: Page, text: string) {
  await page.locator("#add-todo-input").fill(text);
  await page.getByRole("button", { name: "Add" }).click();
  await waitForFsAssertion(page, "todos/add-item", {
    match: (a) => a.status === "passed",
  });
}

// ---------------------------------------------------------------------------
// Per-scenario runners. Each one pins itself to a registry entry so typos
// fail fast.
// ---------------------------------------------------------------------------

const addItem: Runner = async (page, config) => {
  requireScenario("todos/add-item");

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

  const allowed = config.addItemAllowedTypes ?? ["added", "emitted"];
  expect(allowed).toContain(payload.assertion_type);

  // The error variant must never reach the collector — mutex="conditions"
  // dismisses whichever branch loses the race.
  const all = await readCapturedAssertions(page);
  const errors = all.filter(
    (a: CapturedPayload) =>
      a.assertion_key === "todos/add-item" && a.condition_key === "error"
  );
  expect(errors).toEqual([]);
};

const toggleComplete: Runner = async (page, config) => {
  requireScenario("todos/toggle-complete");

  await addTodoAndWait(page, "read book");
  await page.waitForSelector(".todo-item");
  await resetCapturedAssertions(page);

  await triggerToggle(page, config);

  const payload = await waitForFsAssertion(page, "todos/toggle-complete", {
    match: (a) => a.status === "passed",
  });
  const expected = config.toggleExpectedType ?? "updated";
  expect(payload.assertion_type).toBe(expected);
};

const removeItem: Runner = async (page) => {
  requireScenario("todos/remove-item");

  await addTodoAndWait(page, "delete me");
  await page.waitForSelector(".todo-item");
  await resetCapturedAssertions(page);

  await page.locator(".remove-btn").first().click();

  const payload = await waitForFsAssertion(page, "todos/remove-item", {
    match: (a) => a.status === "passed",
  });
  expect(payload.assertion_type).toBe("removed");
};

const editItem: Runner = async (page) => {
  requireScenario("todos/edit-item");

  await addTodoAndWait(page, "edit me");
  await page.waitForSelector(".todo-item");
  await resetCapturedAssertions(page);

  await page.locator(".edit-first").click();

  const payload = await waitForFsAssertion(page, "todos/edit-item", {
    match: (a) => a.status === "passed",
  });
  expect(payload.assertion_type).toBe("added");
};

const charCountUpdated: Runner = async (page) => {
  requireScenario("todos/char-count-updated");

  await page.locator("#add-todo-input").fill("hi");

  const payload = await waitForFsAssertion(page, "todos/char-count-updated", {
    match: (a) => a.status === "passed",
  });
  expect(payload.assertion_type).toBe("visible");
};

const emptyStateShown: Runner = async (page, config) => {
  requireScenario("layout/empty-state-shown");

  // Empty state is rendered on initial mount. Re-navigate so the mount
  // trigger captures it after the beforeEach reset.
  await page.goto("/");
  await page.waitForTimeout(config.settleMs ?? 300);
  if (config.waitForReady) {
    await config.waitForReady(page);
  }

  const payload = await waitForFsAssertion(page, "layout/empty-state-shown", {
    match: (a) => a.status === "passed",
  });
  expect(payload.assertion_type).toBe("visible");
};

const countUpdated: Runner = async (page) => {
  requireScenario("todos/count-updated");

  await page.locator("#add-todo-input").fill("count me");
  await page.getByRole("button", { name: "Add" }).click();

  const payload = await waitForFsAssertion(page, "todos/count-updated", {
    match: (a) => a.status === "passed",
  });
  expect(payload.assertion_type).toBe("visible");
  expect(payload.assertion_trigger).toBe("oob");
};

const advanceAfterAdd: Runner = async (page) => {
  requireScenario("guide/advance-after-add");

  await addTodoAndWait(page, "prereq");
  await resetCapturedAssertions(page);

  await page.locator(".advance-btn").click();

  const payload = await waitForFsAssertion(page, "guide/advance-after-add", {
    match: (a) => a.status === "passed",
  });
  expect(payload.assertion_type).toBe("after");
};

const logUpdated: Runner = async (page) => {
  requireScenario("actions/log-updated");

  await page.locator("#add-todo-input").fill("log this");
  await page.getByRole("button", { name: "Add" }).click();

  const payload = await waitForFsAssertion(page, "actions/log-updated", {
    match: (a) => a.status === "passed",
  });
  expect(payload.assertion_type).toBe("added");
  expect(payload.assertion_trigger).toBe("event:action-logged");
};

const titleVisible: Runner = async (page) => {
  requireScenario("layout/title-visible");

  // Invariants only emit on failure or recovery (see
  // src/assertions/assertion.ts:144-148). Force a violation by hiding
  // the title from the outside.
  await page.evaluate(() => {
    const el = document.getElementById("app-title");
    if (el) (el as HTMLElement).style.display = "none";
  });

  const payload = await waitForFsAssertion(page, "layout/title-visible", {
    match: (a) => a.status === "failed",
  });
  expect(payload.assertion_trigger).toBe("invariant");
};

const morphStatusFlip: Runner = async (page) => {
  requireScenario("morph/status-flip");

  // The harness renders a form whose submit handler is patched by
  // morphdom/idiomorph (Turbo 8) or an equivalent in-place patcher.
  // After click, #morph-status should flip its class+text without the
  // element losing its DOM identity.
  await page.locator(".morph-submit").click();

  const payload = await waitForFsAssertion(page, "morph/status-flip", {
    match: (a) => a.status === "passed",
  });
  // PAT-04 signal: `updated` resolves ONLY when the mutation lands on
  // updatedElements — i.e., the target kept its DOM identity. If the
  // framework fell back to an outerHTML swap (PAT-03), `updated` would
  // stay pending.
  expect(payload.assertion_type).toBe("updated");
};

const hydrationIslandMount: Runner = async (page, config) => {
  requireScenario("hydration/island-mount");

  // A server-rendered element with a mount trigger sits inside an
  // island that the client framework (React, Vue, etc.) hydrates
  // after the agent has already scanned the DOM. PAT-09 expects the
  // mount payload to land exactly once — the agent must not re-fire
  // on the hydration mutation batch, and must not lose the assertion
  // if hydration briefly detaches-and-reattaches the element.
  //
  // Re-navigate so the scenario starts from a freshly-mounted page
  // regardless of what the beforeEach did, then give hydration time
  // to settle before we count payloads.
  await page.goto("/");
  await page.waitForTimeout(config.settleMs ?? 500);
  if (config.waitForReady) {
    await config.waitForReady(page);
  }
  // Extra grace for the framework's reactive effects to flush.
  await page.waitForTimeout(200);

  const payload = await waitForFsAssertion(page, "hydration/island-mount", {
    match: (a) => a.status === "passed",
  });
  expect(payload.assertion_type).toBe("visible");
  expect(payload.assertion_trigger).toBe("mount");

  const all = await readCapturedAssertions(page);
  const hydrationFires = all.filter(
    (a: CapturedPayload) => a.assertion_key === "hydration/island-mount"
  );
  // Mount assertions resolve once per trigger. If the agent double-
  // fires on hydration (treating the island's reactive attachment as
  // a fresh insertion), or if sibling dismissal quietly re-emits,
  // this count goes up. One is the only acceptable answer.
  expect(hydrationFires).toHaveLength(1);
};

// ---------------------------------------------------------------------------
// Registry export — drivers pick runners by scenario key.
// ---------------------------------------------------------------------------

export const runners = {
  "todos/add-item": addItem,
  "todos/toggle-complete": toggleComplete,
  "todos/remove-item": removeItem,
  "todos/edit-item": editItem,
  "todos/char-count-updated": charCountUpdated,
  "layout/empty-state-shown": emptyStateShown,
  "todos/count-updated": countUpdated,
  "guide/advance-after-add": advanceAfterAdd,
  "actions/log-updated": logUpdated,
  "layout/title-visible": titleVisible,
  "morph/status-flip": morphStatusFlip,
  "hydration/island-mount": hydrationIslandMount,
} as const satisfies Record<string, Runner>;

export type ScenarioKey = keyof typeof runners;

/**
 * Convenience helper for a driver's `test.beforeEach`. Hits the optional
 * backend reset endpoint, navigates to `/`, waits for the framework to
 * boot (fixed `settleMs` + optional `waitForReady` hook), then clears
 * the captured-assertion buffer so the test starts from a clean slate.
 */
export async function standardBeforeEach(
  page: Page,
  request: APIRequestContext,
  config: HarnessConfig
): Promise<void> {
  if (config.resetBackend) {
    await config.resetBackend(page, request);
  }
  await page.goto("/");
  await page.waitForTimeout(config.settleMs ?? 300);
  if (config.waitForReady) {
    await config.waitForReady(page);
  }
  await resetCapturedAssertions(page);
}
