/**
 * Layer 2 driver — Phoenix LiveView 1.0 (Elixir 1.17) harness.
 *
 * Drives conformance/liveview/ — a minimal Phoenix 1.7 app running
 * inside a Docker container (see conformance/liveview/Dockerfile).
 * Every user interaction bounces through the LiveView WebSocket:
 * the server re-renders the HEEx template, diffs against the old
 * render, and streams the patch back to the client where
 * phoenix_live_view's morphdom patches the DOM in place. That
 * in-place patching is the empirical PAT-04 signal captured by
 * `todos/toggle-complete` and `morph/status-flip`.
 *
 * Unlike Hotwire (Turbo Stream outerHTML swaps by default, morph
 * only on the explicit `method: :morph` endpoint), LiveView uses
 * morphdom for EVERY update — so `todos/toggle-complete` lands on
 * `updatedElements` the same way Livewire's @alpinejs/morph does.
 */

import { test } from "@playwright/test";
import {
  runners,
  standardBeforeEach,
  type HarnessConfig,
} from "../shared/runners";

const config: HarnessConfig = {
  name: "liveview",
  // Phoenix has to boot Bandit + open the LiveView WebSocket before
  // the first interaction. Erlang VM cold-start is a bit slower than
  // other harnesses on page navigation, and the LiveView client needs
  // time to finish its initial `connect()` handshake before phx-click
  // events actually fire. Matches hotwire's budget with a small bump.
  settleMs: 500,
  toggleSelector: ".toggle-btn",
  toggleAction: "click",
  // Morphdom patches the existing <li>'s class in place — not the
  // outerHTML swap path Hotwire takes — so the mutation lands on
  // updatedElements and the assertion resolves with type "updated".
  toggleExpectedType: "updated",
  // No `emitted` variant on the LiveView form — success is a pure
  // server-driven morph append.
  addItemAllowedTypes: ["added"],
  resetBackend: async (_page, request) => {
    await request.post("/todos/reset");
  },
};

test.describe("liveview harness", () => {
  test.beforeEach(async ({ page, request }) => {
    await standardBeforeEach(page, request, config);
  });

  test("todos/add-item — phx-submit + Store.add produces a passing success variant", ({
    page,
  }) => runners["todos/add-item"](page, config));

  test("todos/toggle-complete — morphdom patches classlist in place (PAT-04 empirical)", ({
    page,
  }) => runners["todos/toggle-complete"](page, config));

  test("todos/remove-item — morphdom removes the <li> from the keyed list", ({
    page,
  }) => runners["todos/remove-item"](page, config));

  test("todos/char-count-updated — phx-change + text-matches on the counter span", ({
    page,
  }) => runners["todos/char-count-updated"](page, config));

  test("layout/empty-state-shown — mount trigger on server-rendered empty state", ({
    page,
  }) => runners["layout/empty-state-shown"](page, config));

  test("todos/count-updated — OOB triggered by every LiveView re-render", ({
    page,
  }) => runners["todos/count-updated"](page, config));

  test("morph/status-flip — LiveView's morphdom patches #morph-status in place (PAT-04 empirical)", ({
    page,
  }) => runners["morph/status-flip"](page, config));

  test("layout/title-visible — invariant reports failure if the title is hidden", ({
    page,
  }) => runners["layout/title-visible"](page, config));
});
