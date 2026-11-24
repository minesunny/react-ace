"use client";

import * as Tabs from "@radix-ui/react-tabs";
import type { Ace } from "ace-builds";
import * as React from "react";
import {
  EditorDecorations,
  type EditorDecorationsProps
} from "./editor-decorations";
import { getAceInstance } from "./editorOptions";
import { WorkspaceDocumentContent } from "./workspace-document-content";
import { WorkspaceEditor } from "./workspace-editor";
import { WorkspaceSplitHandle } from "./workspace-split-handle";
import { installWorkspaceStyles } from "./workspace-styles";
import { WorkspaceTabs } from "./workspace-tabs";

export interface WorkspaceDocumentBase {
  /** Stable, unique, nonempty ID within the workspace. */
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** Default content of this document's toolbar. */
  toolbar?: React.ReactNode;
  modified?: boolean;
  disabled?: boolean;
  closable?: boolean;
  pinned?: boolean;
}

export interface WorkspaceEditorDocument
  extends WorkspaceDocumentBase, EditorDecorationsProps {
  kind: "editor";
  mode?: string;
  value?: string;
  defaultValue?: string;
  readOnly?: boolean;
  useWorker?: boolean;
  tabSize?: number;
  wrap?: boolean;
}

export interface WorkspaceCustomDocument extends WorkspaceDocumentBase {
  kind: "custom";
  content: React.ReactNode;
  /** Set false when the document owns its scroll viewport, such as a virtualized grid. */
  scrollable?: boolean;
}

export type WorkspaceDocument =
  WorkspaceEditorDocument | WorkspaceCustomDocument;

export type WorkspaceEditorOptions = Partial<
  Omit<
    Ace.EditorOptions,
    | keyof Ace.EditSessionOptions
    | "session"
    | "value"
    | "theme"
    | "readOnly"
    | "textInputAriaLabel"
    | "customScrollbar"
    | "minLines"
    | "maxLines"
  >
>;

