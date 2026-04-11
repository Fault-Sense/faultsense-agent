/**
 * Layer 2 driver — Hotwire (Rails 8 + Turbo 8) harness.
 *
 * Drives conformance/hotwire/ — a minimal Rails + turbo-rails app
 * running in a Docker container (see conformance/hotwire/Dockerfile).
 * Each test exercises one Turbo Stream mutation shape against a real
 * Rails response, which is the point of Phase 5: Turbo's wire format
 * and mutation pipeline are what the harness is here to cover. No
 * other harness can do that faithfully.
 */

import { test } from "@playwright/test";
import {
  runners,
  standardBeforeEach,
  type HarnessConfig,
} from "../shared/runners";

const config: HarnessConfig = {
  name: "hotwire",
  // Rails in Docker needs a bit more settle time than the Vite-backed
  // SPAs on every `page.goto` — Turbo boot + Stimulus controller
  // registration runs right before the agent's init scan.
  settleMs: 400,
  // Turbo harness wraps the toggle in a `.toggle-btn` form submit
  // button, not a native checkbox. Click it — check() would look for
  // a checkable element and fail.
  toggleSelector: ".toggle-btn",
  toggleAction: "click",
  // Turbo Stream replace swaps the whole <li>, so the agent sees the
  // toggle outcome as an `added` element, not an `updated` one.
  toggleExpectedType: "added",
  // No `emitted` variant on the Rails harness — the success path is a
  // pure DOM append via Turbo Stream.
  addItemAllowedTypes: ["added"],
  resetBackend: async (_page, request) => {
    await request.post("/todos/reset");
  },
};

test.describe("hotwire harness", () => {
  test.beforeEach(async ({ page, request }) => {
    await standardBeforeEach(page, request, config);
  });

  test("todos/add-item — Turbo Stream append produces a passing success variant", ({
    page,
  }) => runners["todos/add-item"](page, config));

  test("todos/toggle-complete — Turbo Stream replace swaps the li with the flipped classlist", ({
    page,
  }) => runners["todos/toggle-complete"](page, config));

  test("todos/remove-item — Turbo Stream remove pulls the li out of the list", ({
    page,
  }) => runners["todos/remove-item"](page, config));

  test("todos/char-count-updated — input trigger + text-matches on the counter span", ({
    page,
  }) => runners["todos/char-count-updated"](page, config));

  test("layout/empty-state-shown — mount trigger on server-rendered empty state", ({
    page,
  }) => runners["layout/empty-state-shown"](page, config));

  test("todos/count-updated — OOB triggered by a Turbo Stream add", ({
    page,
  }) => runners["todos/count-updated"](page, config));

  test("morph/status-flip — Turbo 8 idiomorph patches #morph-status in place (PAT-04 empirical)", ({
    page,
  }) => runners["morph/status-flip"](page, config));

  test("layout/title-visible — invariant reports failure if the title is hidden", ({
    page,
  }) => runners["layout/title-visible"](page, config));
});
