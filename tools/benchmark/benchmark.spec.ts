import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { runBenchmark, type RunOptions } from "./lib/measure";
import { generateMarkdown, generateJson, computeMetrics } from "./lib/report";
import { runCanonicalInteraction } from "./lib/interact";

const mode = process.env.FS_BENCH_MODE ?? "url";
const isDemo = mode === "demo";

function resolveUrl(): string {
  if (isDemo) {
    return `http://localhost:${process.env.FS_BENCH_PORT ?? "3099"}/login`;
  }
  const envUrl = process.env.FS_BENCH_URL;
  if (!envUrl) {
    throw new Error(
      "FS_BENCH_URL is required in url mode. Usage: FS_BENCH_URL=https://example.com npm run benchmark",
    );
  }
  return envUrl;
}

function resolveOutputDir(): string {
  if (isDemo) {
    const dir = path.resolve(__dirname, "../../docs/performance");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const dir = path.resolve(__dirname, "results");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test("performance benchmark", async () => {
  const url = resolveUrl();
  const outputDir = resolveOutputDir();

  const allowCi = process.argv.includes("--allow-ci");

  const pairsCount = parseInt(process.env.FS_BENCH_PAIRS ?? "30", 10);
  const soakMs = parseInt(process.env.FS_BENCH_SOAK_MS ?? "60000", 10);

  const port = process.env.FS_BENCH_PORT ?? "3099";
  const options: RunOptions = {
    url,
    pairsCount,
    soakMs,
    allowCi,
    isDemo,
    // Demo mode: run active-state with scripted interactions + server reset
    ...(isDemo
      ? {
          interactFn: runCanonicalInteraction,
          resetUrl: `http://localhost:${port}/reset`,
        }
      : {}),
  };

  const modes = isDemo ? "idle + active" : "idle only";
  console.log(`\nBenchmark: ${isDemo ? "demo" : "url"} mode (${modes})`);
  console.log(`Target: ${url}`);
  console.log(`Pairs: ${options.pairsCount} (first discarded as warmup)`);
  console.log(`Soak: ${options.soakMs! / 1000}s per measurement`);
  console.log(`Profiles: unthrottled, slow4g\n`);

  const report = await runBenchmark(options);
  report.metrics = computeMetrics(report);

  // Write outputs
  const mdPath = isDemo
    ? path.resolve(outputDir, "current.md")
    : path.resolve(outputDir, "report.md");
  const jsonPath = isDemo
    ? path.resolve(outputDir, "current.json")
    : path.resolve(outputDir, "report.json");

  const markdown = generateMarkdown(report);
  const json = generateJson(report);

  fs.writeFileSync(mdPath, markdown, "utf-8");
  fs.writeFileSync(jsonPath, json, "utf-8");

  console.log(`\nReport written to:`);
  console.log(`  Markdown: ${mdPath}`);
  console.log(`  JSON:     ${jsonPath}`);

  if (report.status === "aborted") {
    console.log(`\nRun was aborted. Partial results saved.`);
    process.exitCode = 130;
  }
});
