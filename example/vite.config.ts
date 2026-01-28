import { defineConfig } from "vite";

// GH_PAGES_BASE is set only in .github/workflows/deploy-gh-pages.yml when building for GitHub Pages.
// Locally it is unset, so base stays "/".
export default defineConfig({
  base: process.env.GH_PAGES_BASE ?? "/",
});
