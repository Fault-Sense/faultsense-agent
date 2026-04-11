import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Svelte 5 conformance harness. Port 3500 — first free port after
// hotwire (3300) and htmx (3400).
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 3500,
    strictPort: true,
  },
});
