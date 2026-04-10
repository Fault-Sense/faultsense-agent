// @vitest-environment jsdom

/**
 * PAT-09 — Hydration upgrade
 *
 * Catalog: docs/mutation-patterns.md#pat-09-hydration-upgrade
 *
 * SSR-rendered nodes gain attributes, event listeners, or children when
 * the client hydrates. Element identity is preserved across hydration.
 *
 * Two behaviors locked in here:
 *
 * 1. Invariants watch perpetually, so they correctly catch the state
 *    after hydration — the invariant can start violated (unhydrated) and
 *    recover (hydrated), or start holding and get violated later.
 *
 * 2. `mount` triggers must fire only on true DOM insertion. An element
 *    that is already present at init time and then has its attributes
 *    mutated during hydration must NOT re-fire its mount trigger — the
 *    agent processes mount elements once (see src/index.ts:78-86, which
 *    scans for pre-existing mount elements at init).
 *
 * Representative frameworks: Next.js App Router, Remix, Astro, SvelteKit,
 * Nuxt, any SSR framework with a client hydration pass.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";

describe("PAT-09 hydration upgrade", () => {
  let ctx: ReturnType<typeof setupAgent>;

  beforeEach(() => {
    ctx = setupAgent({ fakeTimers: false, deferInit: true });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("invariant stays pending through hydration attribute mutations (no spurious failure)", async () => {
    // SSR renders the button in place. The invariant watches it perpetually.
    // The hydration pass mutates attributes on the same identity — this must
    // NOT produce a failure payload, because the condition still holds.
    // Invariants only commit on failure or recovery (see src/assertions/
    // assertion.ts:144-148); a pure pass stays pending.
    document.body.innerHTML = `
      <button id="btn" class="unhydrated">Click</button>
      <div id="watcher"
        fs-assert="layout/button-present"
        fs-trigger="invariant"
        fs-assert-visible="#btn">Watching</div>
    `;
    ctx.init();

    // Client hydration pass: mutate attributes on the same node.
    const btn = document.getElementById("btn")!;
    btn.classList.remove("unhydrated");
    btn.classList.add("hydrated");
    btn.setAttribute("data-hydrated", "true");

    // Let the mutation observer + resolver chain run.
    await new Promise((r) => setTimeout(r, 50));

    const failures = ctx.allPayloads().filter(
      (a: any) =>
        a.assertionKey === "layout/button-present" && a.status === "failed"
    );
    expect(failures).toHaveLength(0);
  });

  it("invariant with a count modifier reports failure when hydration violates the count", async () => {
    // SSR renders 2 items. Invariant asserts count=2. Hydration adds a
    // stray item — the count check violates, invariant commits failure.
    document.body.innerHTML = `
      <ul id="list">
        <li class="item">one</li>
        <li class="item">two</li>
      </ul>
      <div id="watcher"
        fs-assert="layout/item-count"
        fs-trigger="invariant"
        fs-assert-visible=".item[count=2]">Watching</div>
    `;
    ctx.init();

    // Hydration appends an extra item, breaking the count invariant.
    const extra = document.createElement("li");
    extra.className = "item";
    document.getElementById("list")!.appendChild(extra);

    await vi.waitFor(() => {
      const all = ctx.allPayloads();
      expect(all).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assertionKey: "layout/item-count",
            status: "failed",
          }),
        ])
      );
    });
  });

  it("mount trigger on a pre-existing element fires exactly once, not again during hydration attribute mutation", async () => {
    // SSR renders the element WITH the mount-triggered fs-assert already attached.
    document.body.innerHTML = `
      <div id="widget"
        class="unhydrated"
        data-state="ssr"
        fs-assert="widget/mounted"
        fs-trigger="mount"
        fs-assert-visible="#widget">widget</div>
    `;
    ctx.init();

    // Wait for the initial mount trigger to resolve (from the init-time scan).
    await vi.waitFor(() => {
      const all = ctx.allPayloads();
      expect(
        all.filter(
          (a: any) =>
            a.assertionKey === "widget/mounted" && a.status === "passed"
        ).length
      ).toBeGreaterThanOrEqual(1);
    });

    const callsAfterMount = ctx.sendToCollectorSpy.mock.calls.length;

    // Client hydration pass: attribute/class updates on the SAME identity.
    const widget = document.getElementById("widget")!;
    widget.classList.remove("unhydrated");
    widget.classList.add("hydrated");
    widget.setAttribute("data-state", "hydrated");

    // Give the MutationObserver and microtask chain a chance to process.
    await new Promise((r) => setTimeout(r, 30));

    // No new mount-trigger payloads: hydration mutations are attribute-only
    // and mount only fires on true insertion.
    const afterHydration = ctx.sendToCollectorSpy.mock.calls.length;
    const newPayloads = ctx
      .allPayloads()
      .slice(callsAfterMount) // treat the slice as "calls after the initial mount"
      .filter(
        (a: any) =>
          a.assertionKey === "widget/mounted" && a.status === "passed"
      );
    expect(newPayloads.length).toBe(0);
    // Also: no extra sendToCollector invocations were triggered by hydration.
    expect(afterHydration).toBe(callsAfterMount);
  });
});
