import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// React 19 conformance harness. Port 3100 (kept from the previous
// tanstack harness to avoid churning Playwright's project config).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3100,
    strictPort: true,
  },
});
