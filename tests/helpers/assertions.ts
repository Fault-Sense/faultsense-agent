/**
 * Canonical vitest-in-jsdom test harness for the Faultsense agent.
 *
 * Usage:
 *   import { setupAgent } from "../helpers/assertions";
 *
 *   describe("my feature", () => {
 *     let ctx: ReturnType<typeof setupAgent>;
 *     beforeEach(() => { ctx = setupAgent(); });
 *     afterEach(() => { ctx.cleanup(); });
 *
 *     it("works", async () => {
 *       document.body.innerHTML = `<button fs-trigger="click" ...></button>`;
 *       ...
 *       await vi.waitFor(() =>
 *         expect(ctx.sendToCollectorSpy).toHaveBeenCalledWith(
 *           [expect.objectContaining({ status: "passed" })],
 *           ctx.config
 *         )
 *       );
 *     });
 *   });
 *
 * Pre-existing-target pattern (PAT-01): seed the DOM before init()
 * so the MutationObserver does not see pre-existing elements as additions.
 *
 *   const ctx = setupAgent({ deferInit: true });
 *   document.body.innerHTML = `<div class="pre-existing"></div>...`;
 *   ctx.init();
 */
import { vi } from "vitest";
import { init } from "../../src/index";
import * as resolveModule from "../../src/assertions/server";
import type { Configuration } from "../../src/types";

// jsdom has no layout: offsetWidth/offsetHeight are always 0, so the real
// isVisible would return false for every element. Mock it to match real-
// browser semantics (visible unless display:none or visibility:hidden).
// vi.mock is hoisted to the top of this file by the Vitest plugin, so any
// test file that imports from this helper gets the mock registered before
// init() touches the mocked module. Use a plain function (not vi.fn()) so
// per-test vi.restoreAllMocks does not wipe the implementation between tests.
vi.mock("../../src/utils/elements", async () => ({
  ...((await vi.importActual("../../src/utils/elements")) as any),
  isVisible: (element: HTMLElement) =>
    element.style.display !== "none" && element.style.visibility !== "hidden",
}));

/** Fixed `Date.now()` return value for deterministic timestamps. */
export const FIXED_DATE_NOW = 1230000000000;

const DEFAULT_CONFIG: Configuration = {
  apiKey: "test",
  releaseLabel: "test",
  gcInterval: 5000,
  unloadGracePeriod: 2000,
  collectorURL: "http://localhost:9000",
  debug: false,
};

export interface SetupAgentOptions {
  /** Partial config to merge over the defaults. */
  config?: Partial<Configuration>;
  /**
   * When `true`, the helper sets up mocks and spies but does NOT call init().
   * Use this for tests that need to seed the DOM with pre-existing elements
   * before the MutationObserver attaches (see PAT-01 pattern).
   * Call `ctx.init()` manually after seeding the DOM.
   */
  deferInit?: boolean;
  /**
   * When `false`, the helper uses real timers instead of fake ones.
   * Defaults to `true`. Use real timers for tests that rely on natural
   * microtask interleaving (OOB chains, async event dispatch, etc.).
   */
  fakeTimers?: boolean;
}

export interface AgentTestContext {
  /** Spy on `sendToCollector`. Arguments are structured-cloned at capture time. */
  sendToCollectorSpy: ReturnType<typeof vi.spyOn>;
  /** The fully-resolved config passed to `init()`. Pass this to `toHaveBeenCalledWith`. */
  config: Configuration;
  /**
   * Initialize or re-initialize the agent with optional config overrides.
   * Any prior init from this context is torn down first.
   */
  init: (overrides?: Partial<Configuration>) => void;
  /**
   * Tear down the agent and restore all mocks + timers. Call from afterEach.
   */
  cleanup: () => void;
  /** Advance fake timers by `ms` and bump the stubbed `Date.now()` accordingly. */
  advanceTime: (ms: number) => void;
  /**
   * Advance past the GC sweep interval so stale assertions are flushed.
   * Use in tests that rely on GC-delivered failure.
   */
  advanceToGC: () => void;
  /** Current value of the stubbed `Date.now()`. */
  now: () => number;
  /** Flatten every captured assertion payload across all `sendToCollector` calls. */
  allPayloads: () => any[];
}

/**
 * Set up the Faultsense agent for a vitest-in-jsdom test.
 *
 * - Installs fake timers (unless `fakeTimers: false`).
 * - Stubs `Date.now()` to a fixed value so GC/timeout math is deterministic.
 * - Silences `console.error` and `console.warn` (the agent logs on expected error paths).
 * - Spies on `sendToCollector` and defensively structured-clones every captured
 *   payload. This prevents the Vitest mock-aliasing trap where post-settlement
 *   mutation (e.g. invariant auto-retry) corrupts previously-recorded calls.
 * - Calls `init(config)` unless `deferInit: true`.
 */
export function setupAgent(options: SetupAgentOptions = {}): AgentTestContext {
  // Ensure HTMLElement exists in environments where it somehow isn't polyfilled.
  if (typeof HTMLElement === "undefined") {
    (globalThis as any).HTMLElement = class {};
  }

  const config: Configuration = { ...DEFAULT_CONFIG, ...(options.config || {}) };
  const useFakeTimers = options.fakeTimers !== false;
  let fixedNow = FIXED_DATE_NOW;

  if (useFakeTimers) {
    vi.useFakeTimers();
  }
  vi.spyOn(Date, "now").mockImplementation(() => fixedNow);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  // Snapshot assertion arrays at capture time. Vitest's spy stores references
  // by default, so later mutations (invariant auto-retry, sibling dismissal,
  // OOB promotion) corrupt the recorded args. Shallow-clone each assertion
  // into a fresh array so tests can inspect the state at sendToCollector time.
  const sendToCollectorSpy = vi
    .spyOn(resolveModule, "sendToCollector")
    .mockImplementation((assertions: any[] /*, _config */) => {
      const idx = sendToCollectorSpy.mock.calls.length - 1;
      const call = sendToCollectorSpy.mock.calls[idx];
      if (call) {
        call[0] = assertions.map((a: any) => ({ ...a }));
      }
    });

  let cleanupFn: (() => void) | null = null;

  const initAgent = (overrides: Partial<Configuration> = {}) => {
    if (cleanupFn) {
      cleanupFn();
      cleanupFn = null;
    }
    cleanupFn = init({ ...config, ...overrides });
  };

  if (!options.deferInit) {
    cleanupFn = init(config);
  }

  const advanceTime = (ms: number) => {
    fixedNow += ms;
    if (useFakeTimers) {
      vi.advanceTimersByTime(ms);
    }
  };

  const advanceToGC = () => {
    advanceTime((config.gcInterval ?? 5000) + 100);
  };

  const cleanup = () => {
    if (cleanupFn) {
      cleanupFn();
      cleanupFn = null;
    }
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  };

  const allPayloads = (): any[] =>
    sendToCollectorSpy.mock.calls.flatMap((c: any[]) => c[0]);

  return {
    sendToCollectorSpy,
    config,
    init: initAgent,
    cleanup,
    advanceTime,
    advanceToGC,
    now: () => fixedNow,
    allPayloads,
  };
}
