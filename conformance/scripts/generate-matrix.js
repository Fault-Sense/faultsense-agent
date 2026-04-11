#!/usr/bin/env node
/**
 * Generate docs/works-with.md from Playwright's JSON reporter output.
 *
 * Matrix shape:
 *   rows    = scenarios (extracted from test title prefix before " — ")
 *   columns = frameworks (Playwright projectName)
 *   cells   = ✓ passed · ✗ failed · ○ not exercised by this harness
 *
 * Also emits a per-framework summary ("passing / total"), a last-
 * updated timestamp, and a PAT-NN coverage table derived from a
 * hand-maintained scenario → PAT mapping at the bottom of this file.
 *
 * Run via:
 *   npm run conformance:matrix
 *
 * Reads:  conformance/test-results/results.json
 * Writes: docs/works-with.md
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RESULTS_PATH = path.join(REPO_ROOT, "conformance", "test-results", "results.json");
const OUTPUT_PATH = path.join(REPO_ROOT, "docs", "works-with.md");

if (!fs.existsSync(RESULTS_PATH)) {
  console.error(
    `[generate-matrix] Missing ${RESULTS_PATH}. Run \`npm run conformance\` first.`
  );
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));

/** Walk the nested suite tree and collect every test's result. */
function collectResults(suites, acc) {
  for (const suite of suites || []) {
    if (suite.suites) collectResults(suite.suites, acc);
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        // Derive a scenario key from the test title prefix ("todos/add-item
        // — conditional mutex …" → "todos/add-item").
        const title = spec.title || "";
        const scenario = (title.split(/\s+—\s+/)[0] || title).trim();
        const lastResult = test.results && test.results[test.results.length - 1];
        const status = lastResult ? lastResult.status : "unknown";
        acc.push({
          project: test.projectName,
          scenario,
          title,
          status,
        });
      }
    }
  }
}

const results = [];
collectResults(report.suites, results);

if (results.length === 0) {
  console.error("[generate-matrix] No test results found. Exiting.");
  process.exit(1);
}

const projects = [...new Set(results.map((r) => r.project))].sort();
const scenarios = [...new Set(results.map((r) => r.scenario))].sort();

/** Return ✓ / ✗ / ○ for a given (scenario, project) pair. */
function cellFor(scenario, project) {
  const r = results.find((x) => x.scenario === scenario && x.project === project);
  if (!r) return "○";
  if (r.status === "passed") return "✓";
  if (r.status === "skipped") return "○";
  return "✗";
}

/**
 * Hand-maintained scenario → PAT-NN mapping. Each scenario can cover
 * zero or more PATs. When a PAT has at least one passing scenario in
 * at least one framework, it's considered empirically covered by
 * Layer 2. (Layer 1 already locks every PAT in synthetically — this
 * table tracks which PATs additionally see real-framework exposure.)
 *
 * Update this table when new scenarios are added or when a new PAT
 * enters the catalog.
 */
const SCENARIO_TO_PAT = {
  "todos/add-item": ["PAT-07", "PAT-08"], // microtask batching + OOB cascade
  "todos/toggle-complete": ["PAT-02", "PAT-03", "PAT-06"], // delayed-commit, outerHTML swap, text-only via class flip
  "todos/remove-item": ["PAT-05"], // detach-reattach-ish (detach only)
  "todos/edit-item": ["PAT-05"], // conditional render swap
  "todos/char-count-updated": ["PAT-06"], // text-only mutation
  "layout/empty-state-shown": [], // pure mount trigger, no PAT
  "todos/count-updated": ["PAT-07", "PAT-08"], // microtask + OOB
  "guide/advance-after-add": [], // sequence trigger, no mutation-pattern PAT
  "actions/log-updated": ["PAT-07"], // custom event + added
  "layout/title-visible": [], // invariant, no mutation-pattern PAT
  "morph/status-flip": ["PAT-04"], // Turbo 8 idiomorph preserved-identity
};

/** Build the PAT → frameworks-that-cover-it inverse map. */
function buildPatCoverage() {
  const allPats = [
    "PAT-01",
    "PAT-02",
    "PAT-03",
    "PAT-04",
    "PAT-05",
    "PAT-06",
    "PAT-07",
    "PAT-08",
    "PAT-09",
    "PAT-10",
  ];
  const coverage = {};
  for (const pat of allPats) coverage[pat] = new Set();

  for (const r of results) {
    if (r.status !== "passed") continue;
    const pats = SCENARIO_TO_PAT[r.scenario] || [];
    for (const pat of pats) {
      if (coverage[pat]) coverage[pat].add(r.project);
    }
  }

  return { allPats, coverage };
}

