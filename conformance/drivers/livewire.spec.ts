/**
 * Layer 2 driver — Livewire 3 (Laravel 11) harness.
 *
 * Drives conformance/livewire/ — a minimal Laravel 11 app served by
 * `php artisan serve` inside a Docker container (see
 * conformance/livewire/Dockerfile). A single Livewire 3 component
 * exercises the shared server-rendered scenario set, and every
 * interaction goes through Livewire's wire:* round trip → server
 * re-render → @alpinejs/morph DOM patch pipeline. The morph patcher
 * preserves element identity on updates, which is the empirical
 * PAT-04 signal captured by the `morph/status-flip` scenario.
 *
 * Unlike Hotwire (which uses Turbo Stream outerHTML swaps by default
 * and only exercises morph on the explicit `method: :morph` endpoint),
 * Livewire 3 uses morph for ALL updates — so `todos/toggle-complete`
 * ALSO lands via morph. We still route `todos/toggle-complete` through
 * the `"updated"` assertion type here to reflect that reality and
 * keep the matrix column honest.
 */

import { test } from "@playwright/test";
import {
  runners,
  standardBeforeEach,
  type HarnessConfig,
} from "../shared/runners";

const config: HarnessConfig = {
  name: "livewire",
  // Docker-backed PHP dev server + Livewire boot + the agent's init
  // scan all need to complete before the first interaction. Matches
  // hotwire's 400ms budget.
  settleMs: 400,
  // Livewire wraps the toggle in a `.toggle-btn` button — there's no
  // native checkbox because the component re-renders the whole <li>
  // on state change and controlled inputs would fight morph.
  toggleSelector: ".toggle-btn",
  toggleAction: "click",
  // Livewire's @alpinejs/morph patches the existing <li>'s class in
  // place (wire:key keeps its DOM identity across re-renders), so the
  // mutation lands on updatedElements — not the `added` path that
  // Hotwire's Turbo Stream replace takes.
  toggleExpectedType: "updated",
  // No `emitted` variant in the Livewire form — the success path is
  // a pure server-driven DOM append via morph.
  addItemAllowedTypes: ["added"],
  resetBackend: async (_page, request) => {
    await request.post("/todos/reset");
  },
};

test.describe("livewire harness", () => {
  test.beforeEach(async ({ page, request }) => {
    await standardBeforeEach(page, request, config);
  });

  test("todos/add-item — Livewire wire:submit produces a passing success variant", ({
    page,
  }) => runners["todos/add-item"](page, config));

  test("todos/toggle-complete — @alpinejs/morph patches classlist in place (PAT-04 empirical)", ({
    page,
  }) => runners["todos/toggle-complete"](page, config));

  test("todos/remove-item — morph removes the <li> from the keyed list", ({
    page,
  }) => runners["todos/remove-item"](page, config));

  test("todos/char-count-updated — wire:model.live + text-matches on the counter span", ({
    page,
  }) => runners["todos/char-count-updated"](page, config));

  test("layout/empty-state-shown — mount trigger on server-rendered empty state", ({
    page,
  }) => runners["layout/empty-state-shown"](page, config));

  test("todos/count-updated — OOB triggered by every Livewire re-render", ({
    page,
  }) => runners["todos/count-updated"](page, config));

  test("morph/status-flip — Livewire's morph patches #morph-status in place (PAT-04 empirical)", ({
    page,
  }) => runners["morph/status-flip"](page, config));

  test("layout/title-visible — invariant reports failure if the title is hidden", ({
    page,
  }) => runners["layout/title-visible"](page, config));
});
