import type { Ace } from "ace-builds";
import { attachScrollbarDrag } from "./scrollbar-drag";

interface AceScrollbarGeometry {
  scrollBarH: { isVisible: boolean; pageWidth: number; viewWidth: number };
  scrollBarV: { isVisible: boolean; pageHeight: number; viewHeight: number };
  scrollMargin: { left: number; top: number };
}

export function attachAceScrollbars(editor: Ace.Editor) {
  const root = editor.container;
  // Ace draws scrollbar annotations with a canvas. DOM-only renderers may not provide one.
  const view = root.ownerDocument.defaultView;
  if (!view?.CanvasRenderingContext2D) return;

  const renderer = editor.renderer;
  editor.setOption("customScrollbar", true);
  root.classList.add("react-ace-custom-scrollbars");
  const unbind = attachScrollbarDrag(
    root,
    {
      x: ":scope > .ace_sb-h",
      y: ":scope > .ace_sb-v"
    },
    (axis, fraction) => {
      // Ace's custom scrollbar owns the scroll ranges and includes the scroll margins.
      const { scrollBarH, scrollBarV, scrollMargin } =
        renderer as unknown as AceScrollbarGeometry;
      const session = editor.getSession();
      if (axis === "y") {
        session.setScrollTop(
          fraction * (scrollBarV.pageHeight - scrollBarV.viewHeight) -
            scrollMargin.top
        );
      } else {
        session.setScrollLeft(
          fraction * (scrollBarH.pageWidth - scrollBarH.viewWidth) -
            scrollMargin.left
        );
      }
    }
  );

  function clampScrollOffsets() {
    if (!editor.getOption("customScrollbar")) return;
    const { scrollBarH, scrollBarV, scrollMargin } =
      renderer as unknown as AceScrollbarGeometry;
    const session = editor.getSession();

    // A disappearing scrollbar can change the other axis's range during render.
    if (scrollBarH.isVisible) {
      const maxLeft =
        Math.max(0, scrollBarH.pageWidth - scrollBarH.viewWidth) -
        scrollMargin.left;
      if (session.getScrollLeft() > maxLeft) session.setScrollLeft(maxLeft);
    }
    if (scrollBarV.isVisible) {
      const maxTop =
        Math.max(0, scrollBarV.pageHeight - scrollBarV.viewHeight) -
        scrollMargin.top;
      if (session.getScrollTop() > maxTop) session.setScrollTop(maxTop);
    }
  }

  renderer.on("afterRender", clampScrollOffsets);
  return () => {
    renderer.off("afterRender", clampScrollOffsets);
    unbind();
    root.classList.remove("react-ace-custom-scrollbars");
  };
}
