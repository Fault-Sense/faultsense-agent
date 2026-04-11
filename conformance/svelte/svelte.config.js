import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  // Preprocess <script lang="ts"> blocks so the harness can use TypeScript.
  preprocess: vitePreprocess(),
};
