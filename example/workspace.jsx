import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactAce from "../src";
import "./workspace.css";

const defaultEditorMode = "sql";

function getEditorMode(document) {
  return document.mode ?? defaultEditorMode;
}

const buttonClass =
  "inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

function DocumentIcon({ type }) {
  const paths = {
    sql: "M3 7h18M3 12h13M3 17h9",
    json: "M9 3H7a2 2 0 0 0-2 2v4a3 3 0 0 1-3 3 3 3 0 0 1 3 3v4a2 2 0 0 0 2 2h2m6-18h2a2 2 0 0 1 2 2v4a3 3 0 0 0 3 3 3 3 0 0 0-3 3v4a2 2 0 0 1-2 2h-2",
    table: "M3 4h18v16H3zM3 9h18M9 9v11"
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[type]} />
    </svg>
  );
}

const rows = [
  { id: 1024, name: "Avery Chen", plan: "Team", region: "APAC" },
  { id: 1031, name: "Sam Rivera", plan: "Starter", region: "Americas" },
  { id: 1045, name: "Noor Patel", plan: "Team", region: "EMEA" },
  { id: 1052, name: "Mina Park", plan: "Enterprise", region: "APAC" },
  { id: 1089, name: "Alex Morgan", plan: "Starter", region: "Americas" }
];

