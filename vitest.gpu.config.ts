import typegpu from "unplugin-typegpu/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [typegpu()],
  test: {
    environment: "node",
    include: ["test/gpu/**/*.spec.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
