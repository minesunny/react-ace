import { defineConfig } from "vitest/config";
import { aceModeAssets } from "./ace-assets.config.mjs";

export default defineConfig({
  plugins: [aceModeAssets()],
  test: {
    include: ["tests/src/**/*.spec.tsx"],
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    coverage: {
      reporter: ["html", "text", "lcov"],
      exclude: [
        "node_modules/",
        "dist/",
        "lib/",
        "example/",
        "tests/",
        "*.config.*",
        "*.d.ts"
      ]
    }
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js"]
  }
});
