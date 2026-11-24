import type { Ace } from "ace-builds";
import { createEditSession } from "ace-builds";
import * as React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { expect, vi } from "vitest";
import ReactAce, { type WorkspaceDocumentToolbarRenderState } from "../../src";
import {
  DocumentWorkspace,
  type DocumentWorkspaceRef,
  type WorkspaceDocument,
  type WorkspaceEditorDocument
} from "../../src/workspace";

const query: WorkspaceEditorDocument = {
  id: "query",
  kind: "editor",
  label: "Query.sql",
  mode: "sql",
  defaultValue: "SELECT 1;"
};

const settings: WorkspaceEditorDocument = {
  id: "settings",
  kind: "editor",
  label: "Settings.json",
  mode: "json",
  defaultValue: "{}",
  readOnly: true
};

function activate(label: string) {
  fireEvent.keyDown(screen.getByRole("tab", { name: label }), { key: "Enter" });
}

describe("DocumentWorkspace", () => {
  it("supports both editor modes through the same ReactAce export and ref", async () => {
    const ref = React.createRef<ReactAce>();
    const { rerender } = render(<ReactAce ref={ref} value="single" />);
    const instance = ref.current;
    const singleEditor = instance.editor;
    expect(ReactAce.displayName).toBe("ReactAce");
    expect(singleEditor.getValue()).toBe("single");

    rerender(<ReactAce ref={ref} documents={[query, settings]} />);
    await screen.findByRole("tab", { name: query.label });
    expect(ref.current).toBe(instance);
    expect(ref.current.getAceEditor()).not.toBe(singleEditor);
    expect(ref.current.getSession(query.id)?.getValue()).toBe(
      query.defaultValue
    );

    rerender(<ReactAce ref={ref} value="single again" />);
    expect(ref.current).toBe(instance);
    expect(ref.current.editor.getValue()).toBe("single again");
    expect(ref.current.getSession(query.id)).toBeUndefined();
  });

  it("loads the single editor mode and switches it when the prop changes", async () => {
    const ref = React.createRef<ReactAce>();
    const { rerender } = render(
      <ReactAce ref={ref} mode="sql" defaultValue="SELECT 1;" />
    );

    const session = ref.current.getAceEditor().getSession();
    await waitFor(() => {
      expect(session.getMode().$id).toBe("ace/mode/sql");
      expect(session.getTokens(0)[0]).toEqual({
        type: "keyword",
        value: "SELECT"
      });
    });

    rerender(
      <ReactAce ref={ref} mode="ace/mode/python" value="def example():" />
    );
    await waitFor(() => {
      expect(session.getMode().$id).toBe("ace/mode/python");
      expect(session.getTokens(0)[0]).toEqual({
        type: "keyword",
        value: "def"
      });
    });

    rerender(
      <ReactAce
        ref={ref}
        mode="typescript"
        value="const name: string = 'example';"
      />
    );
    await waitFor(() =>
      expect(session.getMode().$id).toBe("ace/mode/typescript")
    );
  });

  it("forwards and updates context-menu classes through the ReactAce export", async () => {
    const documents = [query];
    const firstClass = "w-64 rounded-xl [&_[role=menuitem]]:min-h-8";
    const { rerender } = render(
      <ReactAce documents={documents} contextMenuClassName={firstClass} />
    );
    fireEvent.contextMenu(
      await screen.findByRole("tab", { name: query.label })
    );
    const menu = screen.getByRole("menu", { name: query.label });
    expect(menu.getAttribute("class")).toBe(firstClass);

    rerender(
      <ReactAce documents={documents} contextMenuClassName="w-72 rounded-md" />
    );
    expect(screen.getByRole("menu", { name: query.label })).toBe(menu);
    expect(menu.getAttribute("class")).toBe("w-72 rounded-md");
    expect(screen.getByRole("menuitem", { name: "Split Right" })).toBeTruthy();

    rerender(<ReactAce documents={documents} />);
    expect(menu.getAttribute("class") ?? "").toBe("");
    expect(menu.getAttribute("data-slot")).toBe("ace-workspace-menu");
  });

  it("loads the default workspace mode and preserves a document override", async () => {
    const ref = React.createRef<ReactAce>();
    const documents = [{ ...query, mode: undefined }, settings];
    const { rerender } = render(
      <ReactAce ref={ref} mode="sql" documents={documents} />
    );
    await screen.findByRole("tab", { name: query.label });
    const querySession = ref.current.getSession(query.id);
    const settingsSession = ref.current.getSession(settings.id);
    await waitFor(() => {
      expect(querySession.getMode().$id).toBe("ace/mode/sql");
      expect(settingsSession.getMode().$id).toBe("ace/mode/json");
    });

    rerender(<ReactAce ref={ref} mode="mysql" documents={documents} />);
    await waitFor(() =>
      expect(querySession.getMode().$id).toBe("ace/mode/mysql")
    );
    expect(settingsSession.getMode().$id).toBe("ace/mode/json");
  });

  it("reuses the canvas while keeping each document's buffer, selection, and undo history", () => {
    const ref = React.createRef<DocumentWorkspaceRef>();
    const onEditorChange = vi.fn();
    render(
      <DocumentWorkspace
        ref={ref}
        documents={[query, settings]}
        onEditorChange={onEditorChange}
      />
    );
    const editor = ref.current.getAceEditor();
    const querySession = ref.current.getSession(query.id);
    const settingsSession = ref.current.getSession(settings.id);

    act(() => {
      editor.moveCursorTo(0, 0);
      editor.insert("-- note\n");
      querySession.getUndoManager().startNewGroup();
      editor.moveCursorTo(1, 4);
    });
    expect(onEditorChange).toHaveBeenLastCalledWith(
      query,
      "-- note\nSELECT 1;",
      expect.any(Object)
    );

    activate(settings.label);
    expect(ref.current.getAceEditor()).toBe(editor);
    expect(editor.getSession()).toBe(settingsSession);
    expect(editor.getReadOnly()).toBe(true);
    expect(editor.getValue()).toBe("{}");

    activate(query.label);
    expect(editor.getSession()).toBe(querySession);
    expect(editor.getCursorPosition()).toEqual({ row: 1, column: 4 });
    expect(editor.getReadOnly()).toBe(false);
    act(() => editor.undo());
    expect(editor.getValue()).toBe("SELECT 1;");
  });

  it("keeps custom document state mounted while the canvas moves between document types", () => {
    const ref = React.createRef<DocumentWorkspaceRef>();
    const preview: WorkspaceDocument = {
      id: "preview",
      kind: "custom",
      label: "Preview",
      content: <input aria-label="Filter results" defaultValue="" />
    };
    render(
      <DocumentWorkspace
        ref={ref}
        documents={[query, preview]}
        defaultActiveId={preview.id}
      />
    );
    expect(ref.current.getAceEditor()).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter results" }), {
      target: { value: "pending" }
    });

    activate(query.label);
    const editor = ref.current.getAceEditor();
    expect(editor).toBeTruthy();
    expect(
      screen.queryByRole("textbox", { name: "Filter results" })
    ).toBeNull();

    activate(preview.label);
    expect(ref.current.getAceEditor()).toBeNull();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Filter results"
        }) as HTMLInputElement
      ).value
    ).toBe("pending");

    activate(query.label);
    expect(ref.current.getAceEditor()).toBe(editor);
  });

  it("waits for controlled removal before destroying a closed session", () => {
    const ref = React.createRef<DocumentWorkspaceRef>();
    const onCloseDocument = vi.fn();
    const props = { ref, onCloseDocument };
    const { rerender } = render(
      <DocumentWorkspace {...props} documents={[query, settings]} />
    );
    const querySession = ref.current.getSession(query.id);
    const destroy = vi.spyOn(querySession, "destroy");

    const tab = screen.getByRole("tab", { name: query.label });
    act(() => tab.focus());
    fireEvent.keyDown(tab, { key: "Delete" });
    expect(onCloseDocument).toHaveBeenCalledWith(query);
    expect(destroy).not.toHaveBeenCalled();
    expect(ref.current.getAceEditor().getSession()).toBe(querySession);

    rerender(<DocumentWorkspace {...props} documents={[settings]} />);
    expect(ref.current.getSession(query.id)).toBeUndefined();
    expect(destroy).toHaveBeenCalledOnce();
    expect(ref.current.getAceEditor().getSession()).toBe(
      ref.current.getSession(settings.id)
    );
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: settings.label })
    );
  });

  it("synchronizes an inactive controlled buffer without emitting a user change", () => {
    const ref = React.createRef<DocumentWorkspaceRef>();
    const onEditorChange = vi.fn();
    const { rerender } = render(
      <DocumentWorkspace
        ref={ref}
        documents={[query, settings]}
        onEditorChange={onEditorChange}
      />
    );
    const changed = { ...settings, value: '{"limit":12}' };
    rerender(
      <DocumentWorkspace
        ref={ref}
        documents={[query, changed]}
        onEditorChange={onEditorChange}
      />
    );
    expect(ref.current.getSession(settings.id).getValue()).toBe(changed.value);
    expect(onEditorChange).not.toHaveBeenCalled();
  });

  it("reuses unchanged controlled buffers and rechecks them after Ace edits", () => {
    const ref = React.createRef<DocumentWorkspaceRef>();
    const controlled = { ...settings, value: '{\n  "limit": 12\n}' };
    const { rerender } = render(
      <DocumentWorkspace ref={ref} documents={[query, controlled]} />
    );
    const session = ref.current.getSession(controlled.id);
    const getValue = vi.spyOn(session, "getValue");
    const nextDocuments = [query, { ...controlled, label: "Renamed.json" }];

    rerender(<DocumentWorkspace ref={ref} documents={nextDocuments} />);
    expect(getValue).not.toHaveBeenCalled();

    act(() => session.insert({ row: 1, column: 0 }, " "));
    rerender(<DocumentWorkspace ref={ref} documents={nextDocuments} />);
    expect(getValue).toHaveBeenCalled();
    expect(session.getValue()).toBe(controlled.value);
    getValue.mockRestore();
  });

  it("reuses emitted split edits while accepting reentrant changes and controlled rejection", () => {
    const ref = React.createRef<DocumentWorkspaceRef>();
    const controlled = { ...query, value: "SELECT 1;" };
    const onEditorChange = vi.fn((_document, value: string) => {
      if (value.endsWith("!")) {
        ref.current
          .getSession(query.id)
          .insert({ row: 0, column: value.length }, "?");
      }
    });
    const props = { ref, onEditorChange };
    const { rerender } = render(
      <DocumentWorkspace {...props} documents={[controlled]} />
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: query.label }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Split Right" }));

    const source = ref.current.getSession(query.id);
    const secondary = ref.current.getSplitEditor().getSession();
    const getValue = vi.spyOn(source, "getValue");
    act(() =>
      secondary.insert({ row: 0, column: controlled.value.length }, "!")
    );
    expect(onEditorChange.mock.calls.map(([, value]) => value)).toEqual([
      "SELECT 1;!",
      "SELECT 1;!?"
    ]);
    expect(getValue).toHaveBeenCalledTimes(2);

    const accepted = { ...controlled, value: "SELECT 1;!?" };
    rerender(<DocumentWorkspace {...props} documents={[accepted]} />);
    expect(getValue).toHaveBeenCalledTimes(2);
    expect(secondary.getValue()).toBe(accepted.value);

    act(() => secondary.insert({ row: 0, column: accepted.value.length }, " "));
    rerender(<DocumentWorkspace {...props} documents={[accepted]} />);
    expect(source.getValue()).toBe(accepted.value);
    expect(secondary.getValue()).toBe(accepted.value);
    expect(onEditorChange).toHaveBeenCalledTimes(3);
    getValue.mockRestore();
  });

  it("rechecks a controlled buffer after its newline mode changes without resetting it", () => {
    const ref = React.createRef<DocumentWorkspaceRef>();
    const controlled = { ...query, value: "SELECT 1;\nSELECT 2;" };
    const { rerender } = render(
      <DocumentWorkspace ref={ref} documents={[controlled]} />
    );
    const session = ref.current.getSession(query.id);
    const getValue = vi.spyOn(session, "getValue");
    const setValue = vi.spyOn(session, "setValue");
    act(() => session.setNewLineMode("windows"));
    const accepted = { ...controlled, value: "SELECT 1;\r\nSELECT 2;" };

    rerender(<DocumentWorkspace ref={ref} documents={[accepted]} />);
    expect(getValue).toHaveBeenCalledTimes(1);
    expect(setValue).not.toHaveBeenCalled();
    expect(session.getDocument().getNewLineCharacter()).toBe("\r\n");

    rerender(<DocumentWorkspace ref={ref} documents={[{ ...accepted }]} />);
    expect(getValue).toHaveBeenCalledTimes(1);
    getValue.mockRestore();
    setValue.mockRestore();
  });

  it("restores the controlled value after replacing the Ace document", () => {
    const ref = React.createRef<DocumentWorkspaceRef>();
    const onEditorChange = vi.fn();
    const controlled = { ...query, value: "SELECT 1;" };
    const props = { ref, onEditorChange, documents: [controlled] };
    const { rerender, unmount } = render(<DocumentWorkspace {...props} />);
    const session = ref.current.getSession(query.id);
    const replacement = createEditSession("SELECT 99;");

    act(() => session.setDocument(replacement.getDocument()));
    expect(session.getValue()).toBe("SELECT 99;");
    rerender(<DocumentWorkspace {...props} />);
    expect(session.getDocument()).toBe(replacement.getDocument());
    expect(session.getValue()).toBe(controlled.value);
    expect(onEditorChange).not.toHaveBeenCalled();
    unmount();
    replacement.destroy();
  });

  it("offers document actions and excludes pinned, disabled, and non-closable tabs from batch close", () => {
    const pinned = { ...settings, pinned: true };
    const protectedDocument = {
      ...settings,
      id: "locked",
      label: "Locked",
      closable: false
    };
    const disabled = {
      ...settings,
      id: "disabled",
      label: "Disabled",
      disabled: true
    };
    const onCloseDocuments = vi.fn();
    const onRenameDocument = vi.fn();
    const onTogglePin = vi.fn();
    render(
      <DocumentWorkspace
        documents={[query, pinned, protectedDocument, disabled]}
        onCloseDocuments={onCloseDocuments}
        onRenameDocument={onRenameDocument}
        onTogglePin={onTogglePin}
      />
    );

    const queryTab = screen.getByRole("tab", { name: query.label });
    const pinnedTab = screen.getByRole("tab", { name: pinned.label });
    expect(screen.getAllByRole("tab")[0]).toBe(pinnedTab);
    fireEvent.contextMenu(queryTab);
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(onRenameDocument).toHaveBeenCalledWith(query);

    fireEvent.contextMenu(pinnedTab);
    expect(
      screen
        .getByRole("menuitem", { name: "Close tab" })
        .getAttribute("aria-disabled")
    ).toBe("true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Unpin tab" }));
    expect(onTogglePin).toHaveBeenCalledWith(pinned, false);

    fireEvent.contextMenu(pinnedTab);
    fireEvent.click(screen.getByRole("menuitem", { name: "Close all tabs" }));
    expect(onCloseDocuments).toHaveBeenCalledExactlyOnceWith([query]);
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });

  it("renders custom tab and menu contents while preserving names and callbacks", () => {
    const onTabClick = vi.fn();
    const onTabDoubleClick = vi.fn();
    const onTabFocus = vi.fn();
    const onTabContextMenuChange = vi.fn();
    const onSelect = vi.fn();
    const renderMenuItem = vi.fn(item => <span>{item.source} action</span>);
    render(
      <DocumentWorkspace
        documents={[query]}
        renderTabItem={(document, state) => (
          <span>
            {state.active ? "Active " : ""}
            {document.mode?.toUpperCase()}
          </span>
        )}
        tabMenuActions={() => [{ id: "inspect", label: "Inspect", onSelect }]}
        renderContextMenuItem={renderMenuItem}
        onTabClick={onTabClick}
        onTabDoubleClick={onTabDoubleClick}
        onTabFocus={onTabFocus}
        onTabContextMenuChange={onTabContextMenuChange}
      />
    );
    const tab = screen.getByRole("tab", { name: query.label });
    expect(tab.textContent).toBe("Active SQL");
    act(() => tab.focus());
    fireEvent.click(tab);
    fireEvent.doubleClick(tab);
    expect(onTabFocus).toHaveBeenCalledWith(query, expect.any(Object));
    expect(onTabClick).toHaveBeenCalledWith(query, expect.any(Object));
    expect(onTabDoubleClick).toHaveBeenCalledWith(query, expect.any(Object));
    expect(renderMenuItem).not.toHaveBeenCalled();

    fireEvent.contextMenu(tab);
    expect(onTabContextMenuChange).toHaveBeenLastCalledWith(query, true);
    const item = screen.getByRole("menuitem", { name: "Inspect" });
    expect(item.textContent).toBe("custom action");
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onTabContextMenuChange).toHaveBeenLastCalledWith(query, false);
  });

  it("keeps the context menu open when the opening gesture ends over an item", () => {
    const onRenameDocument = vi.fn();
    render(
      <DocumentWorkspace
        documents={[query]}
        onRenameDocument={onRenameDocument}
      />
    );

    fireEvent.contextMenu(screen.getByRole("tab", { name: query.label }));
    const item = screen.getByRole("menuitem", { name: "Rename" });
    for (const init of [{ button: 2 }, { button: 0, ctrlKey: true }]) {
      fireEvent(
        item,
        new MouseEvent("pointerup", {
          ...init,
          bubbles: true,
          cancelable: true
        })
      );
      expect(onRenameDocument).not.toHaveBeenCalled();
      expect(screen.getByRole("menu", { name: query.label })).toBeTruthy();
    }

    fireEvent.click(item);
    expect(onRenameDocument).toHaveBeenCalledExactlyOnceWith(query);
    expect(screen.queryByRole("menu", { name: query.label })).toBeNull();
  });

  it("runs callback menu items locally and forwards named menu events with the target document", () => {
    const onSelect = vi.fn();
    const onTabMenuEvent = vi.fn();
    const payload = { dialog: "compact" };
    const menus = (document: WorkspaceDocument) => [
      { id: "inspect", label: "Inspect", type: "callback" as const, onSelect },
      {
        id: "rename",
        label: "Rename",
        type: "event" as const,
        event: "rename",
        payload,
        disabled: document.id === settings.id
      }
    ];
    const { rerender } = render(
      <DocumentWorkspace
        documents={[query, settings]}
        menus={menus}
        onTabMenuEvent={onTabMenuEvent}
      />
    );
    const openMenu = (label: string) =>
      fireEvent.contextMenu(screen.getByRole("tab", { name: label }));
    const rename = () => screen.getByRole("menuitem", { name: "Rename" });

    openMenu(query.label);
    fireEvent.click(screen.getByRole("menuitem", { name: "Inspect" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(query);
    expect(onTabMenuEvent).not.toHaveBeenCalled();

    openMenu(query.label);
    fireEvent.click(rename());
    expect(onTabMenuEvent).toHaveBeenCalledExactlyOnceWith({
      name: "rename",
      itemId: "rename",
      document: query,
      payload
    });
    expect(onSelect).toHaveBeenCalledTimes(1);

    openMenu(settings.label);
    expect(rename().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(rename());
    expect(onTabMenuEvent).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(rename(), { key: "Escape" });

    rerender(<DocumentWorkspace documents={[query, settings]} menus={menus} />);
    openMenu(query.label);
    expect(rename().getAttribute("aria-disabled")).toBe("true");
  });

  it("updates an open lazy menu with the current document, content, and callback", () => {
    const initialSelect = vi.fn();
    const nextSelect = vi.fn();
    const renderMenuItem = vi.fn(item => <span>{item.label}</span>);
    const { rerender } = render(
      <DocumentWorkspace
        documents={[query]}
        menus={[
          { id: "run", label: "Run", type: "callback", onSelect: initialSelect }
        ]}
        renderContextMenuItem={renderMenuItem}
      />
    );
    expect(renderMenuItem).not.toHaveBeenCalled();
    fireEvent.contextMenu(screen.getByRole("tab", { name: query.label }));
    expect(
      screen.getByRole("menuitem", { name: "Run", exact: true })
    ).toBeTruthy();

    const renamed = { ...query, label: "Current.sql" };
    rerender(
      <DocumentWorkspace
        documents={[renamed]}
        menus={[
          {
            id: "run",
            label: "Run current",
            type: "callback",
            onSelect: nextSelect
          }
        ]}
        renderContextMenuItem={item => <span>Updated {item.label}</span>}
      />
    );
    expect(screen.getByRole("menu", { name: renamed.label })).toBeTruthy();
    expect(
      screen.queryByRole("menuitem", { name: "Run", exact: true })
    ).toBeNull();
    const action = screen.getByRole("menuitem", { name: "Run current" });
    expect(action.textContent).toBe("Updated Run current");
    fireEvent.click(action);
    expect(nextSelect).toHaveBeenCalledExactlyOnceWith(renamed);
    expect(initialSelect).not.toHaveBeenCalled();
  });

  it("splits the target document with separate views and one undo history", async () => {
    const ref = React.createRef<ReactAce>();
    const onEditorChange = vi.fn();
    const preview: WorkspaceDocument = {
      id: "preview",
      kind: "custom",
      label: "Preview",
      content: <span>Preview content</span>
    };
    const documents = [query, settings, preview];
    const { rerender } = render(
      <ReactAce
        ref={ref}
        documents={documents}
        onEditorChange={onEditorChange}
      />
    );
    const queryTab = await screen.findByRole("tab", { name: query.label });
    const primary = ref.current.getAceEditor();
    const source = ref.current.getSession(query.id);

    const chooseSplit = (
      tab: HTMLElement,
      action: "Split Right" | "Split Down"
    ) => {
      fireEvent.contextMenu(tab);
      fireEvent.click(
        screen.getByRole("menuitem", { name: action, exact: true })
      );
    };

    expect(ref.current.getSplitEditor()).toBeNull();
    chooseSplit(
      screen.getByRole("tab", { name: settings.label }),
      "Split Down"
    );
    expect(screen.getByRole("tabpanel").getAttribute("data-split")).toBe(
      "down"
    );
    expect(ref.current.getAceEditor()).toBe(primary);
    expect(ref.current.getSplitEditor().getReadOnly()).toBe(true);
    expect(ref.current.getSplitEditor().getSession().getDocument()).toBe(
      ref.current.getSession(settings.id).getDocument()
    );

    chooseSplit(queryTab, "Split Right");
    expect(screen.getByRole("tabpanel").getAttribute("data-split")).toBe(
      "right"
    );
    const secondary = ref.current.getSplitEditor();
    const split = secondary.getSession();
    expect(split).not.toBe(source);
    expect(split.getDocument()).toBe(source.getDocument());
    expect(primary.getSession()).toBe(source);
    expect(split.getUseWorker()).toBe(false);

    act(() => {
      primary.moveCursorTo(0, 1);
      secondary.navigateFileEnd();
      secondary.insert(" -- note");
    });
    expect(primary.getCursorPosition()).toEqual({ row: 0, column: 1 });
    expect(secondary.getCursorPosition().column).toBeGreaterThan(1);
    expect(onEditorChange).toHaveBeenCalledExactlyOnceWith(
      query,
      "SELECT 1; -- note",
      expect.any(Object)
    );
    act(() => secondary.undo());
    expect(primary.getValue()).toBe(query.defaultValue);
    act(() => primary.redo());
    expect(secondary.getValue()).toBe("SELECT 1; -- note");

    fireEvent.keyDown(
      screen.getByRole("separator", { name: "Resize split editor" }),
      {
        key: "ArrowRight"
      }
    );
    const divider = screen.getByRole("separator");
    expect(divider.getAttribute("aria-orientation")).toBe("vertical");
    expect(divider.getAttribute("aria-valuenow")).toBe("55");

    const primaryCursor = primary.getCursorPosition();
    const secondaryCursor = secondary.getCursorPosition();
    chooseSplit(queryTab, "Split Down");
    expect(screen.getByRole("tabpanel").getAttribute("data-split")).toBe(
      "down"
    );
    expect(ref.current.getSplitEditor()).toBe(secondary);
    expect(secondary.getSession()).toBe(split);
    expect(primary.getValue()).toBe("SELECT 1; -- note");
    expect(primary.getCursorPosition()).toEqual(primaryCursor);
    expect(secondary.getCursorPosition()).toEqual(secondaryCursor);
    expect(divider.getAttribute("aria-orientation")).toBe("horizontal");
    expect(divider.getAttribute("aria-valuenow")).toBe("55");
    fireEvent.keyDown(divider, { key: "ArrowRight" });
    expect(divider.getAttribute("aria-valuenow")).toBe("55");
    fireEvent.keyDown(divider, { key: "ArrowDown" });
    expect(divider.getAttribute("aria-valuenow")).toBe("60");

    activate(preview.label);
    expect(ref.current.getSplitEditor()).toBeNull();
    activate(query.label);
    expect(ref.current.getSplitEditor().getSession()).toBe(split);
    expect(screen.getByRole("tabpanel").getAttribute("data-split")).toBe(
      "down"
    );
    expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe(
      "60"
    );

    const destroy = vi.spyOn(split, "destroy");
    await waitFor(() => expect(split.getMode().$id).toBe("ace/mode/sql"));
    const controlled = {
      ...query,
      value: "SELECT 9;",
      mode: "python",
      wrap: true,
      tabSize: 2
    };
    onEditorChange.mockClear();
    rerender(
      <ReactAce
        ref={ref}
        documents={[controlled, settings, preview]}
        onEditorChange={onEditorChange}
      />
    );
    await waitFor(() => expect(split.getMode().$id).toBe("ace/mode/python"));
    expect(split.getValue()).toBe(controlled.value);
    expect(split.getUseWrapMode()).toBe(true);
    expect(split.getTabSize()).toBe(2);
    expect(onEditorChange).not.toHaveBeenCalled();

    fireEvent.contextMenu(queryTab);
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Close Split Editor", exact: true })
    );
    expect(destroy).toHaveBeenCalledOnce();
    expect(ref.current.getSplitEditor()).toBeNull();
    expect(ref.current.getAceEditor()).toBe(primary);
    expect(primary.getSession()).toBe(source);
    expect(primary.getValue()).toBe(controlled.value);
  });

  it("clears a removed document's split state and keeps custom document menus intact", () => {
    const ref = React.createRef<DocumentWorkspaceRef>();
    const preview: WorkspaceDocument = {
      id: "preview",
      kind: "custom",
      label: "Preview",
      content: "Preview content"
    };
    const inspect = vi.fn();
    const select = (label: string, action: string) => {
      fireEvent.contextMenu(screen.getByRole("tab", { name: label }));
      fireEvent.click(
        screen.getByRole("menuitem", { name: action, exact: true })
      );
    };
    const props = {
      ref,
      tabLabels: {
        splitEditor: "Split to the right",
        splitDown: "Split below"
      },
      menus: [
        {
          id: "inspect",
          label: "Inspect",
          type: "callback" as const,
          onSelect: inspect
        }
      ]
    };

    const { rerender } = render(
      <DocumentWorkspace {...props} documents={[query, preview]} />
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: preview.label }));
    expect(
      screen.queryByRole("menuitem", { name: "Split to the right" })
    ).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Split below" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Inspect" }));
    expect(inspect).toHaveBeenCalledExactlyOnceWith(preview);

    select(query.label, "Split to the right");
    select(query.label, "Split below");
    expect(screen.getByRole("tabpanel").getAttribute("data-split")).toBe(
      "down"
    );
    const destroyPrimary = vi.spyOn(
      ref.current.getSession(query.id),
      "destroy"
    );
    const destroySplit = vi.spyOn(
      ref.current.getSplitEditor().getSession(),
      "destroy"
    );
    rerender(<DocumentWorkspace {...props} documents={[preview]} />);
    expect(destroyPrimary).toHaveBeenCalledOnce();
    expect(destroySplit).toHaveBeenCalledOnce();
    expect(ref.current.getSplitEditor()).toBeNull();

    rerender(<DocumentWorkspace {...props} documents={[query, preview]} />);
    activate(query.label);
    expect(ref.current.getSplitEditor()).toBeNull();
    rerender(
      <DocumentWorkspace
        {...props}
        documents={[query, preview]}
        enableSplitEditor={false}
      />
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: query.label }));
    expect(
      screen.queryByRole("menuitem", { name: "Split to the right" })
    ).toBeNull();
  });

  it("renders, hides, and preserves custom document toolbars", async () => {
    const legacy = <span>Query controls</span>;
    const sql = { ...query, toolbar: legacy };
    const json = { ...settings, toolbar: <span>JSON toolbar to hide</span> };
    const preview: WorkspaceDocument = {
      id: "preview",
      kind: "custom",
      label: "Preview",
      content: <span>Preview results</span>,
      toolbar: <button>Refresh preview</button>
    };
    const run = vi.fn();
    const toolbar = vi.fn(
      (
        document: WorkspaceDocument,
        { active, defaultContent }: WorkspaceDocumentToolbarRenderState
      ) => {
        if (document.id === json.id) return null;
        if (document.id !== sql.id) return undefined;
        return (
          <div data-active={active}>
            {defaultContent}
            <input aria-label="Query name" defaultValue="" />
            <button onClick={() => run(document.id)}>Run query</button>
          </div>
        );
      }
    );

    render(
      <ReactAce
        documents={[sql, json, preview]}
        renderDocumentToolbar={toolbar}
      />
    );
    const textbox = await screen.findByRole("textbox", { name: "Query name" });
    fireEvent.change(textbox, { target: { value: "My query" } });
    expect(screen.getByText("Query controls")).toBeTruthy();
    expect(toolbar).toHaveBeenCalledWith(sql, {
      active: true,
      defaultContent: legacy
    });
    fireEvent.click(screen.getByRole("button", { name: "Run query" }));
    expect(run).toHaveBeenCalledExactlyOnceWith(sql.id);

    activate(json.label);
    expect(
      screen
        .getByRole("tabpanel")
        .querySelector('[data-slot="ace-workspace-toolbar"]')
    ).toBeNull();
    expect(screen.queryByText("JSON toolbar to hide")).toBeNull();
    expect(toolbar).toHaveBeenCalledWith(sql, {
      active: false,
      defaultContent: legacy
    });

    activate(preview.label);
    expect(
      screen.getByRole("button", { name: "Refresh preview" })
    ).toBeTruthy();
    expect(screen.getByText("Preview results")).toBeTruthy();

    activate(sql.label);
    expect(screen.getByRole("textbox", { name: "Query name" })).toBe(textbox);
    expect((textbox as HTMLInputElement).value).toBe("My query");
  });

  it("outlines supplied positions and sends the clicked gutter row in single editor mode", () => {
    const ref = React.createRef<ReactAce>();
    const onHint = vi.fn();
    const renderGutterHint = vi.fn((row: number, editor: Ace.Editor) => {
      if (!editor.getSession().getLine(row).trim()) return null;
      return (
        <button type="button" onClick={() => onHint(row, editor)}>
          Run {row + 1}
        </button>
      );
    });
    const props = {
      ref,
      defaultValue: "prefix SELECT 1; suffix\nSELECT 2;\n\nSELECT 3;",
      blockQuote: {
        start: { row: 0, column: 7 },
        end: { row: 0, column: 16 },
        className: "statement-outline"
      },
      renderGutterHint
    };
    const { rerender } = render(<ReactAce {...props} />);
    const editor = ref.current.getAceEditor();
    function draw() {
      act(() => {
        Object.assign(editor.renderer.layerConfig, {
          padding: 4,
          height: 60,
          lineHeight: 20,
          characterWidth: 8
        });
        editor.renderer._signal("afterRender");
      });
    }
    draw();

    const frame = editor.container.querySelector<HTMLElement>(
      '[data-slot="ace-block-quote"]'
    );
    expect(frame.classList.contains("statement-outline")).toBe(true);
    expect(frame.hidden).toBe(false);
    expect(frame.style.left).toBe("60px");
    expect(frame.style.width).toBe("72px");
    expect(frame.style.height).toBe("20px");
    expect(screen.getAllByRole("button", { name: /^Run/ })).toHaveLength(2);
    expect(renderGutterHint).toHaveBeenCalledWith(2, editor);
    expect(renderGutterHint).not.toHaveBeenCalledWith(3, editor);
    const getDocumentRow = vi.spyOn(editor.getSession(), "screenToDocumentRow");
    editor.renderer.scrollLeft = 24;
    draw();
    expect(getDocumentRow).not.toHaveBeenCalled();
    getDocumentRow.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Run 2" }));
    expect(onHint).toHaveBeenCalledExactlyOnceWith(1, editor);

    act(() => editor.getSession().insert({ row: 2, column: 0 }, "SELECT 4;"));
    draw();
    expect(screen.getByRole("button", { name: "Run 3" })).toBeTruthy();

    editor.renderer.scrollTop = 60;
    draw();
    expect(screen.getByRole("button", { name: "Run 4" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run 1" })).toBeNull();

    rerender(<ReactAce {...props} blockQuote={null} showGutter={false} />);
    draw();
    expect(ref.current.getAceEditor()).toBe(editor);
    expect(frame.hidden).toBe(true);
    expect(screen.queryByRole("button", { name: "Run 4" })).toBeNull();
    expect(editor.renderer.margin.left).toBe(0);
  });

  it.each(["Split Right", "Split Down"])(
    "folds the visible gutter widget after tokenization in %s",
    async splitAction => {
      const ref = React.createRef<DocumentWorkspaceRef>();
      const onHint = vi.fn();
      const document = {
        ...settings,
        defaultValue: '{\n  "limit": 100\n}',
        renderGutterHint: (row: number, editor: Ace.Editor) =>
          row === 0 ? (
            <button onClick={() => onHint(row, editor)}>Line 1 action</button>
          ) : null
      };
      render(<DocumentWorkspace ref={ref} documents={[document]} />);
      fireEvent.contextMenu(screen.getByRole("tab", { name: document.label }));
      fireEvent.click(screen.getByRole("menuitem", { name: splitAction }));
      const primary = ref.current.getAceEditor();
      const split = ref.current.getSplitEditor();
      const session = split.getSession();
      await waitFor(() => expect(session.getFoldWidget(0)).toBe("start"));

      act(() => {
        Object.assign(split.renderer.layerConfig, {
          firstRow: 0,
          firstRowScreen: 0,
          lastRow: 2,
          gutterOffset: 0,
          offset: 0,
          height: 60,
          lineHeight: 20,
          characterWidth: 8
        });
        split.renderer.$gutterLayer.update(split.renderer.layerConfig);
        split.renderer._signal("afterRender");
      });
      const foldButton = split.container.querySelector<HTMLElement>(
        ".ace_gutter-cell .ace_fold-widget.ace_start"
      );
      expect(foldButton).not.toBeNull();
      expect(foldButton.style.display).toBe("inline-block");
      const hint = screen.getByRole("button", { name: "Line 1 action" });

      act(() => {
        // The tokenizer invalidates the cache before the queued gutter repaint.
        session._signal("tokenizerUpdate", { data: { first: 0, last: 2 } });
        expect(session.foldWidgets[0]).toBeUndefined();
        fireEvent.click(foldButton);
      });
      expect(session.getAllFolds()).toHaveLength(1);
      expect(session.getAllFolds()[0].start.row).toBe(0);
      expect(primary.getSession().getAllFolds()).toHaveLength(0);
      expect(onHint).not.toHaveBeenCalled();
      fireEvent.click(hint);
      expect(onHint).toHaveBeenCalledExactlyOnceWith(0, split);
      expect(session.getAllFolds()).toHaveLength(1);
    }
  );

  it("reports the cursor and gutter actions from the correct split pane", () => {
    const ref = React.createRef<DocumentWorkspaceRef>();
    const onEditorCursorChange = vi.fn();
    const onHint = vi.fn();
    const document = {
      ...query,
      renderGutterHint: (row: number, editor: Ace.Editor) =>
        row === 0 ? (
          <button type="button" onClick={() => onHint(row, editor)}>
            Line 1 action
          </button>
        ) : null
    };

    render(
      <DocumentWorkspace
        ref={ref}
        documents={[document, settings]}
        onEditorCursorChange={onEditorCursorChange}
      />
    );
    fireEvent.contextMenu(screen.getByRole("tab", { name: query.label }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Split Right" }));
    const primary = ref.current.getAceEditor();
    const split = ref.current.getSplitEditor();
    act(() => {
      for (const editor of [primary, split]) {
        Object.assign(editor.renderer.layerConfig, {
          height: 20,
          lineHeight: 20
        });
        editor.renderer._signal("afterRender");
      }
      split.moveCursorTo(0, 2);
    });
    expect(onEditorCursorChange).toHaveBeenLastCalledWith(
      document,
      { row: 0, column: 2 },
      split
    );
    const buttons = screen.getAllByRole("button", {
      name: "Line 1 action",
      exact: true
    });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(onHint).toHaveBeenCalledExactlyOnceWith(0, split);

    activate(settings.label);
    expect(
      screen.queryByRole("button", { name: "Line 1 action", exact: true })
    ).toBeNull();
    expect(primary.renderer.margin.left).toBe(0);
  });

  it("keeps equal document IDs independent across workspaces", () => {
    const first = React.createRef<DocumentWorkspaceRef>();
    const second = React.createRef<DocumentWorkspaceRef>();
    render(
      <>
        <DocumentWorkspace ref={first} documents={[query]} />
        <DocumentWorkspace ref={second} documents={[query]} />
      </>
    );
    const firstSession = first.current.getSession(query.id);
    const secondSession = second.current.getSession(query.id);
    expect(firstSession).not.toBe(secondSession);
    act(() => firstSession.setValue("SELECT 2;"));
    expect(secondSession.getValue()).toBe(query.defaultValue);
  });
});
