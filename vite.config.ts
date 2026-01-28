import { resolve } from "node:path";
import typegpu from "unplugin-typegpu/vite";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    typegpu(),
    dts({
      rollupTypes: true,
      outDir: "dist",
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    sourcemap: true,
    rollupOptions: {
      external: ["typegpu", "typegpu/data", "typegpu/std"],
    },
  },
});
