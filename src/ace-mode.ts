import type * as AceBuilds from "ace-builds";
import type { Ace } from "ace-builds";
import { getWorkerUrl, modes } from "virtual:react-ace-mode-assets";

export function setAceMode(
  ace: typeof AceBuilds,
  session: Ace.EditSession,
  mode?: string | object
) {
  if (mode && typeof mode !== "string") {
    session.setMode(mode as Ace.SyntaxMode);
    return;
  }

  const name = typeof mode === "string" && mode ? mode : "text";
  const id = name.startsWith("ace/mode/") ? name : `ace/mode/${name}`;
  const asset = modes.get(id);
  if (asset) {
    const config = ace.config;
    const { $moduleUrls } = config.all() as Ace.ConfigOptions & {
      $moduleUrls?: Record<string, string>;
    };
    if (
      !$moduleUrls?.[id] &&
      !config.dynamicModules?.[id] &&
      !ace.require(id)
    ) {
      if (asset.load) config.setModuleLoader(id, asset.load);
      else if (asset.url) config.setModuleUrl(id, asset.url);
    }

    if (typeof Worker !== "undefined") {
      for (const worker of asset.workers) {
        if ($moduleUrls?.[worker]) continue;
        const url = getWorkerUrl(worker);
        if (url) config.setModuleUrl(worker, url);
      }
    }
  }
  session.setMode(id);
}
