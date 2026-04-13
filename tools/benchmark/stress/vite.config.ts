import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Stress benchmark harness. Port 3101.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3101,
    strictPort: true,
  },
});
