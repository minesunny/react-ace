import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { aceModeAssets } from "./ace-assets.config.mjs";
export default defineConfig({
  base: "",
  plugins: [react(), tailwindcss(), aceModeAssets()],
  root: "./example",
  build: {
    outDir: "../example/static",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "example/index.html"),
        split: resolve(__dirname, "example/split.html"),
        diff: resolve(__dirname, "example/diff.html"),
        workspace: resolve(__dirname, "example/workspace.html")
      },
      jsx: {
        mode: "automatic"
      }
    },
    commonjsOptions: { transformMixedEsModules: true }
  },

  server: {
    port: 9000,
    host: true
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js"]
  }
});
