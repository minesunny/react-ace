# Multi-document workspace

With the `documents` prop, `ReactAce` reuses a primary Ace canvas across editor documents. Each editor document has its own Ace `EditSession`. Switching tabs preserves text, selection, scroll and undo history. Custom documents can render tables, logs, forms, diff views, or any other React content. Their components and per-document toolbars stay mounted until the document closes.

## Usage

Workspace mode supports React 18 and 19. ReactAce loads the workspace styles automatically. In a Next.js App Router app, use the workspace from a client component when passing event handlers or a ref.

```tsx
"use client";

import { useRef, useState } from "react";
import ReactAce, { type WorkspaceDocument } from "react-ace";

const initialDocuments: WorkspaceDocument[] = [
  {
    id: "sql-1",
    kind: "editor",
    label: "Query.sql",
    tabSize: 2,
    defaultValue: "SELECT 1;"
  },
  {
    id: "preview",
    kind: "custom",
    label: "Preview",
    content: <div className="p-4">Query results appear here.</div>
  }
];

export function QueryWorkspace() {
  const workspace = useRef<ReactAce>(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [activeId, setActiveId] = useState<string | null>("sql-1");

  return (
    <ReactAce
      ref={workspace}
      mode="sql"
      className="h-[32rem] min-w-0"
      documents={documents}
      activeId={activeId}
      onActiveDocumentChange={setActiveId}
      onCloseDocument={document => {
        const remaining = documents.filter(item => item.id !== document.id);
        setDocuments(remaining);
        if (activeId === document.id) setActiveId(remaining[0]?.id ?? null);
      }}
    />
  );
}
```

Keep document IDs stable, unique and nonempty. The caller owns `documents`. `onAddDocument` and `onCloseDocument` request changes to that array. Keep a document in the array while a close confirmation is pending. Use `closable: false` for a persistent tab. The tab bar supports Left/Right and Home/End to move focus, Enter or Space to activate, and Delete to request a close. A middle click on a closable tab also requests a close.

Omit `activeId` to let the workspace manage selection. It falls back to the first enabled document when the selected document disappears. With controlled selection, update `activeId` together with the document list and pass `null` for an empty selection.

Editor documents accept `defaultValue` as the initial buffer. To own the text in a store, pass `value` and write edits back through `onEditorChange(document, value, delta)`. Setting a different external `value` replaces the buffer. Pass `mode="sql"` to set the default for editor documents. A document can override it with its own `mode`. ReactAce loads the requested built-in Ace mode automatically. Import additional themes before use. Workers are opt-in through `useWorker`. The browser ESM and UMD builds resolve the built-in worker assets. Apps using custom workers or browsing through the CommonJS build can configure worker URLs in Ace. Apps that serve their styles as external CSS can still import `react-ace/workspace.css`.

## Outline a range and add gutter hints

Pass `blockQuote` to outline a range and `renderGutterHint` to add controls beside line numbers. Positions use Ace’s zero-based `row` and `column`, with an exclusive range end. The editor renders the positions supplied by the application. Pass `blockQuote={null}` to remove the outline.

```tsx
<ReactAce
  mode="sql"
  documents={documents}
  blockQuote={statementRange}
  renderGutterHint={(row, editor) => {
    if (!statementStartRows.has(row)) return null;
    return (
      <button
        type="button"
        aria-label={`Run SQL on line ${row + 1}`}
        onClick={() => runStatementAtRow(row, editor)}
      >
        ▸
      </button>
    );
  }}
  onEditorCursorChange={(document, position, editor) => {
    updateStatementRange(document.id, position, editor.getValue());
  }}
/>
```

`renderGutterHint(row, editor)` receives a zero-based document row and that pane’s Ace instance. It runs only for rows whose first visual line is visible. Return `null` to leave a row empty. The hint column sits after the line numbers and before the fold controls and keeps its width while scrolling. Put actions on the returned control. In workspace mode, the corresponding fields on each editor document can override the component defaults. The same decoration props work in single-editor mode, where the existing `onCursorChange` exposes the Ace selection and cursor.

## Customize the document toolbar

Set `document.toolbar` to a React node to add controls above an individual document. Use `renderDocumentToolbar(document, state)` to configure the toolbar for the whole workspace. It supports editor and custom documents. `state.active` indicates the selected document, and `state.defaultContent` contains its `toolbar` node.

```tsx
<ReactAce
  documents={documents}
  renderDocumentToolbar={(document, { defaultContent }) => {
    if (document.kind === "custom") return null;
    if (document.readOnly) return undefined;

    return (
      <div className="flex min-h-11 items-center gap-3 px-3">
        {defaultContent}
        <button onClick={() => runQuery(document.id)}>Run query</button>
      </div>
    );
  }}
/>
```

Return `undefined` to use the document’s `toolbar`, or `null` to hide the whole bar. Each document's toolbar stays mounted across tab switches and spans both panes when its editor is split.

## Dynamic tabs and context menu

Right-click a tab to open its context menu. When tabs overflow, use the **More tabs** button to switch to any open document.

- Set `pinned: true` to put a document at the front of the tab bar and protect it from close operations. Supply `onTogglePin(document, pinned)` to let users change that state.
- Use `onRenameDocument(document)` to open the app's rename UI. Update the document label while keeping its ID stable.
- Supply `onReorderDocuments(nextOrder)` for drag-and-drop and the menu's **Move left** / **Move right** actions. Tabs reorder within their pinned or unpinned group. Apply the returned order to your document list.
- Supply `onCloseDocuments(documents)` for **Close other tabs** and **Close all tabs**. Each action sends one list of eligible documents so a save or discard confirmation can cover the whole operation. `onCloseDocument` handles single closes when supplied, with `onCloseDocuments` as the fallback.
- Use `menus` to add app-specific actions and `tabLabels` to localize the built-in actions.

