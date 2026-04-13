import { defineConfig } from "@playwright/test";
import path from "node:path";

const mode = process.env.FS_BENCH_MODE ?? "url";
const isDemo = mode === "demo";
const isStress = mode === "stress";

const benchmarkProject = {
  name: "benchmark",
  testMatch: "benchmark.spec.ts",
};

const stressProject = {
  name: "stress",
  testMatch: "stress.spec.ts",
};

// Web servers to boot based on mode
const webServers: Array<{
  command: string;
  port: number;
  reuseExistingServer: boolean;
  timeout: number;
  stdout: "ignore" | "pipe";
  stderr: "ignore" | "pipe";
}> = [];

if (isDemo) {
  webServers.push({
    command: `FS_BENCH=1 node ${path.resolve(__dirname, "../../examples/todolist-htmx/server.js")}`,
    port: 3099,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  });
}

if (isStress) {
  webServers.push({
    command: `cd ${path.resolve(__dirname, "stress")} && npm run dev`,
    port: 3101,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  });
}

export default defineConfig({
  testDir: ".",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // Full run: 30 pairs x 4 scenarios x 2 conditions x ~62s = ~4 hours.
  // Stress: 6 configs x 2 profiles x 15 pairs x ~32s + baseline = ~3 hours.
  timeout: 300 * 60_000,
  use: {
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: isStress ? [stressProject] : [benchmarkProject],
  ...(webServers.length > 0 ? { webServer: webServers.length === 1 ? webServers[0] : webServers } : {}),
});
