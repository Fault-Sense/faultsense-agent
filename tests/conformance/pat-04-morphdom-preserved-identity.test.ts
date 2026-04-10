// @vitest-environment jsdom

/**
 * PAT-04 — morphdom preserved-identity
 *
 * Catalog: docs/mutation-patterns.md#pat-04-morphdom-preserved-identity
 *
 * Target node identity is preserved while attributes and/or children are
 * patched in place. The resulting mutation records are `attributes` or
 * `characterData`, not `childList` swaps. `src/processors/mutations.ts:7-53`
 * promotes attribute record targets into `updatedElements` and characterData
 * record parents into `updatedElements`, so `updated` assertions with
 * classlist / attribute / text-matches modifiers resolve correctly.
 *
 * Representative frameworks: Livewire, Turbo 8 morphing (refresh="morph"),
 * Alpine x-html.morph, idiomorph, any diff-based DOM patcher that prioritizes
 * identity preservation over wholesale replacement.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";

describe("PAT-04 morphdom preserved-identity", () => {
  let ctx: ReturnType<typeof setupAgent>;

  beforeEach(() => {
    ctx = setupAgent();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("updated matches on classList toggle via setAttribute", async () => {
    document.body.innerHTML = `
      <div id="card" class="todo-item">Ship it</div>
      <button fs-trigger="click"
        fs-assert="todos/morph-complete"
        fs-assert-updated=".todo-item[classlist=completed:true]">
        Complete
      </button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Morph-style in-place mutation: same node identity, new class.
      document.getElementById("card")!.classList.add("completed");
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assertionKey: "todos/morph-complete",
            status: "passed",
          }),
        ],
        ctx.config
      )
    );
  });

  it("updated matches on an arbitrary attribute patch", async () => {
    document.body.innerHTML = `
      <div id="card" data-status="draft">Doc</div>
      <button fs-trigger="click"
        fs-assert="doc/publish"
        fs-assert-updated="#card[data-status=published]">Publish</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("card")!.setAttribute("data-status", "published");
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        ctx.config
      )
    );
  });

  it("updated on a nested descendant still resolves when an ancestor is morphed around it", async () => {
    document.body.innerHTML = `
      <section id="wrapper">
        <header>Title</header>
        <article id="body" data-read="false">Content</article>
      </section>
      <button fs-trigger="click"
        fs-assert="article/mark-read"
        fs-assert-updated="#body[data-read=true]">Mark read</button>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Morph the ancestor's attribute (simulates morph patching the parent)
      // then mutate the child's attribute (the one the assertion targets).
      document.getElementById("wrapper")!.setAttribute("data-version", "2");
      document.getElementById("body")!.setAttribute("data-read", "true");
    });

    button.click();

    await vi.waitFor(() =>
      expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
        [expect.objectContaining({ status: "passed" })],
        ctx.config
      )
    );
  });
});
