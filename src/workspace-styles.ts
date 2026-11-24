import type * as AceBuilds from "ace-builds";
import workspaceCss from "./workspace.css?raw";

export function installWorkspaceStyles(
  ace: typeof AceBuilds,
  target: HTMLElement | null
) {
  // The stylesheet uses cascade layers, including in the explicit CSS export.
  const view = target?.ownerDocument.defaultView;
  if (!view || !("CSSLayerBlockRule" in view)) return;

  ace
    .require("ace/lib/dom")
    .importCssString(workspaceCss, "react-ace-workspace-styles", target);
}
