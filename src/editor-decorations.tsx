import type { Ace } from "ace-builds";
import * as React from "react";
import * as ReactDOM from "react-dom";

export interface EditorBlockQuote {
  start: Ace.Point;
  /** Exclusive end position. Coordinates use Ace's zero-based rows and columns. */
  end: Ace.Point;
  className?: string;
}

export interface EditorDecorationsProps {
  blockQuote?: EditorBlockQuote | null;
  /** Render a control for a visible, zero-based document row. Return null for an empty row. */
  renderGutterHint?:
    ((row: number, editor: Ace.Editor) => React.ReactNode) | null;
}

interface DecorationsProps extends EditorDecorationsProps {
  getEditor: () => Ace.Editor | null;
  onCursorPositionChange?: (position: Ace.Point, editor: Ace.Editor) => void;
}

interface VisibleHint {
  row: number;
  top: number;
}

interface GutterView {
  host: HTMLElement;
  editor: Ace.Editor;
  hints: VisibleHint[];
  height: number;
}

interface GutterRenderer {
  $gutterLayer: {
    $lines: { cells: { element: HTMLElement; row: number }[] };
    $padding?: { right: number } | null;
    getRegion(point: Ace.MouseEvent): "markers" | "foldWidgets" | undefined;
  };
}

const gutterWidth = 24;

function getBounds(session: Ace.EditSession, quote: EditorBlockQuote) {
  const valid = ({ row, column }: Ace.Point) =>
    Number.isInteger(row) &&
    Number.isInteger(column) &&
    row >= 0 &&
    row < session.getLength() &&
    column >= 0;

  if (!valid(quote.start) || !valid(quote.end)) return;
  const start = {
    row: quote.start.row,
    column: Math.min(
      quote.start.column,
      session.getLine(quote.start.row).length
    )
  };
  const end = {
    row: quote.end.row,
    column: Math.min(quote.end.column, session.getLine(quote.end.row).length)
  };
  if (
    start.row > end.row ||
    (start.row === end.row && start.column >= end.column)
  )
    return;

  // A range ending at column zero does not include that line.
  if (!end.column && end.row > start.row) {
    end.row--;
    end.column = session.getLine(end.row).length;
  }
  const first = session.documentToScreenPosition(start);
  const last = session.documentToScreenPosition(end);
  if (end.column > 0) {
    const lastCharacter = session.documentToScreenPosition(
      end.row,
      end.column - 1
    );
    if (lastCharacter.row < last.row) {
      last.row = lastCharacter.row;
      last.column = session.getScreenLastRowColumn(last.row);
    }
  }

  let left = first.column;
  let right = last.column;
  for (let row = first.row; row < last.row; row++) {
    right = Math.max(right, session.getScreenLastRowColumn(row));
    left = Math.min(left, session.getRowWrapIndent(row + 1));
  }
  return { left, right, first: first.row, last: last.row };
}

function sameHints(previous: VisibleHint[], next: VisibleHint[]) {
  return (
    previous === next ||
    (previous.length === next.length &&
      previous.every(
        (item, index) =>
          item.row === next[index].row && item.top === next[index].top
      ))
  );
}

