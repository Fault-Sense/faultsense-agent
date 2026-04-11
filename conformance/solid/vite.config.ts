import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// Solid conformance harness. Port 3600 — next free slot after svelte (3500).
export default defineConfig({
  plugins: [solid()],
  server: {
    port: 3600,
    strictPort: true,
  },
});
