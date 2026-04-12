import { defineConfig } from "@playwright/test";
import path from "node:path";

const mode = process.env.FS_BENCH_MODE ?? "url";
const isDemo = mode === "demo";

const benchmarkProject = {
  name: "benchmark",
  testMatch: "benchmark.spec.ts",
};

export default defineConfig({
  testDir: ".",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // Full run: 10 pairs x 2 profiles x 2 conditions x ~62s = ~41 min.
  timeout: 50 * 60_000,
  use: {
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [benchmarkProject],
  ...(isDemo
    ? {
        webServer: {
          command: `FS_BENCH=1 node ${path.resolve(__dirname, "../../examples/todolist-htmx/server.js")}`,
          port: 3099,
          reuseExistingServer: false,
          timeout: 180_000,
          stdout: "ignore",
          stderr: "pipe",
        },
      }
    : {}),
});