export function EditorDecorations(props: DecorationsProps) {
  const { getEditor } = props;
  const current = React.useRef(props);
  const refresh = React.useRef<() => void>(undefined);
  const [gutter, setGutter] = React.useState<GutterView>();

  React.useEffect(() => {
    current.current = props;
    refresh.current?.();
  });

  React.useEffect(() => {
    const editor = getEditor();
    if (!editor) return;
    const { renderer, container } = editor;
    const { $gutterLayer: gutterLayer } = renderer as typeof renderer &
      GutterRenderer;
    const getGutterRegion = gutterLayer.getRegion;
    const document = container.ownerDocument;
    const frame = document.createElement("div");
    frame.dataset.slot = "ace-block-quote";
    frame.setAttribute("aria-hidden", "true");
    frame.hidden = true;
    const lane = document.createElement("div");
    lane.dataset.slot = "ace-gutter-hints";
    lane.style.width = `${gutterWidth}px`;
    const laneContent = document.createElement("div");
    laneContent.style.position = "relative";
    lane.appendChild(laneContent);
    let reserved = false;
    let alive = true;
    let session = editor.getSession();
    let bounds: ReturnType<typeof getBounds>;
    let previousQuote: EditorBlockQuote | null | undefined;
    let dirty = true;
    let wrapLimit: number;
    let tabSize: number;
    let previousHints: VisibleHint[] = [];
    let previousHeight = 0;
    let firstHintRow = 0;
    let endHintRow = 0;

    function getHintGutterRegion(point: Ace.MouseEvent) {
      const target = point.domEvent?.target as Element | null;
      if (!target?.classList?.contains("ace_fold-widget"))
        return getGutterRegion.call(gutterLayer, point);

      // Use the gutter cell's row. After horizontal scrolling, Ace can map
      // the pointer to text on the closing row of a collapsed range.
      const cell = gutterLayer.$lines.cells.find(
        ({ element }) => element === target.parentElement
      );
      if (cell) {
        point.getDocumentPosition = () => ({ row: cell.row, column: 0 });
        // Tokenization can clear this cache before Ace repaints the gutter.
        // Its native click handler otherwise ignores the still-visible widget.
        const widgets = editor.session.foldWidgets;
        if (widgets && widgets[cell.row] == null)
          widgets[cell.row] = editor.session.getFoldWidget(cell.row);
      }
      return "foldWidgets";
    }

    function reserve(enabled: boolean) {
      if (reserved === enabled) return;
      reserved = enabled;
      container.classList.toggle("react-ace-gutter-hints", enabled);
      gutterLayer.getRegion = enabled ? getHintGutterRegion : getGutterRegion;
      if (enabled) {
        container.style.setProperty(
          "--ace-gutter-hint-width",
          `${gutterWidth}px`
        );
        container.appendChild(lane);
      } else {
        container.style.removeProperty("--ace-gutter-hint-width");
        lane.remove();
      }
      if (alive) {
        // Ace caches the cell padding it uses to size the native gutter.
        gutterLayer.$padding = null;
        renderer.updateFull();
      }
    }

    function update() {
      if (!alive) return;
      const { blockQuote, renderGutterHint } = current.current;
      const { padding, lineHeight, characterWidth, height } =
        renderer.layerConfig;
      const nextLimit = session.getWrapLimit();
      const nextTabSize = session.getTabSize();
      const contentChanged = dirty;
      const rowLayoutChanged =
        contentChanged || nextLimit !== wrapLimit || nextTabSize !== tabSize;
      if (rowLayoutChanged || blockQuote !== previousQuote) {
        bounds = blockQuote ? getBounds(session, blockQuote) : undefined;
        previousQuote = blockQuote;
        wrapLimit = nextLimit;
        tabSize = nextTabSize;
        dirty = false;
      }

      if (bounds && lineHeight && characterWidth) {
        frame.className = blockQuote.className ?? "";
        frame.style.left = `${padding + bounds.left * characterWidth - renderer.scrollLeft}px`;
        frame.style.top = `${bounds.first * lineHeight - renderer.scrollTop}px`;
        frame.style.width = `${Math.max(1, bounds.right - bounds.left) * characterWidth}px`;
        frame.style.height = `${(bounds.last - bounds.first + 1) * lineHeight}px`;
        if (!frame.parentNode) renderer.scroller.appendChild(frame);
        frame.hidden = false;
      } else {
        frame.hidden = true;
      }

      const showGutter = !!renderGutterHint && renderer.getShowGutter();
      reserve(showGutter);
      let hints = previousHints;
      if (showGutter) {
        lane.style.height = `${height}px`;
        const padding = gutterLayer.$padding;
        if (padding) {
          // The right padding remains Ace's hit area for the fold control.
          const left =
            renderer.margin.left + renderer.gutterWidth - padding.right;
          lane.style.left = `${left - gutterWidth}px`;
        }
      }
      if (showGutter && height > 0 && lineHeight > 0) {
        const { scrollTop } = renderer;
        const first = Math.max(0, Math.floor(scrollTop / lineHeight));
        const end = Math.ceil((scrollTop + height) / lineHeight);
        laneContent.style.transform = `translateY(${first * lineHeight - scrollTop}px)`;
        // Horizontal scrolling and vertical movement within the same rows
        // only move the lane. The visible document rows are still the same.
        if (
          rowLayoutChanged ||
          previousHeight !== lineHeight ||
          first !== firstHintRow ||
          end !== endHintRow
        ) {
          firstHintRow = first;
          endHintRow = end;
          hints = [];
          for (let screenRow = first; screenRow < end; screenRow++) {
            const row = session.screenToDocumentRow(screenRow, 0);
            // Wrapped continuations share the first screen row's control.
            if (session.documentToScreenRow(row, 0) !== screenRow) continue;
            hints.push({ row, top: (screenRow - first) * lineHeight });
          }
        }
      } else {
        firstHintRow = endHintRow = 0;
        hints = [];
      }
      if (
        showGutter &&
        (contentChanged ||
          previousHeight !== lineHeight ||
          !sameHints(previousHints, hints))
      ) {
        previousHints = hints;
        previousHeight = lineHeight;
        setGutter({ host: laneContent, editor, hints, height: lineHeight });
      } else if (!showGutter && (previousHints.length || previousHeight)) {
        previousHints = [];
        previousHeight = 0;
        setGutter(undefined);
      }
    }

    function invalidate() {
      dirty = true;
    }

    function cursorChange() {
      current.current.onCursorPositionChange?.(
        editor.getCursorPosition(),
        editor
      );
    }

    function bindSession() {
      session.on("changeFold", invalidate);
      session.on("changeWrapMode", invalidate);
      session.getSelection().on("changeCursor", cursorChange);
    }

    function unbindSession() {
      session.off("changeFold", invalidate);
      session.off("changeWrapMode", invalidate);
      session.getSelection().off("changeCursor", cursorChange);
    }

    function changeSession() {
      unbindSession();
      session = editor.getSession();
      bindSession();
      invalidate();
    }

    function destroyed() {
      alive = false;
    }

    bindSession();
    editor.on("focus", cursorChange);
    editor.on("change", invalidate);
    editor.on("changeSession", changeSession);
    editor.on("destroy", destroyed);
    renderer.on("afterRender", update);
    refresh.current = update;
    update();

    return () => {
      refresh.current = undefined;
      unbindSession();
      editor.off("focus", cursorChange);
      editor.off("change", invalidate);
      editor.off("changeSession", changeSession);
      editor.off("destroy", destroyed);
      renderer.off("afterRender", update);
      reserve(false);
      frame.remove();
    };
  }, [getEditor]);

  const { renderGutterHint } = props;
  if (!gutter || !renderGutterHint) return null;
  const { editor, host, hints, height } = gutter;
  return ReactDOM.createPortal(
    hints.map(({ row, top }) => {
      const control = renderGutterHint(row, editor);
      if (control == null || typeof control === "boolean") return null;
      return (
        <div
          key={row}
          data-slot="ace-gutter-hint"
          data-row={row}
          style={{ top, height }}
        >
          {control}
        </div>
      );
    }),
    host
  );
}
