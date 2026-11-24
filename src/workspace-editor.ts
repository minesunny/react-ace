import type { Ace } from "ace-builds";
import { deepEqual } from "fast-equals";
import { setAceMode } from "./ace-mode";
import { attachAceScrollbars } from "./ace-scrollbars";
import { getAceInstance } from "./editorOptions";
import type {
  WorkspaceEditorDocument,
  WorkspaceEditorOptions,
  WorkspaceSplitDirection
} from "./workspace";

const workspaceTheme: Ace.Theme = {
  cssClass: "react-ace-workspace-theme",
  cssText: "",
  padding: 12
};

class EditorPane {
  private editor: Ace.Editor | null = null;
  private emptySession: Ace.EditSession | null = null;
  private options: WorkspaceEditorOptions = {};
  private defaultOptions: WorkspaceEditorOptions = {};
  private theme: string | Ace.Theme;
  private detachScrollbars?: () => void;

  constructor(private ace: ReturnType<typeof getAceInstance>) {}

  public show(
    document: WorkspaceEditorDocument | undefined,
    host: HTMLDivElement | null,
    session: Ace.EditSession | undefined,
    options: WorkspaceEditorOptions,
    theme: string | Ace.Theme | undefined,
    onLoad?: (editor: Ace.Editor) => void,
    label?: string
  ) {
    if (!document || !host || !session) {
      if (this.editor?.container.parentNode) {
        this.editor.blur();
        this.editor.setSession(this.emptySession);
        this.editor.container.remove();
      }
      return;
    }

    const isNew = !this.editor;
    if (!this.editor) {
      const canvas = host.ownerDocument.createElement("div");
      canvas.className = "react-ace-workspace-canvas";
      host.appendChild(canvas);
      this.editor = this.ace.edit(canvas);
      this.emptySession = this.editor.getSession();
      this.detachScrollbars = attachAceScrollbars(this.editor);
      if (typeof ResizeObserver !== "undefined") {
        this.editor.setOption("useResizeObserver", true);
      }
      this.editor.setShowPrintMargin(false);
      this.editor.setFontSize(13);
    }

    const editor = this.editor;
    const moved = editor.container.parentNode !== host;
    if (moved) host.appendChild(editor.container);

    const switched = editor.getSession() !== session;
    if (switched) editor.setSession(session);
    editor.setReadOnly(document.readOnly ?? false);
    editor.setOption("textInputAriaLabel", label ?? document.label);

    const nextTheme =
      (theme && (typeof theme === "string" ? `ace/theme/${theme}` : theme)) ||
      workspaceTheme;
    if (isNew || !deepEqual(this.theme, nextTheme)) {
      editor.setTheme(nextTheme);
      this.theme = nextTheme;
    }
    if (!deepEqual(this.options, options)) {
      for (const name of Object.keys(
        options
      ) as (keyof WorkspaceEditorOptions)[]) {
        if (!(name in this.defaultOptions)) {
          Object.assign(this.defaultOptions, {
            [name]: editor.getOption(name)
          });
        }
      }
      editor.setOptions({ ...this.defaultOptions, ...options });
      this.options = options;
    }
    if (isNew || moved || switched) editor.resize(true);
    if (isNew) onLoad?.(editor);
  }

  public getActiveEditor() {
    return this.editor?.container.parentNode ? this.editor : null;
  }

  public destroy() {
    if (!this.editor) return;
    // Ace destroys its attached session with the canvas.
    this.show(undefined, null, undefined, {}, undefined);
    this.detachScrollbars?.();
    this.editor.destroy();
    this.editor = null;
  }
}

function createSplitSession(
  ace: ReturnType<typeof getAceInstance>,
  primary: Ace.EditSession
) {
  const session = ace.createEditSession(primary.getDocument());
  session.setUseWorker(false);

  // Document edits already reach the primary session. Keep one history and
  // one worker while letting each pane own its selection, scroll and folds.
  const ignore = () => {};
  session.setUndoManager(
    new Proxy(primary.getUndoManager(), {
      get(_target, key) {
        const history = primary.getUndoManager();
        if (key === "add" || key === "addSession" || key === "addSelection") {
          return ignore;
        }
        if (key === "undo" || key === "redo") {
          return (_session: Ace.EditSession, dontSelect = true) =>
            history[key](primary, dontSelect);
        }
        const value = Reflect.get(history, key);
        return typeof value === "function" ? value.bind(history) : value;
      }
    })
  );

  const mode = () => session.setMode(primary.getMode());
  const annotations = () => session.setAnnotations(primary.getAnnotations());
  const tabSize = () => session.setTabSize(primary.getTabSize());
  const wrap = () => session.setUseWrapMode(primary.getUseWrapMode());
  mode();
  annotations();
  tabSize();
  wrap();
  session.setUseSoftTabs(primary.getUseSoftTabs());
  session.getSelection().fromJSON(primary.getSelection().toJSON());
  session.setScrollLeft(primary.getScrollLeft());
  session.setScrollTop(primary.getScrollTop());

  primary.on("changeMode", mode);
  primary.on("changeAnnotation", annotations);
  primary.on("changeTabSize", tabSize);
  primary.on("changeWrapMode", wrap);
  return {
    session,
    destroy() {
      primary.off("changeMode", mode);
      primary.off("changeAnnotation", annotations);
      primary.off("changeTabSize", tabSize);
      primary.off("changeWrapMode", wrap);
      session.destroy();
    }
  };
}