### Split an editor

Right-click an editor tab and select **Split Right** or **Split Down** to show the same document in two panes. Select the other direction from the tab menu to rearrange the existing panes. Edits and undo history are shared. Each pane keeps its own cursor, selection, and scroll position. Drag the divider or focus it and use the arrow keys to resize the panes. Select **Close Split Editor** from the same tab menu to return to one pane. The workspace remembers each document’s split direction while its tab is open.

The action is enabled by default. Pass `enableSplitEditor={false}` to hide it. Use `tabLabels.splitRight`, `tabLabels.splitDown`, and `tabLabels.closeSplitEditor` to localize the menu and `renderContextMenuItem` to customize item content. A ref exposes the secondary pane through `getSplitEditor()` while the split is visible. `getAceEditor()` accesses the primary pane.

### Configure callback and event menu items

`menus` accepts an array or a function that receives the target document and returns its items. Configured items appear before the built-in actions. A `callback` item runs its own `onSelect(document)`. An `event` item sends `{ name, itemId, document, payload }` to `onTabMenuEvent`. Event items are disabled until a handler is supplied. The legacy `tabMenuActions(document)` remains available when `menus` is omitted.

For a custom rename dialog, set the active dialog document when the configured `rename` event arrives. Saving the dialog updates the same document's label.

```tsx
<ReactAce
  documents={documents}
  menus={[
    {
      id: "rename",
      label: "Rename",
      type: "event",
      event: "rename"
    },
    {
      id: "preview",
      label: "Open preview",
      type: "callback",
      onSelect: openPreview
    }
  ]}
  onTabMenuEvent={({ name, document }) => {
    if (name === "rename") setRenaming(document);
  }}
/>
```

## Custom tab and menu rendering

Use `renderTabItem(document, state)` to render the contents of a tab. `state.active` is the selected state, `state.location` is `"tab"` or `"overflow"`, and `state.defaultContent` includes the standard label and markers. The tab trigger, accessible name, and close or pin control stay wired to the workspace.

Use `renderContextMenuItem(item, document)` to render each built-in and custom menu item. The descriptor provides `id`, `label`, `disabled`, and `source`. The workspace still handles keyboard navigation, disabled actions, and selection. Render text, icons, or shortcut hints within these slots.

Pass `contextMenuClassName` directly to `ReactAce` to style the tab's right-click menu surface. Tailwind utilities can override the default component styles. Descendant variants can style the menu items. The example below sets the menu width, corner radius, and item height.

```tsx
<ReactAce
  documents={documents}
  contextMenuClassName="w-64 rounded-xl [&_[role=menuitem]]:min-h-8"
/>
```

Alongside the add, activation, close, rename, pin, and reorder callbacks, the workspace provides these tab events.

- `onTabClick(document, event)` fires when the user clicks a tab trigger.
- `onTabDoubleClick(document, event)` supports actions such as opening rename.
- `onTabFocus(document, event)` tracks focus separately from activation.
- `onTabContextMenuChange(document, open)` fires when the right-click menu opens or closes.

## Resize and scroll

The workspace fills a parent with a defined height. Give flex or grid ancestors `min-h-0` and `min-w-0` so the host can shrink. Ace editor panes and workspace-managed content use custom scrollbar thumbs. A custom document with its own scrolling, such as a virtualized grid, can set `scrollable: false`.

Run the example and open `/workspace.html?layout=1` to change the parent's width, height, and CSS zoom while working in a long SQL document.

## Tailwind and shadcn/ui

The workspace stylesheet uses the Tailwind `components` layer and reads shadcn color tokens such as `--background`, `--foreground`, `--muted`, `--border` and `--ring`. Tailwind utilities on `className` can size the workspace. The host app can provide `.dark` or `data-theme="dark"` and its existing shadcn token values. Standalone defaults are included, and consumers can import the CSS without running a Tailwind scan of the library.

Set a height utility such as `h-[32rem]`, or use `h-full min-h-0` inside a parent with a defined height. In single-editor mode, `ReactAce` also supports CSS dimensions by passing `null` for each dimension owned by CSS.

```tsx
<ReactAce width={null} height={null} className="h-80 w-full rounded-md" />
```

## Regression tests

Run the component tests and production browser tests with the following commands.
The browser suite starts its own local preview server and runs Chromium against
the built examples.

```sh
npm ci
npm run check
npm run coverage -- --run
npm run build
npm run build:example
npx playwright install chromium
npm run test:e2e
```

On Linux, use `npx playwright install --with-deps chromium` to install the browser's
system dependencies. Failed browser tests save screenshots and traces under
`test-results/`. The Node.js CI workflow runs these checks for pull requests and
retains browser failure output for seven days.

## Replacing the editor shell in mine-query

- Map store records from `documentId` or `sessionId` to the workspace `id`. Pass SQL draft text as `value` and mirror user edits through `onEditorChange`.
- Put the SQL toolbar in the document's `toolbar` or configure it through `renderDocumentToolbar`. Set `kind: "custom"` and put the existing table preview, results or logs in `content` when opening those views as tabs.
- Pass the store's active ID through `activeId` and call its activation action from `onActiveDocumentChange`. Wire the existing close confirmation into `onCloseDocument`, then update the store after approval.
- Use `workspace.current?.getAceEditor()` for current selection, focus, cursor position and SQL command handlers. Use `getSession(id)` to read or edit a specific open buffer. Register shared Ace commands in `onEditorLoad` and keep statement parsing and query execution in the app.