export interface WorkspaceTabMenuAction {
  id: string;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

export type WorkspaceTabMenu<D extends WorkspaceDocument = WorkspaceDocument> =
  Pick<WorkspaceTabMenuAction, "id" | "label" | "disabled"> &
    (
      | {
          type: "callback";
          onSelect: (document: D) => void;
          event?: never;
          payload?: never;
        }
      | {
          type: "event";
          event: string;
          payload?: unknown;
          onSelect?: never;
        }
    );

export interface WorkspaceTabMenuEvent<
  D extends WorkspaceDocument = WorkspaceDocument
> {
  name: string;
  itemId: string;
  document: D;
  payload?: unknown;
}

export interface WorkspaceTabItemRenderState {
  active: boolean;
  location: "tab" | "overflow";
  defaultContent: React.ReactNode;
}

export interface WorkspaceDocumentToolbarRenderState {
  active: boolean;
  /** The content provided on the document's `toolbar` field. */
  defaultContent: React.ReactNode;
}

export interface WorkspaceContextMenuItem {
  id: string;
  label: string;
  disabled: boolean;
  source: "built-in" | "custom";
}

export type WorkspaceSplitDirection = "right" | "down";

export interface WorkspaceTabLabels {
  rename: string;
  pin: string;
  unpin: string;
  close: string;
  closeOthers: string;
  closeAll: string;
  moveLeft: string;
  moveRight: string;
  moreTabs: string;
  /** Fallback label for the side-by-side split. */
  splitEditor?: string;
  splitRight?: string;
  splitDown?: string;
  closeSplitEditor?: string;
  resizeSplitEditor?: string;
  secondaryEditor?: string;
}

export interface DocumentWorkspaceProps<
  D extends WorkspaceDocument = WorkspaceDocument
> extends EditorDecorationsProps {
  documents: readonly D[];
  /** Default Ace mode for editor documents without a mode of their own. */
  mode?: string | object;
  /** Pass null to keep the workspace without an active document. */
  activeId?: string | null;
  defaultActiveId?: string;
  onActiveDocumentChange?: (id: string) => void;
  /** Request a close. Remove the document from `documents` after approving it. */
  onCloseDocument?: (document: D) => void;
  /** Request a batch close as one operation, allowing a single confirmation. */
  onCloseDocuments?: (documents: D[]) => void;
  onRenameDocument?: (document: D) => void;
  onTogglePin?: (document: D, pinned: boolean) => void;
  /** Receives the new order. Commit it by updating the documents prop. */
  onReorderDocuments?: (documents: D[]) => void;
  renderTabItem?: (
    document: D,
    state: WorkspaceTabItemRenderState
  ) => React.ReactNode;
  /** Render a document's toolbar. Return undefined for the default or null to hide it. */
  renderDocumentToolbar?: (
    document: D,
    state: WorkspaceDocumentToolbarRenderState
  ) => React.ReactNode;
  renderContextMenuItem?: (
    item: WorkspaceContextMenuItem,
    document: D
  ) => React.ReactNode;
  /** CSS classes on the tab context-menu surface, including Tailwind utilities. */
  contextMenuClassName?: string;
  onTabClick?: (
    document: D,
    event: React.MouseEvent<HTMLButtonElement>
  ) => void;
  onTabDoubleClick?: (
    document: D,
    event: React.MouseEvent<HTMLButtonElement>
  ) => void;
  onTabFocus?: (
    document: D,
    event: React.FocusEvent<HTMLButtonElement>
  ) => void;
  onTabContextMenuChange?: (document: D, open: boolean) => void;
  /** Custom items placed before the built-in actions. Takes precedence over tabMenuActions. */
  menus?:
    | readonly WorkspaceTabMenu<D>[]
    | ((document: D) => readonly WorkspaceTabMenu<D>[]);
  onTabMenuEvent?: (event: WorkspaceTabMenuEvent<D>) => void;
  tabMenuActions?: (document: D) => readonly WorkspaceTabMenuAction[];
  tabLabels?: Partial<WorkspaceTabLabels>;
  onAddDocument?: () => void;
  /** Enable the Split Editor action on editor tabs. Defaults to true. */
  enableSplitEditor?: boolean;
  onEditorChange?: (
    document: Extract<D, WorkspaceEditorDocument>,
    value: string,
    delta: Ace.Delta
  ) => void;
  onEditorLoad?: (editor: Ace.Editor) => void;
  /** Reports a cursor move or editor focus in either pane. */
  onEditorCursorChange?: (
    document: Extract<D, WorkspaceEditorDocument>,
    position: Ace.Point,
    editor: Ace.Editor
  ) => void;
  editorOptions?: WorkspaceEditorOptions;
  /** An Ace theme name or theme object. Defaults to the workspace's CSS theme. */
  theme?: string | Ace.Theme;
  emptyState?: React.ReactNode;
  tabBarActions?: React.ReactNode;
  tabListLabel?: string;
  addLabel?: string;
  closeLabel?: (document: D) => string;
  modifiedLabel?: string;
  className?: string;
}

export interface DocumentWorkspaceRef {
  /** Access the shared canvas when an editor document is active. */
  getAceEditor(): Ace.Editor | null;
  /** Access the active document's secondary canvas when split. */
  getSplitEditor(): Ace.Editor | null;
  /** Access any open editor document's buffer, including inactive tabs. */
  getSession(id: string): Ace.EditSession | undefined;
}

const useBrowserLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

export const DocumentWorkspace = React.forwardRef(function DocumentWorkspace<
  D extends WorkspaceDocument
>(
  props: DocumentWorkspaceProps<D>,
  ref: React.ForwardedRef<DocumentWorkspaceRef>
) {
  const {
    documents,
    activeId,
    defaultActiveId,
    onActiveDocumentChange,
    onEditorChange,
    onEditorLoad,
    onEditorCursorChange,
    renderDocumentToolbar,
    editorOptions = {},
    enableSplitEditor = true,
    tabLabels,
    mode,
    theme,
    emptyState = "No document selected",
    className
  } = props;
  type EditorDocument = Extract<D, WorkspaceEditorDocument>;
  const [selectedId, setSelectedId] = React.useState(defaultActiveId);
  const [splits, setSplits] = React.useState<
    ReadonlyMap<string, WorkspaceSplitDirection>
  >(() => new Map());
  const activeDocument =
    activeId === null
      ? undefined
      : (documents.find(
          document =>
            document.id === (activeId ?? selectedId) && !document.disabled
        ) ??
        (activeId === undefined
          ? documents.find(document => !document.disabled)
          : undefined));
  const activeEditor =
    activeDocument?.kind === "editor"
      ? (activeDocument as EditorDocument)
      : undefined;
  const activeDirection =
    enableSplitEditor && activeEditor ? splits.get(activeEditor.id) : undefined;
  const root = React.useRef<HTMLDivElement>(null);
  const activeHost = React.useRef<HTMLDivElement>(null);
  const splitHost = React.useRef<HTMLDivElement>(null);
  const [menuPortal, setMenuPortal] = React.useState<HTMLDivElement | null>(
    null
  );
  const editorHost = React.useRef<WorkspaceEditor<EditorDocument> | null>(null);
  const getPrimaryEditor = React.useCallback(
    () => editorHost.current?.getActiveEditor() ?? null,
    []
  );
  const getSecondaryEditor = React.useCallback(
    () => editorHost.current?.getSplitEditor() ?? null,
    []
  );

  useBrowserLayoutEffect(() => {
    installWorkspaceStyles(getAceInstance(), root.current);
    const host = new WorkspaceEditor<EditorDocument>();
    editorHost.current = host;
    return () => {
      host.destroy();
      editorHost.current = null;
    };
  }, []);

  React.useImperativeHandle(
    ref,
    () => ({
      getAceEditor: () => editorHost.current?.getActiveEditor() ?? null,
      getSplitEditor: () => editorHost.current?.getSplitEditor() ?? null,
      getSession: id => editorHost.current?.getSession(id)
    }),
    []
  );

  useBrowserLayoutEffect(() => {
    const host = editorHost.current;
    const openIds = new Set<string>();
    host.onChange = onEditorChange;

    for (const document of documents) {
      if (document.kind === "editor") {
        host.syncDocument(document as EditorDocument, mode);
        openIds.add(document.id);
      }
    }
    host.show(
      activeEditor,
      activeHost.current,
      editorOptions,
      theme,
      onEditorLoad
    );
    host.showSplit(
      activeEditor,
      splitHost.current,
      activeDirection,
      editorOptions,
      theme,
      tabLabels?.secondaryEditor ?? "Split pane"
    );
    const remaining = splits.size
      ? new Map(
          [...splits].filter(([id]) => enableSplitEditor && openIds.has(id))
        )
      : splits;
    host.removeClosedSessions(openIds, remaining);
    if (remaining.size !== splits.size) setSplits(remaining);
  });

  useBrowserLayoutEffect(() => {
    if (activeId === undefined && selectedId !== activeDocument?.id) {
      setSelectedId(activeDocument?.id);
    }
  }, [activeDocument?.id, activeId, selectedId]);

  function activate(id: string) {
    if (activeId === undefined) setSelectedId(id);
    onActiveDocumentChange?.(id);
  }

  function changeSplit(document: D, direction?: WorkspaceSplitDirection) {
    setSplits(current => {
      if (current.get(document.id) === direction) return current;
      const next = new Map(current);
      if (direction) next.set(document.id, direction);
      else next.delete(document.id);
      return next;
    });
    if (direction && activeDocument?.id !== document.id) activate(document.id);
  }

  const blockQuote =
    activeEditor?.blockQuote === undefined
      ? props.blockQuote
      : activeEditor.blockQuote;
  const renderGutterHint =
    activeEditor?.renderGutterHint === undefined
      ? props.renderGutterHint
      : activeEditor.renderGutterHint;
  const decorations =
    activeEditor && (blockQuote || renderGutterHint || onEditorCursorChange)
      ? {
          blockQuote,
          renderGutterHint,
          onCursorPositionChange: (position: Ace.Point, editor: Ace.Editor) => {
            const session = editorHost.current?.getSession(activeEditor.id);
            if (session?.getDocument() === editor.getSession().getDocument()) {
              onEditorCursorChange?.(activeEditor, position, editor);
            }
          }
        }
      : undefined;

  return (
    <Tabs.Root
      ref={root}
      data-slot="ace-workspace"
      className={className}
      value={activeDocument?.id ?? ""}
      activationMode="manual"
      onValueChange={activate}
    >
      <WorkspaceTabs
        {...props}
        activeId={activeDocument?.id}
        onActiveDocumentChange={activate}
        menuPortal={menuPortal}
        splits={splits}
        onSplitDirectionChange={enableSplitEditor ? changeSplit : undefined}
      />

      {documents.map(document => {
        const active = document === activeDocument;
        const renderedToolbar = renderDocumentToolbar?.(document, {
          active,
          defaultContent: document.toolbar
        });
        const toolbar =
          renderedToolbar === undefined ? document.toolbar : renderedToolbar;

        const direction =
          enableSplitEditor && document.kind === "editor"
            ? splits.get(document.id)
            : undefined;
        return (
          <Tabs.Content
            key={document.id}
            data-slot="ace-workspace-panel"
            value={document.id}
            forceMount
            hidden={!active}
            data-split={direction}
          >
            {toolbar != null && typeof toolbar !== "boolean" && (
              <div data-slot="ace-workspace-toolbar">{toolbar}</div>
            )}
            {document.kind === "editor" ? (
              <>
                <div
                  ref={active ? activeHost : undefined}
                  data-slot="ace-workspace-editor"
                />
                {direction && (
                  <>
                    <WorkspaceSplitHandle
                      direction={direction}
                      label={
                        tabLabels?.resizeSplitEditor ?? "Resize split editor"
                      }
                    />
                    <div
                      ref={active ? splitHost : undefined}
                      data-slot="ace-workspace-editor"
                      data-pane="secondary"
                    />
                  </>
                )}
              </>
            ) : (
              <WorkspaceDocumentContent scrollable={document.scrollable}>
                {document.content}
              </WorkspaceDocumentContent>
            )}
          </Tabs.Content>
        );
      })}
      {decorations && (
        <EditorDecorations
          key={`primary:${activeEditor.id}`}
          getEditor={getPrimaryEditor}
          {...decorations}
        />
      )}
      {decorations && activeDirection && (
        <EditorDecorations
          key={`secondary:${activeEditor.id}`}
          getEditor={getSecondaryEditor}
          {...decorations}
        />
      )}
      {!activeDocument && (
        <div data-slot="ace-workspace-empty">{emptyState}</div>
      )}
      <div ref={setMenuPortal} data-slot="ace-workspace-menu-portal" />
    </Tabs.Root>
  );
}) as <D extends WorkspaceDocument>(
  props: DocumentWorkspaceProps<D> & React.RefAttributes<DocumentWorkspaceRef>
) => React.ReactElement;
