import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./setupTests.ts"],
    // Layer 1 tests live under tests/. Layer 2 drivers under conformance/
    // are Playwright specs and must NOT be collected by vitest.
    include: ["tests/**/*.{test,spec}.{js,ts}"],
    exclude: ["**/node_modules/**", "**/dist/**", "conformance/**"],
  },
});