type SessionEntry<D> = {
  document: D;
  session: Ace.EditSession;
  syncing: boolean;
  controlledValue?: {
    buffer: Ace.Document;
    newline: string;
    value: string;
  };
  mode?: string | object;
  split?: ReturnType<typeof createSplitSession>;
};

export class WorkspaceEditor<D extends WorkspaceEditorDocument> {
  private ace = getAceInstance();
  private sessions = new Map<string, SessionEntry<D>>();
  private primary = new EditorPane(this.ace);
  private secondary: EditorPane | undefined;
  private splitDirection?: WorkspaceSplitDirection;
  public onChange?: (document: D, value: string, delta: Ace.Delta) => void;

  public syncDocument(document: D, defaultMode?: string | object) {
    const previous = this.sessions.get(document.id);
    let entry = previous;
    if (!entry) {
      const session = this.ace.createEditSession(
        document.value ?? document.defaultValue ?? ""
      );
      const created: SessionEntry<D> = { document, session, syncing: false };
      session.on("change", delta => {
        created.controlledValue = undefined;
        if (created.syncing || !this.onChange) return;

        const value = session.getValue();
        if (created.document.value !== undefined) {
          const buffer = session.getDocument();
          // Cache before notifying the caller so a reentrant edit can replace
          // this snapshot with its newer value.
          created.controlledValue = {
            buffer,
            newline: buffer.getNewLineCharacter(),
            value
          };
        }
        this.onChange(created.document, value, delta);
      });
      this.sessions.set(document.id, created);
      entry = created;
    }

    const oldDocument = previous?.document;
    const { session } = entry;
    entry.document = document;
    if (!previous || oldDocument.useWorker !== document.useWorker) {
      session.setUseWorker(document.useWorker ?? false);
    }
    const mode = document.mode ?? defaultMode;
    if (!previous || entry.mode !== mode) {
      setAceMode(this.ace, session, mode);
      entry.mode = mode;
    }
    if (!previous || oldDocument.tabSize !== document.tabSize) {
      session.setTabSize(document.tabSize ?? 4);
    }
    if (!previous || oldDocument.wrap !== document.wrap) {
      session.setUseWrapMode(document.wrap ?? false);
    }

    const { value } = document;
    if (value === undefined) {
      entry.controlledValue = undefined;
      return;
    }

    // Tab changes also reconcile inactive sessions. Avoid joining every
    // unchanged controlled buffer back into a string on each reconciliation.
    const buffer = session.getDocument();
    const newline = buffer.getNewLineCharacter();
    const cached = entry.controlledValue;
    const cachedValue =
      cached?.buffer === buffer && cached.newline === newline
        ? cached.value
        : undefined;
    if (cachedValue === value) return;
    if (cachedValue === undefined && session.getValue() === value) {
      entry.controlledValue = { buffer, newline, value };
      return;
    }

    entry.controlledValue = undefined;
    const selection = session.getSelection();
    const position = selection.toJSON();
    entry.syncing = true;
    try {
      session.setValue(value);
      selection.fromJSON(position);
    } finally {
      entry.syncing = false;
    }
  }

  public show(
    document: D | undefined,
    host: HTMLDivElement | null,
    options: WorkspaceEditorOptions,
    theme: string | Ace.Theme | undefined,
    onLoad?: (editor: Ace.Editor) => void
  ) {
    const session = document && this.sessions.get(document.id)?.session;
    this.primary.show(document, host, session, options, theme, onLoad);
  }

  public showSplit(
    document: D | undefined,
    host: HTMLDivElement | null,
    direction: WorkspaceSplitDirection | undefined,
    options: WorkspaceEditorOptions,
    theme: string | Ace.Theme | undefined,
    paneLabel: string
  ) {
    if (!document || !host || !direction) {
      if (this.secondary) {
        this.secondary.destroy();
        this.secondary = undefined;
        this.splitDirection = undefined;
        this.primary.getActiveEditor()?.resize(true);
      }
      return;
    }

    const isNew = !this.secondary;
    const entry = this.sessions.get(document.id);
    entry.split ??= createSplitSession(this.ace, entry.session);
    this.secondary ??= new EditorPane(this.ace);
    this.secondary.show(
      document,
      host,
      entry.split.session,
      options,
      theme,
      undefined,
      `${document.label}, ${paneLabel}`
    );
    if (this.splitDirection !== direction) {
      this.splitDirection = direction;
      this.primary.getActiveEditor()?.resize(true);
      if (!isNew) this.secondary.getActiveEditor()?.resize(true);
    }
  }

  public getSession(id: string) {
    return this.sessions.get(id)?.session;
  }

  public getActiveEditor() {
    return this.primary.getActiveEditor();
  }

  public getSplitEditor() {
    return this.secondary?.getActiveEditor() ?? null;
  }

  public removeClosedSessions(
    openIds: ReadonlySet<string>,
    splits: ReadonlyMap<string, WorkspaceSplitDirection>
  ) {
    for (const [id, entry] of this.sessions) {
      if (openIds.has(id)) {
        if (entry.split && !splits.has(id)) {
          entry.split.destroy();
          entry.split = undefined;
        }
      } else {
        entry.split?.destroy();
        entry.session.destroy();
        this.sessions.delete(id);
      }
    }
  }

  public destroy() {
    this.secondary?.destroy();
    this.primary.destroy();
    this.removeClosedSessions(new Set(), new Map());
  }
}
