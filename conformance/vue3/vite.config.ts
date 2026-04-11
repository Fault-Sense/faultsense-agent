import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Vue 3 conformance harness. Port 3200 keeps it clear of tanstack (3100)
// and leaves space for future harnesses (hotwire → 3300 etc.).
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3200,
    strictPort: true,
  },
});
