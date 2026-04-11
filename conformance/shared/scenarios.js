/**
 * Canonical Layer 2 scenario registry.
 *
 * Single source of truth for:
 *   - every scenario key used by any driver
 *   - the PAT-NN ids each scenario empirically exercises
 *   - human-readable titles for matrix-generator output
 *
 * Written as CommonJS so both the Node matrix generator
 * (conformance/scripts/generate-matrix.js) and the TypeScript Playwright
 * drivers (conformance/drivers/*.spec.ts, conformance/shared/runners.ts)
 * can import it without an intermediate build step.
 *
 * Drift guards:
 *   - runners.ts imports SCENARIO_KEYS to validate at startup that every
 *     scenario a driver declares maps to a registered runner and key.
 *   - generate-matrix.js imports SCENARIOS to fail CI if any Playwright
 *     result references a scenario key that isn't in this registry, or
 *     if any registered scenario is never exercised by any driver.
 *
 * @typedef {Object} ScenarioMeta
 * @property {string} key        - scenario key, e.g. "todos/add-item"
 * @property {string} title      - short human-readable description
 * @property {string[]} pats     - PAT-NN ids this scenario exercises empirically
 */

/** @type {ScenarioMeta[]} */
const SCENARIOS = [
  {
    key: "todos/add-item",
    title: "conditional mutex success (added + emitted)",
    pats: ["PAT-07", "PAT-08"],
  },
  {
    key: "todos/toggle-complete",
    title: "updated with classlist flip",
    pats: ["PAT-02", "PAT-03", "PAT-06"],
  },
  {
    key: "todos/remove-item",
    title: "removed from keyed list",
    pats: ["PAT-05"],
  },
  {
    key: "todos/edit-item",
    title: "added with focused modifier (conditional render)",
    pats: ["PAT-05"],
  },
  {
    key: "todos/char-count-updated",
    title: "input trigger + text-matches",
    pats: ["PAT-06"],
  },
  {
    key: "layout/empty-state-shown",
    title: "mount trigger + visible",
    pats: [],
  },
  {
    key: "todos/count-updated",
    title: "OOB triggered by add-item",
    pats: ["PAT-07", "PAT-08"],
  },
  {
    key: "guide/advance-after-add",
    title: "`after` sequence passes once add-item has passed",
    pats: [],
  },
  {
    key: "actions/log-updated",
    title: "custom event trigger + added",
    pats: ["PAT-07"],
  },
  {
    key: "layout/title-visible",
    title: "invariant reports failure if the title is hidden",
    pats: [],
  },
  {
    key: "morph/status-flip",
    title: "morphdom preserved-identity (PAT-04 empirical)",
    pats: ["PAT-04"],
  },
  {
    key: "hydration/island-mount",
    title: "SSR empty state persists through hydration (PAT-09 empirical)",
    pats: ["PAT-09"],
  },
];

/** Set of every registered scenario key — cheap drift check. */
const SCENARIO_KEYS = new Set(SCENARIOS.map((s) => s.key));

/** Map from scenario key → PAT ids, for the matrix generator. */
const SCENARIO_TO_PAT = SCENARIOS.reduce((acc, s) => {
  acc[s.key] = s.pats;
  return acc;
}, /** @type {Record<string, string[]>} */ ({}));

/**
 * Throw if the given key is not in the registry. Call from runners.ts
 * at driver startup so typos surface as a clear error rather than a
 * silently-skipped test.
 *
 * @param {string} key
 * @returns {ScenarioMeta}
 */
function requireScenario(key) {
  const s = SCENARIOS.find((s) => s.key === key);
  if (!s) {
    throw new Error(
      `[scenarios] Unknown scenario key "${key}". Register it in conformance/shared/scenarios.js.`
    );
  }
  return s;
}

module.exports = {
  SCENARIOS,
  SCENARIO_KEYS,
  SCENARIO_TO_PAT,
  requireScenario,
};
