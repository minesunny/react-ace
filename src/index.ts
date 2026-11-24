import ace from "./ace";
import diff from "./diff";
import split from "./split";
export type { IAceEditorProps, ReactAceProps } from "./ace";
export type {
  EditorBlockQuote,
  EditorDecorationsProps
} from "./editor-decorations";
export type {
  WorkspaceContextMenuItem,
  WorkspaceCustomDocument,
  WorkspaceDocument,
  WorkspaceDocumentBase,
  WorkspaceDocumentToolbarRenderState,
  WorkspaceEditorDocument,
  WorkspaceEditorOptions,
  WorkspaceTabItemRenderState,
  WorkspaceTabLabels,
  WorkspaceTabMenu,
  WorkspaceTabMenuAction,
  WorkspaceTabMenuEvent
} from "./workspace";
export type { IDiffEditorProps, IDiffEditorState } from "./diff";
export type { ISplitEditorProps } from "./split";
export type {
  IAceOptions,
  IAnnotation,
  ICommand,
  ICommandBindKey,
  ICommandManager,
  IEditorProps,
  IMarker
} from "./types";
export { split, diff };
export default ace;