const { allPats, coverage } = buildPatCoverage();

// ---------------------------------------------------------------------------
// Render docs/works-with.md
// ---------------------------------------------------------------------------

const now = new Date();
const today = now.toISOString().slice(0, 10);

const lines = [];
lines.push("# Works with");
lines.push("");
lines.push(
  "Generated from Layer 2 conformance test runs. This matrix is the source of truth — do not hand-edit it. Re-run `npm run conformance:matrix` after adding a scenario or harness."
);
lines.push("");
lines.push(`_Last updated: ${today} · ${results.length} tests across ${projects.length} frameworks_`);
lines.push("");

// Per-framework summary at the top
lines.push("## Per-framework coverage");
lines.push("");
lines.push("| Framework | Passing | Total |");
lines.push("|---|---|---|");
for (const project of projects) {
  const projectResults = results.filter((r) => r.project === project);
  const passing = projectResults.filter((r) => r.status === "passed").length;
  const total = projectResults.length;
  const badge = passing === total ? "✓" : "⚠";
  lines.push(`| **${project}** ${badge} | ${passing} | ${total} |`);
}
lines.push("");

// Scenario × framework grid
lines.push("## Scenario coverage");
lines.push("");
lines.push("| Scenario | " + projects.join(" | ") + " |");
lines.push("|---|" + projects.map(() => "---").join("|") + "|");
for (const scenario of scenarios) {
  const cells = projects.map((p) => cellFor(scenario, p));
  lines.push(`| \`${scenario}\` | ` + cells.join(" | ") + " |");
}
lines.push("");
lines.push("**Legend:** ✓ passing · ✗ failing · ○ not exercised by this harness");
lines.push("");

// PAT-NN empirical coverage — derived from the SCENARIO_TO_PAT mapping
lines.push("## Mutation-pattern (PAT-NN) coverage");
lines.push("");
lines.push(
  "Layer 1 locks every PAT in synthetically via the jsdom conformance suite under `tests/conformance/`. The table below shows which PATs each framework **additionally** exercises empirically through its Layer 2 harness — the more ✓ cells here, the more real-framework evidence backs up the Layer 1 regression lock. An empty row means no scenario in any harness currently exercises that pattern empirically."
);
lines.push("");
const PAT_SLUGS = {
  "PAT-01": "pre-existing-target",
  "PAT-02": "delayed-commit-mutation",
  "PAT-03": "outerhtml-replacement",
  "PAT-04": "morphdom-preserved-identity",
  "PAT-05": "detach-reattach",
  "PAT-06": "text-only-mutation",
  "PAT-07": "microtask-batching",
  "PAT-08": "cascading-mutations",
  "PAT-09": "hydration-upgrade",
  "PAT-10": "shadow-dom-traversal",
};

lines.push("| Pattern | " + projects.join(" | ") + " |");
lines.push("|---|" + projects.map(() => "---").join("|") + "|");
for (const pat of allPats) {
  const covered = coverage[pat];
  const row = projects.map((p) => (covered.has(p) ? "✓" : "○"));
  const slug = pat.toLowerCase();
  const link = `[${pat}](mutation-patterns.md#${slug}-${PAT_SLUGS[pat]})`;
  lines.push(`| ${link} | ${row.join(" | ")} |`);
}
lines.push("");
lines.push(
  "**Legend:** ✓ empirically exercised by this harness · ○ not exercised at Layer 2 (Layer 1 still covers it)"
);
lines.push("");

// How-to footer
lines.push("## How to add a framework to this matrix");
lines.push("");
lines.push(
  "1. Scaffold a minimal harness under `conformance/<framework>/` following the vue3 / react / htmx / hotwire examples."
);
lines.push("2. Add a Playwright project + `webServer` entry in `conformance/playwright.config.ts`.");
lines.push(
  "3. Write `conformance/drivers/<framework>.spec.ts` mirroring the scenario names in the other drivers (so the matrix rows line up)."
);
lines.push(
  "4. Run `npm run conformance:matrix` — the generator updates this file automatically from the new results."
);
lines.push(
  "5. If your harness exercises a new mutation pattern not in the catalog, add a `PAT-NN` test under `tests/conformance/` first and update the `SCENARIO_TO_PAT` map in `conformance/scripts/generate-matrix.js` so the PAT coverage table reflects it."
);
lines.push("");

fs.writeFileSync(OUTPUT_PATH, lines.join("\n"));
console.log(`[generate-matrix] Wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
console.log(
  `[generate-matrix] ${results.length} tests · ${projects.length} frameworks · ${scenarios.length} scenarios`
);
