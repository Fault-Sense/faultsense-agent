// @vitest-environment jsdom

/**
 * PAT-07 — Microtask batching
 *
 * Catalog: docs/mutation-patterns.md#pat-07-microtask-batching
 *
 * Multiple independent mutations arrive in a single MutationObserver
 * callback because they were produced synchronously (queueMicrotask,
 * React 18 automatic batching, Vue nextTick). `handleMutations` at
 * src/assertions/manager.ts:249-283 fans the full record batch through
 * mutationHandler so every pending assertion sees every record.
 *
 * This test locks in that: assertion A resolving from record 1 must not
 * prevent assertion B (on a different element) from resolving from
 * record 2 in the same callback.
 *
 * Representative frameworks: React 18 automatic batching, Vue 3 nextTick,
 * Preact signals, Lit async updates, any code path using queueMicrotask
 * or microtask-batched scheduling.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";

describe("PAT-07 microtask batching", () => {
  let ctx: ReturnType<typeof setupAgent>;

  beforeEach(() => {
    ctx = setupAgent();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("two synchronous mutations in one batch resolve two independent assertions", async () => {
    document.body.innerHTML = `
      <div id="target-a" class="idle">A</div>
      <div id="target-b">before</div>
      <button fs-trigger="click"
        fs-assert="batch/primary"
        fs-assert-updated="#target-a[classlist=active:true]">Primary</button>
      <div
        fs-assert="batch/secondary"
        fs-assert-oob="batch/primary"
        fs-assert-updated="#target-b[text-matches=after]">
        OOB watcher
      </div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Two sync mutations → one MutationObserver callback with two records.
      document.getElementById("target-a")!.classList.add("active");
      (document.getElementById("target-b")!.firstChild as Text).nodeValue =
        "after";
    });

    button.click();

    await vi.waitFor(() => {
      const all = ctx.allPayloads();
      expect(all).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "batch/primary",
            status: "passed",
          }),
          expect.objectContaining({
            assertionKey: "batch/secondary",
            status: "passed",
          }),
        ])
      );
    });
  });

  it("three sync mutations in one batch all resolve their corresponding assertions", async () => {
    document.body.innerHTML = `
      <div id="a" class="idle"></div>
      <div id="b" data-state="draft"></div>
      <div id="c">old</div>
      <button fs-trigger="click"
        fs-assert="triple/a"
        fs-assert-updated="#a[classlist=done:true]">Fire</button>
      <div
        fs-assert="triple/b"
        fs-assert-oob="triple/a"
        fs-assert-updated="#b[data-state=published]">b watcher</div>
      <div
        fs-assert="triple/c"
        fs-assert-oob="triple/a"
        fs-assert-updated="#c[text-matches=new]">c watcher</div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("a")!.classList.add("done");
      document.getElementById("b")!.setAttribute("data-state", "published");
      (document.getElementById("c")!.firstChild as Text).nodeValue = "new";
    });

    button.click();

    await vi.waitFor(() => {
      const all = ctx.allPayloads();
      expect(
        all.filter((a: any) => a.status === "passed").map((a: any) => a.assertionKey)
      ).toEqual(
        expect.arrayContaining(["triple/a", "triple/b", "triple/c"])
      );
    });
  });
});
