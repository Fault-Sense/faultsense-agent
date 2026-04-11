import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Layer 2 conformance drivers.
 *
 * Each framework harness is a Playwright project with its own `webServer`
 * entry so `npm run conformance` can spin up every dev server in parallel
 * and run the drivers against a real browser. Targeting Chromium only in
 * v1 — Firefox/WebKit can come later if differential coverage matters.
 *
 * Layer 2 runs under a dedicated script (`npm run conformance`) and is
 * intentionally NOT wired into `npm test`. Layer 1 (vitest + jsdom) stays
 * fast; Layer 2 boots real dev servers and takes longer.
 */

export default defineConfig({
  testDir: "./drivers",
  // Keep Playwright artifacts under conformance/ so the repo root stays clean.
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Keep worker count conservative locally so dev servers don't thrash.
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI
    ? [["list"], ["github"]]
    : [["list"]],
  use: {
    // Each harness's webServer entry sets its own baseURL via the project
    // block below, so this is just a sensible default.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 5000,
    navigationTimeout: 15000,
  },

  projects: [
    {
      name: "tanstack",
      testMatch: "tanstack.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3100",
      },
    },
    {
      name: "vue3",
      testMatch: "vue3.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3200",
      },
    },
    // Phase 5: hotwire project added here.
  ],

  webServer: [
    {
      // Run the existing tanstack example in conformance mode.
      // VITE_FS_COLLECTOR=conformance flips the root route to load the
      // conformance collector and set data-collector-url="conformance".
      // Port 3100 keeps it separate from the default demo dev server on 3000.
      command:
        "cd ../examples/todolist-tanstack && VITE_FS_COLLECTOR=conformance npm run dev -- --port 3100",
      url: "http://localhost:3100",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // Vue 3 conformance harness. The harness is a purpose-built minimal
      // app that exercises Vue's nextTick batching + fine-grained
      // reactivity against a focused subset of the assertion catalog.
      command: "cd vue3 && npm run dev",
      url: "http://localhost:3200",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
