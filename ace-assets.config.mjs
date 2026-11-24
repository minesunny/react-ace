import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const aceDir = dirname(require.resolve("ace-builds/package.json"));
const src = join(aceDir, "src-noconflict");
const min = join(aceDir, "src-min-noconflict");
const modes = readdirSync(src)
  .filter(file => /^mode-[\w-]+\.js$/.test(file))
  .sort();
const workers = readdirSync(min)
  .filter(file => /^worker-[\w-]+\.js$/.test(file) && file !== "worker-base.js")
  .sort();

const modeAssetsId = "virtual:react-ace-mode-assets";
const resolvedModeAssetsId = "\0" + modeAssetsId;
const workerFile = new Map(
  workers.map(file => [`ace/mode/${file.slice(7, -3)}_worker`, file])
);

export const aceScriptAssets = {
  from: [...modes, ...workers].map(file => join(min, file)),
  to: "dist/ace-assets"
};

export function aceModeAssets({ scriptTag = false, workerUrls = true } = {}) {
  return {
    name: "react-ace-mode-assets",
    resolveId(id) {
      if (id === modeAssetsId) return resolvedModeAssetsId;
    },
    load(id) {
      if (id !== resolvedModeAssetsId) return;

      const entries = modes.map(file => {
        const contents = readFileSync(join(src, file), "utf8");
        // Derived modes can reference another language's worker, such as TypeScript using JavaScript's.
        const referencedWorkers = new Set(
          [...contents.matchAll(/["'](ace\/mode\/[\w-]+_worker)["']/g)]
            .map(match => match[1])
            .filter(worker => workerFile.has(worker))
        );
        const name = JSON.stringify(`ace/mode/${file.slice(5, -3)}`);
        const locator = scriptTag
          ? `url: assetUrl(${JSON.stringify(file)})`
          : `load: () => import(${JSON.stringify(`ace-builds/src-noconflict/${file}`)})`;
        return `[${name}, { ${locator}, workers: ${JSON.stringify([...referencedWorkers])} }]`;
      });
      const workerEntries = (workerUrls ? [...workerFile] : []).map(
        ([name, file]) => {
          const locator = scriptTag
            ? `assetUrl(${JSON.stringify(file)})`
            : `new URL(${JSON.stringify(`ace-builds/src-min-noconflict/${file}`)}, import.meta.url).href`;
          return `[${JSON.stringify(name)}, () => ${locator}]`;
        }
      );
      const scriptHelpers = scriptTag
        ? `
          const script = typeof document === "undefined"
            ? undefined
            : document.currentScript?.src || document.baseURI;
          const assetUrl = file => script && new URL("./ace-assets/" + file, script).href;
        `
        : "";

      return `
        ${scriptHelpers}
        export const modes = new Map([${entries.join(",\n")}]);
        const workers = new Map([${workerEntries.join(",\n")}]);
        export const getWorkerUrl = id => workers.get(id)?.();
      `;
    }
  };
}
