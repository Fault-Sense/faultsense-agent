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
 * updated timestamp, and a PAT-NN coverage table derived from the
 * scenario → PAT mapping in conformance/shared/scenarios.js (the
 * single source of truth, also imported by the TypeScript drivers).
 *
 * Run via:
 *   npm run conformance:matrix
 *
 * Reads:  conformance/test-results/results.json
 *         conformance/shared/scenarios.js
 * Writes: docs/works-with.md
 */

const fs = require("fs");
const path = require("path");
const {
  SCENARIOS,
  SCENARIO_KEYS,
  SCENARIO_TO_PAT,
} = require("../shared/scenarios.js");

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

// ---------------------------------------------------------------------------
// Drift guards — enforced against conformance/shared/scenarios.js, the
// single source of truth. Two directions:
//   (1) every scenario observed in Playwright results must be a key in
//       the registry (catches typos and accidental new scenarios)
//   (2) every registered scenario must appear in at least one project's
//       results (catches stranded entries — a scenario nobody runs)
// Either failure exits non-zero so `npm run conformance:matrix` fails
// loudly in CI rather than silently producing a broken matrix.
// ---------------------------------------------------------------------------
const unknownScenarios = scenarios.filter((s) => !SCENARIO_KEYS.has(s));
if (unknownScenarios.length > 0) {
  console.error(
    `[generate-matrix] Playwright results reference scenarios not in conformance/shared/scenarios.js:\n` +
      unknownScenarios.map((s) => `  - ${s}`).join("\n") +
      `\nRegister them in the scenario table or rename the driver's test title.`
  );
  process.exit(1);
}

const exercisedKeys = new Set(scenarios);
const unusedScenarios = SCENARIOS.filter((s) => !exercisedKeys.has(s.key));
if (unusedScenarios.length > 0) {
  // Warn, don't fail. A registered-but-unexercised scenario is useful
  // during harness bring-up (the scenario exists before any driver
  // runs it) and the warning is loud enough that stranded entries
  // won't stay stranded for long.
  console.warn(
    `[generate-matrix] Registered scenarios with no driver coverage:\n` +
      unusedScenarios.map((s) => `  - ${s.key}`).join("\n")
  );
}

/** Return ✓ / ✗ / ○ for a given (scenario, project) pair. */
function cellFor(scenario, project) {
  const r = results.find((x) => x.scenario === scenario && x.project === project);
  if (!r) return "○";
  if (r.status === "passed") return "✓";
  if (r.status === "skipped") return "○";
  return "✗";
}

/**
 * SCENARIO_TO_PAT is loaded from conformance/shared/scenarios.js so the
 * registry stays the single source of truth. Update it there when new
 * scenarios are added or when a new PAT enters the catalog.
 */

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
  "1. Scaffold a minimal harness under `conformance/<framework>/` following an existing example (react / vue3 / svelte / solid for CSR SPAs, hotwire / htmx for server-rendered HTML, alpine for directive-only, astro for SSR + hydration)."
);
lines.push("2. Add a Playwright project + `webServer` entry in `conformance/playwright.config.ts`.");
lines.push(
  "3. Write `conformance/drivers/<framework>.spec.ts` using the shared runners in `conformance/shared/runners.ts`. Declare a `HarnessConfig`, register one `test()` per supported scenario, and delegate the body to `runners[scenarioKey]`. Framework-specific variance (toggle selector, expected assertion type, settle wait) lives in the config, not in duplicated test bodies."
);
lines.push(
  "4. Run `npm run conformance:matrix` — the generator updates this file automatically from the new results."
);
lines.push(
  "5. If your harness exercises a new mutation pattern not in the catalog, add a `PAT-NN` test under `tests/conformance/` first, then register the scenario (with its PAT ids) in `conformance/shared/scenarios.js` — the single source of truth for scenario → PAT mappings, shared by this generator and the TypeScript drivers."
);
lines.push("");

fs.writeFileSync(OUTPUT_PATH, lines.join("\n"));
console.log(`[generate-matrix] Wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
console.log(
  `[generate-matrix] ${results.length} tests · ${projects.length} frameworks · ${scenarios.length} scenarios`
);
