import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  // Test files (*.spec.ts) are automatically excluded since only entry files are bundled
  // Watch mode: ignore test files to avoid unnecessary rebuilds
  ignoreWatch: ["**/*.spec.ts", "**/test-setup.ts"],
  sourcemap: true,
});
