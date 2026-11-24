import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as React from "react";
import { attachViewportScrollbarDrag } from "./scrollbar-drag";

export function WorkspaceDocumentContent({
  children,
  scrollable = true
}: {
  children: React.ReactNode;
  scrollable?: boolean;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (scrollable && rootRef.current && viewportRef.current) {
      return attachViewportScrollbarDrag(
        rootRef.current,
        viewportRef.current,
        "ace-workspace-content-scrollbar"
      );
    }
  }, [scrollable]);

  if (!scrollable) {
    return <div data-slot="ace-workspace-content">{children}</div>;
  }

  return (
    <ScrollArea.Root
      ref={rootRef}
      type="auto"
      data-slot="ace-workspace-content"
    >
      <ScrollArea.Viewport
        ref={viewportRef}
        data-slot="ace-workspace-content-viewport"
        style={{ overflow: "auto" }}
      >
        {children}
      </ScrollArea.Viewport>
      {typeof ResizeObserver !== "undefined" && (
        <>
          <ScrollArea.Scrollbar
            orientation="vertical"
            data-slot="ace-workspace-content-scrollbar"
          >
            <ScrollArea.Thumb data-slot="ace-workspace-content-scroll-thumb" />
          </ScrollArea.Scrollbar>
          <ScrollArea.Scrollbar
            orientation="horizontal"
            data-slot="ace-workspace-content-scrollbar"
          >
            <ScrollArea.Thumb data-slot="ace-workspace-content-scroll-thumb" />
          </ScrollArea.Scrollbar>
          <ScrollArea.Corner />
        </>
      )}
    </ScrollArea.Root>
  );
}
