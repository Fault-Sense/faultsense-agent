// @vitest-environment jsdom

/**
 * Debug-mode warning: when the target selector matches elements but every
 * matching element fails a modifier check, the assertion stays pending (wait-
 * for-pass semantics). In debug mode the agent emits a console.warn so users
 * can distinguish "no matches" from "matches but modifier eliminated them" —
 * the latter is usually a symptom of quoted selector values, regex typos, or
 * stale expectations. The Vue 3 quoted-attribute bug (commit e3550f9) was
 * exactly this shape and took hours to diagnose because the agent was silent.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { setupAgent } from "../helpers/assertions";

describe("debug-mode no-match modifier warning", () => {
  let ctx: ReturnType<typeof setupAgent>;

  afterEach(() => {
    ctx?.cleanup();
  });

  it("warns when matching elements fail the modifier check (debug=true)", async () => {
    ctx = setupAgent({ config: { debug: true } });
    const warnSpy = vi.spyOn(console, "warn");

    document.body.innerHTML = `
      <button
        fs-assert="modifier/stays-loading"
        fs-trigger="click"
        fs-assert-updated="#status[text-matches=Done]">Click</button>
      <div id="status">Idle</div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      // Trigger a mutation that matches the selector but NOT the text-matches
      // modifier. The resolver should find the element, fail the modifier, and
      // emit a debug warning while keeping the assertion pending.
      document.getElementById("status")!.textContent = "Loading";
    });

    button.click();

    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("modifier/stays-loading")
      );
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("no element satisfied all modifiers")
    );
  });

  it("stays silent when debug is off", async () => {
    ctx = setupAgent({ config: { debug: false } });
    const warnSpy = vi.spyOn(console, "warn");

    document.body.innerHTML = `
      <button
        fs-assert="modifier/silent"
        fs-trigger="click"
        fs-assert-updated="#status[text-matches=Done]">Click</button>
      <div id="status">Idle</div>
    `;

    const button = document.querySelector("button") as HTMLButtonElement;
    button.addEventListener("click", () => {
      document.getElementById("status")!.textContent = "Loading";
    });

    button.click();

    // Let the mutation observer + microtask queue drain. Using a small tick to
    // ensure any would-be warning has a chance to fire.
    await Promise.resolve();
    await Promise.resolve();

    const matchingCalls = warnSpy.mock.calls.filter((call) =>
      String(call[0] ?? "").includes("modifier/silent")
    );
    expect(matchingCalls).toHaveLength(0);
  });
});
