import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// Astro 6 conformance harness. Static + React islands for PAT-09
// (hydration upgrade) empirical coverage. Port 3800 — next free slot
// after alpine (3700).
export default defineConfig({
  integrations: [react()],
  server: {
    port: 3800,
    host: "127.0.0.1",
  },
  // Static output: Astro's dev server still SSRs every request, so the
  // hydration scenarios get real SSR-then-hydrate semantics without
  // dragging in the Node adapter.
  output: "static",
});
