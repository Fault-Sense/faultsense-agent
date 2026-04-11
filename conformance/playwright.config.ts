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
      name: "react",
      testMatch: "react.spec.ts",
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
    {
      name: "hotwire",
      testMatch: "hotwire.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3300",
      },
    },
    {
      name: "htmx",
      testMatch: "htmx.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3400",
      },
    },
  ],

  webServer: [
    {
      // React 19 + Vite harness — minimal, plain React, StrictMode on.
      command: "cd react && npm run dev",
      url: "http://localhost:3100",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // Vue 3 conformance harness. Exercises nextTick batching +
      // fine-grained reactivity against the same assertion catalog.
      command: "cd vue3 && npm run dev",
      url: "http://localhost:3200",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // Hotwire / Rails 8 harness — runs in a Docker container because
      // the system Ruby on most dev machines is too old for modern Rails.
      // The image is built once on first run (and cached by Docker);
      // subsequent runs start in ~2s. `docker compose up --wait` blocks
      // until the container's HEALTHCHECK reports healthy.
      command:
        "docker compose -f hotwire/docker-compose.yml up -d --wait",
      url: "http://localhost:3300/up",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000, // generous — first run builds the image
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // HTMX + Express + EJS harness — language-agnostic HTMX with a
      // minimal Node backend. Exercises hx-swap variants and
      // hx-swap-oob against a real server.
      command: "cd htmx && npm run dev",
      url: "http://localhost:3400",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