function CustomerPreview() {
  const [filter, setFilter] = useState("");
  const visibleRows = rows.filter(row =>
    row.name.toLowerCase().includes(filter.trim().toLowerCase())
  );

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Customers</h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {visibleRows.length} of {rows.length} sample rows
          </p>
        </div>
        <input
          aria-label="Filter customers by name"
          placeholder="Filter by name…"
          className="h-8 max-w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          value={filter}
          onChange={event => setFilter(event.target.value)}
        />
      </div>
      <div className="min-w-max rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              {["ID", "Customer", "Plan", "Region"].map(column => (
                <th key={column} scope="col" className="px-3 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-muted-foreground">
                  {row.id}
                </td>
                <td className="px-3 py-2 font-medium">{row.name}</td>
                <td className="px-3 py-2">{row.plan}</td>
                <td className="px-3 py-2">{row.region}</td>
              </tr>
            ))}
            {!visibleRows.length && (
              <tr>
                <td
                  colSpan={4}
                  className="p-6 text-center text-muted-foreground"
                >
                  No matching customers
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const preview = {
  id: "customers",
  label: "Customers preview",
  kind: "custom",
  content: <CustomerPreview />,
  icon: <DocumentIcon type="table" />
};

const countQuery = "SELECT COUNT(*) AS total FROM customers;";
const sampleQuotes = [
  {
    start: { row: 0, column: 0 },
    end: { row: 7, column: "LIMIT 100;".length }
  },
  { start: { row: 9, column: 0 }, end: { row: 9, column: countQuery.length } }
];
const sampleRows = new Set(sampleQuotes.map(({ start }) => start.row));
const scrollHintRows = new Set([0, 35, 100, 179]);

const hintButtonClass =
  "flex h-full w-full items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground";

function renderSqlHint(row, editor) {
  return (
    <button
      type="button"
      className={hintButtonClass}
      aria-label={`Jump to SQL on line ${row + 1}`}
      title={`Jump to line ${row + 1}`}
      onClick={() => {
        editor.gotoLine(row + 1, 0, false);
        editor.focus();
      }}
    >
      <svg
        aria-hidden="true"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="currentColor"
      >
        <path d="M2 1.5v7L8.5 5 2 1.5Z" />
      </svg>
    </button>
  );
}

const initialDocuments = [
  {
    id: "query",
    label: "customers.sql",
    kind: "editor",
    tabSize: 2,
    defaultValue: `SELECT\n  customer_id,\n  customer_name,\n  plan,\n  region\nFROM customers\nORDER BY customer_id\nLIMIT 100;\n\n${countQuery}`,
    renderGutterHint: (row, editor) =>
      sampleRows.has(row) ? renderSqlHint(row, editor) : null,
    icon: <DocumentIcon type="sql" />
  },
  {
    id: "settings",
    label: "query-settings.json",
    kind: "editor",
    mode: "json",
    tabSize: 2,
    defaultValue:
      '{\n  "schema": "public",\n  "limit": 100,\n  "readOnly": true\n}\n',
    icon: <DocumentIcon type="json" />
  },
  preview
];

const sqlFoldHintDocument = {
  id: "sql-fold-hint",
  label: "fold-hint.sql",
  kind: "editor",
  mode: "sql",
  tabSize: 2,
  defaultValue: `WITH customers_in_region AS (
  SELECT customer_id, customer_name, plan
  FROM customers
  WHERE region = 'EMEA'
)
SELECT customer_id, customer_name, plan
FROM customers_in_region
ORDER BY customer_id;`,
  icon: <DocumentIcon type="sql" />
};
const foldHintTabs = new Set(["settings", sqlFoldHintDocument.id]);

const splitHintLines = Array.from(scrollHintRows, row => row + 1).join(", ");
const sqlSplitLines = Array.from(
  { length: 240 },
  (_, row) =>
    `SELECT ${row + 1} AS line_number, '${"long view ".repeat(28)}' AS detail;`
);
for (const row of scrollHintRows) {
  sqlSplitLines.splice(
    row,
    5,
    `WITH example_${row + 1} AS (`,
    `  SELECT ${row + 1} AS line_number`,
    "  UNION ALL",
    `  SELECT ${row + 2} AS line_number`,
    `) SELECT line_number FROM example_${row + 1};`
  );
}

const sqlSplitDocument = {
  id: "sql-split",
  label: "split-demo.sql",
  kind: "editor",
  mode: "sql",
  icon: <DocumentIcon type="sql" />,
  defaultValue: sqlSplitLines.join("\n"),
  renderGutterHint: (row, editor) =>
    scrollHintRows.has(row) ? renderSqlHint(row, editor) : null
};

function RenameDocumentDialog({ document, onRename, onCancel }) {
  const dialog = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    dialog.current.showModal();
    input.current.select();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="rename-document-heading"
      className="fixed left-1/2 top-1/2 m-0 w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-5 text-foreground shadow-lg backdrop:bg-black/40"
      onCancel={onCancel}
    >
      <form
        onSubmit={event => {
          event.preventDefault();
          const label = input.current.value.trim();
          if (label) onRename(label);
          else input.current.focus();
        }}
        className="flex flex-col gap-4"
      >
        <h2 id="rename-document-heading" className="text-base font-semibold">
          Rename document
        </h2>
        <label className="flex flex-col gap-2 text-sm">
          Document name
          <input
            ref={input}
            defaultValue={document.label}
            maxLength={80}
            required
            className="h-9 rounded-md border border-border bg-background px-3 focus-visible:outline-2 focus-visible:outline-ring"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={buttonClass}>
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}

const demoParams = new URLSearchParams(window.location.search);
const layoutDemo = demoParams.has("layout");
const example = demoParams.get("example");
const exampleDocument =
  example === "sql-fold-hint"
    ? sqlFoldHintDocument
    : example === "sql-split"
      ? sqlSplitDocument
      : undefined;
const scrollTestDocument = {
  id: "scroll-test",
  kind: "editor",
  label: "scroll-test.sql",
  icon: <DocumentIcon type="sql" />,
  renderGutterHint: (row, editor) =>
    scrollHintRows.has(row) ? renderSqlHint(row, editor) : null,
  blockQuote: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
  defaultValue: Array.from(
    { length: 180 },
    (_, index) =>
      `SELECT ${index + 1} AS line_number, '${"layout and scroll sample ".repeat(12)}' AS details;`
  ).join("\n")
};

function LayoutControls({ layout, updateLayout }) {
  return (
    <fieldset className="flex flex-wrap gap-x-6 gap-y-3 rounded-md border border-border bg-background p-3">
      <legend className="px-1 text-sm font-medium">Parent layout</legend>
      {[
        { key: "width", label: "Width", min: 35, max: 100, unit: "%" },
        { key: "height", label: "Height", min: 240, max: 740, unit: "px" },
        { key: "zoom", label: "Zoom", min: 65, max: 145, unit: "%" }
      ].map(({ key, label, min, max, unit }) => (
        <label
          key={key}
          className="flex min-w-32 flex-1 flex-col gap-2 text-sm"
        >
          <span className="flex justify-between gap-2">
            <span>{label}</span>
            <output
              aria-hidden="true"
              className="tabular-nums text-muted-foreground"
            >
              {layout[key]}
              {unit}
            </output>
          </span>
          <input
            type="range"
            aria-label={label}
            min={min}
            max={max}
            value={layout[key]}
            onChange={event =>
              updateLayout(current => ({
                ...current,
                [key]: Number(event.target.value)
              }))
            }
          />
        </label>
      ))}
    </fieldset>
  );
}

function App() {
  const [documents, setDocuments] = useState(() => [
    ...(layoutDemo ? [scrollTestDocument] : []),
    ...initialDocuments,
    ...(exampleDocument ? [exampleDocument] : [])
  ]);
  const [activeId, setActiveId] = useState(
    exampleDocument?.id ??
      (example === "fold-hint" ? "settings" : documents[0].id)
  );
  const [layout, updateLayout] = useState({
    width: 100,
    height: 550,
    zoom: 100
  });
  const [dark, setDark] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [sampleQuote, setSampleQuote] = useState(sampleQuotes[0]);
  const [hintClicks, setHintClicks] = useState({});
  const nextId = useRef(1);

  function openPreview() {
    setDocuments(current =>
      current.some(document => document.id === preview.id)
        ? current
        : [...current, preview]
    );
    setActiveId(preview.id);
  }

  function addDocument() {
    const number = nextId.current++;
    const id = `query-${number}`;
    setDocuments(current => [
      ...current,
      {
        id,
        label: `query-${number}.sql`,
        kind: "editor",
        tabSize: 2,
        defaultValue: "SELECT ",
        icon: <DocumentIcon type="sql" />
      }
    ]);
    setActiveId(id);
  }

  function closeDocuments(targets) {
    const modified = targets.filter(document => document.modified);
    const names = modified.map(document => document.label).join(", ");
    if (modified.length && !window.confirm(`Discard changes to ${names}?`))
      return;

    const ids = new Set(targets.map(document => document.id));
    const remaining = documents.filter(document => !ids.has(document.id));
    if (ids.has(activeId)) {
      const index = documents.findIndex(document => document.id === activeId);
      const next =
        documents.slice(index + 1).find(document => !ids.has(document.id)) ??
        [...documents.slice(0, index)]
          .reverse()
          .find(document => !ids.has(document.id));
      setActiveId(next?.id ?? null);
    }
    setDocuments(remaining);
  }

  function updateDocument(id, properties) {
    setDocuments(current =>
      current.map(document =>
        document.id === id ? { ...document, ...properties } : document
      )
    );
  }

  function reorderDocuments(nextOrder) {
    const positions = new Map(nextOrder.map(({ id }, index) => [id, index]));
    setDocuments(current =>
      [...current].sort(
        (first, second) =>
          (positions.get(first.id) ?? Infinity) -
          (positions.get(second.id) ?? Infinity)
      )
    );
  }

  return (
    <main className={dark ? "dark" : undefined}>
      <div className="min-h-dvh bg-muted p-4 text-foreground sm:p-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Query workspace
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Edit SQL and JSON, or browse a sample result set.
              </p>
            </div>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setDark(current => !current)}
            >
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </header>
          {layoutDemo && (
            <LayoutControls layout={layout} updateLayout={updateLayout} />
          )}
          <div
            data-demo-layout-host={layoutDemo || undefined}
            style={
              layoutDemo
                ? {
                    width: `${layout.width}%`,
                    height: layout.height
                  }
                : undefined
            }
          >
            <div
              style={
                layoutDemo
                  ? {
                      zoom: layout.zoom / 100,
                      width: "100%",
                      height: "100%"
                    }
                  : undefined
              }
            >
              <ReactAce
                mode={defaultEditorMode}
                contextMenuClassName="w-64 rounded-xl [&_[role=menuitem]]:min-h-8"
                className={
                  layoutDemo
                    ? "size-full min-h-0"
                    : "h-[min(74dvh,44rem)] min-h-80"
                }
                documents={documents.map(document => {
                  if (document.id === "query") {
                    return {
                      ...document,
                      blockQuote: document.modified ? null : sampleQuote,
                      renderGutterHint: document.modified
                        ? null
                        : document.renderGutterHint
                    };
                  }
                  if (foldHintTabs.has(document.id)) {
                    return {
                      ...document,
                      renderGutterHint: row =>
                        row === 0 ? (
                          <button
                            type="button"
                            className={hintButtonClass}
                            aria-label="Test custom hint on line 1"
                            title="Test custom hint"
                            onClick={() =>
                              setHintClicks(counts => ({
                                ...counts,
                                [document.id]: (counts[document.id] ?? 0) + 1
                              }))
                            }
                          >
                            ?
                          </button>
                        ) : null
                    };
                  }
                  return document;
                })}
                onEditorCursorChange={(document, { row, column }) => {
                  if (document.id !== "query" || document.modified) return;
                  setSampleQuote(
                    sampleQuotes.find(
                      ({ start, end }) =>
                        (row > start.row ||
                          (row === start.row && column >= start.column)) &&
                        (row < end.row ||
                          (row === end.row && column <= end.column))
                    ) ?? null
                  );
                }}
                renderDocumentToolbar={document => {
                  if (document.kind !== "editor") return null;
                  const mode = getEditorMode(document);
                  const isSplitDemo = document.id === sqlSplitDocument.id;

                  return (
                    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1">
                      <span className="font-mono text-xs uppercase text-muted-foreground">
                        {mode}
                      </span>
                      {foldHintTabs.has(document.id) && (
                        <output className="text-xs text-muted-foreground tabular-nums">
                          Hint clicks {hintClicks[document.id] ?? 0}
                        </output>
                      )}
                      {isSplitDemo && (
                        <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                          Right-click the tab and choose Split Right or Split
                          Down. Try the Hint and fold arrow on lines{" "}
                          {splitHintLines}.
                        </span>
                      )}
                      {mode === "sql" && !isSplitDemo && (
                        <button className={buttonClass} onClick={openPreview}>
                          Open sample preview
                        </button>
                      )}
                    </div>
                  );
                }}
                activeId={activeId}
                onActiveDocumentChange={setActiveId}
                onAddDocument={addDocument}
                onCloseDocuments={closeDocuments}
                menus={document => [
                  {
                    id: "rename",
                    label: "Rename",
                    type: "event",
                    event: "rename",
                    disabled: document.disabled
                  },
                  ...(document.kind === "editor" &&
                  getEditorMode(document) === "sql"
                    ? [
                        {
                          id: "preview",
                          label: "Open sample preview",
                          type: "callback",
                          onSelect: openPreview
                        }
                      ]
                    : [])
                ]}
                onTabMenuEvent={({ name, document }) => {
                  if (name === "rename") setRenaming(document);
                }}
                onTabDoubleClick={setRenaming}
                renderTabItem={(document, { defaultContent }) =>
                  document.id === scrollTestDocument.id ? (
                    <>
                      {defaultContent}
                      <span className="text-xs text-muted-foreground">SQL</span>
                    </>
                  ) : (
                    defaultContent
                  )
                }
                renderContextMenuItem={({ id, label }) => (
                  <>
                    <span className="flex-1">{label}</span>
                    {id === "rename" && (
                      <span
                        aria-hidden="true"
                        className="text-xs text-muted-foreground"
                      >
                        Double-click
                      </span>
                    )}
                  </>
                )}
                onTogglePin={(document, pinned) =>
                  updateDocument(document.id, { pinned })
                }
                onReorderDocuments={reorderDocuments}
                onEditorChange={(changed, value) =>
                  setDocuments(current => {
                    const modified = value !== changed.defaultValue;
                    const existing = current.find(
                      document => document.id === changed.id
                    );
                    if (!existing || Boolean(existing.modified) === modified)
                      return current;
                    return current.map(document =>
                      document.id === changed.id
                        ? { ...document, modified }
                        : document
                    );
                  })
                }
                emptyState={
                  <button className={buttonClass} onClick={addDocument}>
                    New SQL document
                  </button>
                }
              />
            </div>
          </div>
          <footer className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <a
              className="underline underline-offset-4"
              href={
                layoutDemo ? "./workspace.html" : "./workspace.html?layout=1"
              }
            >
              {layoutDemo ? "Standard workspace" : "Layout and scroll test"}
            </a>
            <a
              className="underline underline-offset-4"
              href="./workspace.html?example=fold-hint"
            >
              JSON fold and hint example
            </a>
            <a
              className="underline underline-offset-4"
              href="./workspace.html?example=sql-fold-hint"
            >
              SQL fold and hint example
            </a>
            <a
              className="underline underline-offset-4"
              href="./workspace.html?example=sql-split"
            >
              240-line SQL split example
            </a>
            <a className="underline underline-offset-4" href="./index.html">
              Single editor example
            </a>
          </footer>
        </div>
      </div>
      {renaming && (
        <RenameDocumentDialog
          document={renaming}
          onCancel={() => setRenaming(null)}
          onRename={label => {
            updateDocument(renaming.id, { label });
            setRenaming(null);
          }}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById("workspace")).render(<App />);
