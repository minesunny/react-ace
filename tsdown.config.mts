import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type TsdownPlugin, type UserConfig } from "tsdown";
import { aceModeAssets, aceScriptAssets } from "./ace-assets.config.mjs";

const workspaceStylesFile = fileURLToPath(
  new URL("./src/workspace.css", import.meta.url)
);
const workspaceStylesId = "\0react-ace-workspace-css";
const workspaceStyles: TsdownPlugin = {
  name: "react-ace-workspace-css",
  resolveId(source) {
    if (source === "./workspace.css?raw") return workspaceStylesId;
  },
  load(id) {
    if (id !== workspaceStylesId) return;
    this.addWatchFile(workspaceStylesFile);
    const css = readFileSync(workspaceStylesFile, "utf8");
    return `export default ${JSON.stringify(css)};`;
  }
};

// JSX is transformed to classic React.createElement via tsconfig.json ("jsx": "react")
// to keep supporting pre-17 React peers.

const umdBase: UserConfig = {
  entry: { "react-ace": "src/index.ts" },
  format: "umd",
  plugins: [workspaceStyles, aceModeAssets({ scriptTag: true })],
  outDir: "dist",
  target: "es2017",
  platform: "browser",
  sourcemap: true,
  globalName: "ReactAce",
  alias: {
    // React's script-tag build provides createElement but no jsx-runtime module.
    "react/jsx-runtime": fileURLToPath(
      new URL("./src/umd-jsx-runtime.ts", import.meta.url)
    )
  },
  deps: {
    neverBundle: [/^react$/, /^react-dom$/],
    alwaysBundle: [
      /^ace-builds/,
      /^@radix-ui\//,
      /^react\/jsx-runtime$/,
      "diff-match-patch",
      "fast-equals",
      "prop-types"
    ]
  },
  outputOptions: {
    codeSplitting: false,
    globals: { react: "React", "react-dom": "ReactDOM" },
    exports: "named",
    entryFileNames: "react-ace.js"
  },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  clean: false,
  report: false
};

const libBase: UserConfig = {
  entry: [
    "src/index.ts",
    "src/ace.tsx",
    "src/split.tsx",
    "src/diff.tsx",
    "src/workspace.tsx",
    "src/editorOptions.ts",
    "src/types.ts"
  ],
  unbundle: true,
  dts: true,
  outDir: "lib",
  target: "es2020",
  platform: "neutral",
  sourcemap: true,
  deps: { neverBundle: true },
  // clean is disabled because the CJS and ESM passes share lib/;
  // prepublishOnly and preversion run `npm run clean` beforehand.
  clean: false,
  report: false
};

export default defineConfig([
  {
    ...libBase,
    format: "cjs",
    // Worker asset URLs use import.meta.url in browser module builds.
    plugins: [workspaceStyles, aceModeAssets({ workerUrls: false })],
    outputOptions: { exports: "named" },
    outExtensions: () => ({ js: ".js", dts: ".d.ts" })
  },
  {
    ...libBase,
    format: "esm",
    plugins: [workspaceStyles, aceModeAssets()],
    outExtensions: () => ({ js: ".mjs", dts: ".d.mts" })
  },
  { ...umdBase, minify: false },
  {
    ...umdBase,
    copy: [aceScriptAssets],
    outputOptions: {
      ...umdBase.outputOptions,
      entryFileNames: "react-ace.min.js"
    },
    minify: true
  }
]);
