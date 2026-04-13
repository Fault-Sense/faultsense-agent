import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { runBenchmark, type RunOptions } from "./lib/measure";
import {
  computeMetrics,
  generateStressMarkdown,
  generateJson,
  median,
  percentile95,
} from "./lib/report";
import type { Page } from "@playwright/test";
import type {
  StressConfig,
  StressScenarioResult,
  MoTimingSummary,
  ThrottleProfileName,
} from "./lib/types";

// ── Stress matrix ───────────────────────────────────────────────────

const STRESS_MATRIX: StressConfig[] = [
  { assertions: 50, churnRate: 0, churnNodes: 100 },
  { assertions: 50, churnRate: 100, churnNodes: 100 },
  { assertions: 200, churnRate: 0, churnNodes: 100 },
  { assertions: 200, churnRate: 100, churnNodes: 100 },
  { assertions: 1000, churnRate: 0, churnNodes: 100 },
  { assertions: 1000, churnRate: 100, churnNodes: 100 },
];

const STRESS_PROFILES: ThrottleProfileName[] = ["unthrottled", "cpu4x"];

const STRESS_PORT = 3101;
const STRESS_BASE_URL = `http://localhost:${STRESS_PORT}`;

function stressUrl(config: StressConfig): string {
  return `${STRESS_BASE_URL}/?assertions=${config.assertions}&churnRate=${config.churnRate}&churnNodes=${config.churnNodes}`;
}

/**
 * Activate the auto-trigger in the stress harness and let it run through
 * all instrumented widgets once. This fires assertions and generates MO
 * callbacks that the timing wrapper can measure.
 */
async function stressInteract(page: Page): Promise<void> {
  // Wait for the harness to render
  await page.waitForSelector("#stress-status", { timeout: 10_000 });
  await page.waitForTimeout(500);

  // Activate auto-trigger — the harness polls this flag every 200ms
  await page.evaluate(() => {
    window.__fsBenchStressTrigger = true;
  });

  // Let the trigger loop run through all widgets (~100ms per widget).
  // For 1000 widgets this is ~100s, but the soak period covers that.
  // Here we just give it enough time to start generating MO callbacks.
  await page.waitForTimeout(3000);
}

// ── MO timing summary ───────────────────────────────────────────────

function summarizeMoTimings(
  scenarios: StressScenarioResult[],
): void {
  for (const scenario of scenarios) {
    // Collect all MO timings from condition B across pairs
    const allTimings: number[] = [];
    for (const pair of scenario.pairs) {
      if (pair.b.moCallbackTimings) {
        for (const t of pair.b.moCallbackTimings) {
          allTimings.push(t.durationMs);
        }
      }
    }

    if (allTimings.length > 0) {
      allTimings.sort((a, b) => a - b);
      scenario.moTimingSummary = {
        p50: median(allTimings),
        p95: percentile95(allTimings),
        p99: allTimings[Math.ceil(0.99 * allTimings.length) - 1] ?? 0,
        count: allTimings.length,
      };
    } else {
      scenario.moTimingSummary = null;
    }
  }
}

// ── Main test ───────────────────────────────────────────────────────

test("stress benchmark", async () => {
  const pairsCount = parseInt(process.env.FS_BENCH_PAIRS ?? "15", 10);
  const soakMs = parseInt(process.env.FS_BENCH_SOAK_MS ?? "30000", 10);
  const allowCi = process.argv.includes("--allow-ci");

  const rootDir = path.resolve(__dirname, "../..");
  const moTimingWrapperPath = path.resolve(
    __dirname,
    "lib/injection/mo-timing-wrapper.js",
  );

  const outputDir = path.resolve(__dirname, "results");
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`\nStress benchmark`);
  console.log(`Pairs: ${pairsCount} (first discarded as warmup)`);
  console.log(`Soak: ${soakMs / 1000}s per measurement`);
  console.log(`Profiles: ${STRESS_PROFILES.join(", ")}`);
  console.log(`Matrix: ${STRESS_MATRIX.length} configurations\n`);

  const allResults: StressScenarioResult[] = [];
  let envInfo: ReturnType<typeof computeMetrics> extends infer T ? T : never;

  // Run A-vs-A baseline with the first config
  const baselineConfig = STRESS_MATRIX[0];
  console.log(
    `[baseline] A-vs-A: ${baselineConfig.assertions} assertions, ${baselineConfig.churnRate} churn/s`,
  );

  const baselineReport = await runBenchmark({
    url: stressUrl(baselineConfig),
    pairsCount,
    soakMs,
    allowCi,
    baselineMode: true,
    profiles: ["unthrottled"],
  });

  for (const scenario of baselineReport.scenarios) {
    const stressScenario: StressScenarioResult = {
      ...scenario,
      isBaseline: true,
      stressConfig: baselineConfig,
      moTimingSummary: null,
    };
    allResults.push(stressScenario);
  }

  // Run stress matrix
  for (const config of STRESS_MATRIX) {
    for (const profileName of STRESS_PROFILES) {
      console.log(
        `[stress] ${config.assertions} assertions, ${config.churnRate} churn/s, ${profileName}`,
      );

      const report = await runBenchmark({
        url: stressUrl(config),
        pairsCount,
        soakMs,
        allowCi,
        moTimingWrapperPath,
        profiles: [profileName],
        interactFn: stressInteract,
        modes: ["active"],
      });

      for (const scenario of report.scenarios) {
        const stressScenario: StressScenarioResult = {
          ...scenario,
          stressConfig: config,
          moTimingSummary: null,
        };
        allResults.push(stressScenario);
      }
    }
  }

  // Compute MO timing summaries
  summarizeMoTimings(allResults);

  // Use environment from the last run (they're all the same machine)
  const lastReport = await runBenchmark({
    url: stressUrl(STRESS_MATRIX[0]),
    pairsCount: 2, // minimal — just need env info
    soakMs: 1000,
    allowCi,
    profiles: ["unthrottled"],
  });

  // Generate reports
  const stressMd = generateStressMarkdown(allResults, lastReport.environment);
  const stressMdPath = path.resolve(outputDir, "stress-report.md");
  fs.writeFileSync(stressMdPath, stressMd, "utf-8");

  const stressJson = JSON.stringify(
    {
      environment: lastReport.environment,
      stressResults: allResults.map((r) => ({
        ...r,
        pairs: r.pairs.map((p) => ({
          a: { ...p.a, profile: null, moCallbackTimings: null },
          b: { ...p.b, profile: null, moCallbackTimings: null },
        })),
        warmupPair: {
          a: { ...r.warmupPair.a, profile: null, moCallbackTimings: null },
          b: { ...r.warmupPair.b, profile: null, moCallbackTimings: null },
        },
      })),
    },
    null,
    2,
  );
  const stressJsonPath = path.resolve(outputDir, "stress-report.json");
  fs.writeFileSync(stressJsonPath, stressJson, "utf-8");

  console.log(`\nStress report written to:`);
  console.log(`  Markdown: ${stressMdPath}`);
  console.log(`  JSON:     ${stressJsonPath}`);
});
