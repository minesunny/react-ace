import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Tabs from "@radix-ui/react-tabs";
import * as React from "react";
import { attachViewportScrollbarDrag } from "./scrollbar-drag";
import type {
  DocumentWorkspaceProps,
  WorkspaceContextMenuItem,
  WorkspaceDocument,
  WorkspaceSplitDirection,
  WorkspaceTabItemRenderState,
  WorkspaceTabLabels
} from "./workspace";

interface WorkspaceTabsProps<
  D extends WorkspaceDocument
> extends DocumentWorkspaceProps<D> {
  menuPortal: HTMLElement | null;
  splits: ReadonlyMap<string, WorkspaceSplitDirection>;
  onSplitDirectionChange?: (
    document: D,
    direction?: WorkspaceSplitDirection
  ) => void;
}

const defaultLabels: WorkspaceTabLabels = {
  rename: "Rename",
  pin: "Pin tab",
  unpin: "Unpin tab",
  close: "Close tab",
  closeOthers: "Close other tabs",
  closeAll: "Close all tabs",
  moveLeft: "Move left",
  moveRight: "Move right",
  moreTabs: "More tabs"
};

const icons = {
  close: "m18 6-12 12M6 6l12 12",
  add: "M12 5v14M5 12h14",
  pin: "M12 17v5M5 17h14l-2.5-4.5V5l1.5-2H6l1.5 2v7.5L5 17Z",
  more: "M5 12h.01M12 12h.01M19 12h.01"
};

function TabIcon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={icons[name]} />
    </svg>
  );
}

function canClose(document: WorkspaceDocument) {
  return !document.pinned && !document.disabled && document.closable !== false;
}

interface DropTarget {
  id: string;
  after: boolean;
}

interface ScrollableTabListProps extends React.ComponentPropsWithoutRef<
  typeof Tabs.List
> {
  listRef: React.Ref<HTMLDivElement>;
  viewportRef: React.Ref<HTMLDivElement>;
}

function ScrollableTabList({
  listRef,
  viewportRef,
  ...props
}: ScrollableTabListProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const root = rootRef.current;
    const viewport = root?.querySelector<HTMLElement>(
      '[data-slot="ace-workspace-tab-viewport"]'
    );
    if (root && viewport) {
      return attachViewportScrollbarDrag(
        root,
        viewport,
        "ace-workspace-tab-scrollbar"
      );
    }
  }, []);

  return (
    <ScrollArea.Root
      ref={rootRef}
      data-slot="ace-workspace-tab-scroll"
      type="auto"
    >
      <ScrollArea.Viewport
        ref={viewportRef}
        data-slot="ace-workspace-tab-viewport"
        style={{ overflowX: "auto" }}
      >
        <Tabs.List
          ref={listRef}
          data-slot="ace-workspace-tab-list"
          {...props}
        />
      </ScrollArea.Viewport>
      {typeof ResizeObserver !== "undefined" && (
        <ScrollArea.Scrollbar
          orientation="horizontal"
          data-slot="ace-workspace-tab-scrollbar"
        >
          <ScrollArea.Thumb data-slot="ace-workspace-tab-scroll-thumb" />
        </ScrollArea.Scrollbar>
      )}
    </ScrollArea.Root>
  );
}

function ScrollableMenu({ children }: { children: () => React.ReactNode }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (rootRef.current && viewportRef.current) {
      return attachViewportScrollbarDrag(
        rootRef.current,
        viewportRef.current,
        "ace-workspace-menu-scrollbar"
      );
    }
  }, []);

  return (
    <ScrollArea.Root
      ref={rootRef}
      type="auto"
      data-slot="ace-workspace-menu-scroll"
    >
      <ScrollArea.Viewport
        ref={viewportRef}
        data-slot="ace-workspace-menu-viewport"
        disableImplicitContentElement
        style={{ overflowY: "auto" }}
      >
        <ScrollArea.Content
          data-slot="ace-workspace-menu-items"
          style={{ display: "block" }}
        >
          {children()}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      {typeof ResizeObserver !== "undefined" && (
        <ScrollArea.Scrollbar
          orientation="vertical"
          data-slot="ace-workspace-menu-scrollbar"
        >
          <ScrollArea.Thumb data-slot="ace-workspace-menu-scroll-thumb" />
        </ScrollArea.Scrollbar>
      )}
    </ScrollArea.Root>
  );
}

function syncMenuPortalZoom(portal: HTMLElement | null) {
  if (!portal?.parentElement) return;
  // The menu positioner uses viewport coordinates, even when its
  // workspace has CSS zoom. Keep the portal in that coordinate space.
  const zoom = portal.parentElement.currentCSSZoom || 1;
  portal.style.zoom = zoom === 1 ? "" : String(1 / zoom);
}

function revealActiveTab(viewport: HTMLDivElement | null) {
  const row = viewport?.querySelector(
    '[role="tab"][aria-selected="true"]'
  )?.parentElement;
  if (!viewport || !row) return;

  const visible = viewport.getBoundingClientRect();
  const bounds = row.getBoundingClientRect();
  if (bounds.left < visible.left)
    viewport.scrollLeft += bounds.left - visible.left;
  else if (bounds.right > visible.right)
    viewport.scrollLeft += bounds.right - visible.right;
}

export function WorkspaceTabs<D extends WorkspaceDocument>({
  documents,
  activeId,
  onActiveDocumentChange,
  onAddDocument,
  onCloseDocument,
  onCloseDocuments,
  onRenameDocument,
  onTogglePin,
  onReorderDocuments,
  onTabClick,
  onTabDoubleClick,
  onTabFocus,
  onTabContextMenuChange,
  renderTabItem,
  renderContextMenuItem,
  contextMenuClassName,
  menus,
  onTabMenuEvent,
  tabMenuActions,
  tabLabels,
  tabBarActions,
  tabListLabel = "Documents",
  addLabel = "New document",
  closeLabel = document => `Close ${document.label}`,
  modifiedLabel = "Unsaved changes",
  menuPortal,
  splits,
  onSplitDirectionChange
}: WorkspaceTabsProps<D>) {
  const names = { ...defaultLabels, ...tabLabels };
  const ordered = React.useMemo(
    () => [
      ...documents.filter(document => document.pinned),
      ...documents.filter(document => !document.pinned)
    ],
    [documents]
  );
  const hasTabs = ordered.length > 0;
  const resizeFallback = typeof ResizeObserver === "undefined" ? ordered : null;
  const activeIndex = ordered.findIndex(document => document.id === activeId);
  const listRef = React.useRef<HTMLDivElement>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const moreRef = React.useRef<HTMLButtonElement>(null);
  const addRef = React.useRef<HTMLButtonElement>(null);
  const lastFocusedTab = React.useRef<HTMLButtonElement>(null);
  const dragSourceId = React.useRef<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null);
  const [overflow, setOverflow] = React.useState(false);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) {
      setOverflow(false);
      return;
    }

    function measure() {
      const button = moreRef.current;
      // Measure against the width the tabs would have without the overflow button.
      const gap = button
        ? Number.parseFloat(
            window.getComputedStyle(button.parentElement).columnGap
          ) || 0
        : 0;
      const available = viewport.clientWidth + (button?.offsetWidth ?? 0) + gap;
      setOverflow(viewport.scrollWidth > available + 1);
    }

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(list);
    return () => observer.disconnect();
  }, [hasTabs, overflow, resizeFallback]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function scrollTabs(event: WheelEvent) {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY))
        return;
      const scale =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? viewport.clientWidth
            : 1;
      const previous = viewport.scrollLeft;
      viewport.scrollLeft += event.deltaY * scale;
      if (viewport.scrollLeft !== previous) event.preventDefault();
    }

    viewport.addEventListener("wheel", scrollTabs, { passive: false });
    return () => viewport.removeEventListener("wheel", scrollTabs);
  }, [hasTabs]);

  React.useEffect(() => {
    revealActiveTab(viewportRef.current);
  }, [activeId, activeIndex, overflow]);

  React.useEffect(() => {
    const list = listRef.current;
    const activeTab = list?.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]'
    );
    const previous = lastFocusedTab.current;
    if (previous && !previous.isConnected) {
      lastFocusedTab.current = null;
      if (
        previous.ownerDocument.activeElement === previous.ownerDocument.body
      ) {
        const nextTab =
          activeTab ??
          list?.querySelector<HTMLButtonElement>('[role="tab"]:not(:disabled)');
        (nextTab ?? addRef.current)?.focus();
      }
    }
  }, [activeId, ordered]);

  function move(source: D, target: D, after: boolean) {
    const next = ordered.filter(document => document.id !== source.id);
    const index = next.findIndex(document => document.id === target.id);
    next.splice(index + Number(after), 0, source);
    if (
      next.some((document, position) => document.id !== ordered[position].id)
    ) {
      onReorderDocuments?.(next);
    }
  }

  function getDragSource(document: D) {
    const source = ordered.find(
      candidate => candidate.id === dragSourceId.current
    );
    return source &&
      source.id !== document.id &&
      Boolean(source.pinned) === Boolean(document.pinned) &&
      !document.disabled
      ? source
      : undefined;
  }

  function finishDrag() {
    dragSourceId.current = null;
    setDropTarget(null);
  }

  function tabContent(
    document: D,
    location: WorkspaceTabItemRenderState["location"]
  ) {
    const defaultContent = (
      <>
        {location === "tab" && document.icon && (
          <span data-slot="ace-workspace-tab-icon" aria-hidden="true">
            {document.icon}
          </span>
        )}
        <span data-slot="ace-workspace-tab-label">{document.label}</span>
        {document.modified && (
          <span
            data-slot="ace-workspace-modified"
            role="img"
            aria-label={modifiedLabel}
            title={modifiedLabel}
          />
        )}
      </>
    );
    return renderTabItem
      ? renderTabItem(document, {
          active: document.id === activeId,
          location,
          defaultContent
        })
      : defaultContent;
  }

  function menuItem(
    document: D,
    id: string,
    label: string,
    onSelect: (() => void) | undefined,
    disabled: boolean,
    source: WorkspaceContextMenuItem["source"] = "built-in"
  ) {
    return (
      <ContextMenu.Item
        key={id}
        disabled={disabled}
        onSelect={onSelect}
        onPointerUp={event => {
          // A context-menu gesture can end over an item after opening the menu.
          if (event.button !== 0 || event.ctrlKey) event.preventDefault();
        }}
        textValue={label}
        aria-label={label}
      >
        {renderContextMenuItem
          ? renderContextMenuItem({ id, label, disabled, source }, document)
          : label}
      </ContextMenu.Item>
    );
  }

  function tabLabel(document: D) {
    return document.modified
      ? `${document.label}, ${modifiedLabel}`
      : document.label;
  }

  const closeableDocuments = ordered.filter(canClose);

  return (
    <div data-slot="ace-workspace-tab-bar">
      {hasTabs ? (
        <ScrollableTabList
          listRef={listRef}
          viewportRef={viewportRef}
          aria-label={tabListLabel}
        >
          {ordered.map((document, index) => {
            const close =
              canClose(document) && (onCloseDocument || onCloseDocuments)
                ? () => {
                    if (onCloseDocument) onCloseDocument(document);
                    else onCloseDocuments([document]);
                  }
                : undefined;
            const pin =
              onTogglePin && !document.disabled
                ? () => onTogglePin(document, !document.pinned)
                : undefined;
            const rename =
              onRenameDocument && !document.disabled
                ? () => onRenameDocument(document)
                : undefined;
            const configured =
              typeof menus === "function" ? menus(document) : menus;
            const legacyActions = configured
              ? undefined
              : tabMenuActions?.(document);
            const dragEnabled = Boolean(
              onReorderDocuments && !document.disabled
            );
            const canSplit =
              onSplitDirectionChange && document.kind === "editor";
            const isSplit = canSplit && splits.has(document.id);
            const menuEnabled =
              canSplit ||
              rename ||
              pin ||
              onCloseDocument ||
              onCloseDocuments ||
              onReorderDocuments ||
              (configured?.length ?? legacyActions?.length ?? 0) > 0;
            const closeTitle = closeLabel(document);

            function renderMenuItems() {
              const pinnable = Boolean(document.pinned);
              const groupMatches = (candidate: D) =>
                Boolean(candidate.pinned) === pinnable && !candidate.disabled;
              const left = ordered.slice(0, index).reverse().find(groupMatches);
              const right = ordered.slice(index + 1).find(groupMatches);
              const others = closeableDocuments.filter(
                candidate => candidate.id !== document.id
              );
              const custom = configured
                ? configured.map(item => ({
                    ...item,
                    disabled:
                      item.disabled ||
                      (item.type === "event" && !onTabMenuEvent),
                    onSelect:
                      item.type === "callback"
                        ? () => item.onSelect(document)
                        : () =>
                            onTabMenuEvent?.({
                              name: item.event,
                              itemId: item.id,
                              document,
                              payload: item.payload
                            })
                  }))
                : (legacyActions ?? []);
              const customGroup = custom.length ? (
                <ContextMenu.Group>
                  {custom.map(action =>
                    menuItem(
                      document,
                      action.id,
                      action.label,
                      action.onSelect,
                      !!action.disabled,
                      "custom"
                    )
                  )}
                </ContextMenu.Group>
              ) : null;
              return (
                <>
                  {configured && customGroup}
                  {(canSplit ||
                    onRenameDocument ||
                    onTogglePin ||
                    onReorderDocuments) && (
                    <ContextMenu.Group>
                      {canSplit && (
                        <>
                          {menuItem(
                            document,
                            "splitEditor",
                            tabLabels?.splitRight ??
                              tabLabels?.splitEditor ??
                              "Split Right",
                            () => onSplitDirectionChange(document, "right"),
                            !!document.disabled
                          )}
                          {menuItem(
                            document,
                            "splitDown",
                            tabLabels?.splitDown ?? "Split Down",
                            () => onSplitDirectionChange(document, "down"),
                            !!document.disabled
                          )}
                          {isSplit &&
                            menuItem(
                              document,
                              "closeSplitEditor",
                              tabLabels?.closeSplitEditor ??
                                "Close Split Editor",
                              () => onSplitDirectionChange(document),
                              !!document.disabled
                            )}
                        </>
                      )}
                      {onRenameDocument &&
                        menuItem(
                          document,
                          "rename",
                          names.rename,
                          rename,
                          !rename
                        )}
                      {onTogglePin &&
                        menuItem(
                          document,
                          document.pinned ? "unpin" : "pin",
                          document.pinned ? names.unpin : names.pin,
                          pin,
                          !pin
                        )}
                      {onReorderDocuments && (
                        <>
                          {menuItem(
                            document,
                            "moveLeft",
                            names.moveLeft,
                            () => move(document, left, false),
                            document.disabled || !left
                          )}
                          {menuItem(
                            document,
                            "moveRight",
                            names.moveRight,
                            () => move(document, right, true),
                            document.disabled || !right
                          )}
                        </>
                      )}
                    </ContextMenu.Group>
                  )}
                  {(onCloseDocument || onCloseDocuments) && (
                    <ContextMenu.Group>
                      {menuItem(document, "close", names.close, close, !close)}
                      {onCloseDocuments && (
                        <>
                          {menuItem(
                            document,
                            "closeOthers",
                            names.closeOthers,
                            () => onCloseDocuments(others),
                            others.length === 0
                          )}
                          {menuItem(
                            document,
                            "closeAll",
                            names.closeAll,
                            () => onCloseDocuments(closeableDocuments),
                            closeableDocuments.length === 0
                          )}
                        </>
                      )}
                    </ContextMenu.Group>
                  )}
                  {!configured && customGroup}
                </>
              );
            }

            return (
              <ContextMenu.Root
                key={document.id}
                modal={false}
                onOpenChange={open => {
                  if (open) syncMenuPortalZoom(menuPortal);
                  onTabContextMenuChange?.(document, open);
                }}
              >
                <ContextMenu.Trigger asChild disabled={!menuEnabled}>
                  <div
                    data-slot="ace-workspace-tab"
                    data-drop={
                      dropTarget?.id === document.id
                        ? dropTarget.after
                          ? "after"
                          : "before"
                        : undefined
                    }
                    role="presentation"
                    onDragOver={event => {
                      if (!getDragSource(document)) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      const row = event.currentTarget.getBoundingClientRect();
                      const after = event.clientX >= row.left + row.width / 2;
                      if (
                        dropTarget?.id !== document.id ||
                        dropTarget.after !== after
                      ) {
                        setDropTarget({ id: document.id, after });
                      }
                    }}
                    onDragLeave={event => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node
                        ) &&
                        dropTarget?.id === document.id
                      ) {
                        setDropTarget(null);
                      }
                    }}
                    onDrop={event => {
                      const source = getDragSource(document);
                      if (!source) return;
                      event.preventDefault();
                      const row = event.currentTarget.getBoundingClientRect();
                      move(
                        source,
                        document,
                        event.clientX >= row.left + row.width / 2
                      );
                      finishDrag();
                    }}
                  >
                    <Tabs.Trigger
                      data-slot="ace-workspace-tab-trigger"
                      value={document.id}
                      disabled={document.disabled}
                      aria-keyshortcuts={close ? "Delete" : undefined}
                      title={document.label}
                      aria-label={tabLabel(document)}
                      draggable={dragEnabled}
                      onClick={event => onTabClick?.(document, event)}
                      onDoubleClick={event =>
                        onTabDoubleClick?.(document, event)
                      }
                      onFocus={event => {
                        lastFocusedTab.current = event.currentTarget;
                        onTabFocus?.(document, event);
                      }}
                      onBlur={event => {
                        if (event.relatedTarget) lastFocusedTab.current = null;
                      }}
                      onKeyDown={event => {
                        if (event.key === "Delete" && close) {
                          event.preventDefault();
                          close();
                        }
                      }}
                      onAuxClick={event => {
                        if (event.button === 1 && close) {
                          event.preventDefault();
                          close();
                        }
                      }}
                      onDragStart={event => {
                        if (!dragEnabled) return;
                        dragSourceId.current = document.id;
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "application/x-react-ace-tab",
                          document.id
                        );
                      }}
                      onDragEnd={finishDrag}
                    >
                      {tabContent(document, "tab")}
                    </Tabs.Trigger>
                    {document.pinned &&
                      (pin ? (
                        <button
                          type="button"
                          data-slot="ace-workspace-tab-close"
                          tabIndex={-1}
                          aria-label={`${names.unpin}: ${document.label}`}
                          title={names.unpin}
                          onMouseDown={event => event.preventDefault()}
                          onClick={pin}
                        >
                          <TabIcon name="pin" />
                        </button>
                      ) : (
                        <span
                          data-slot="ace-workspace-tab-close"
                          aria-hidden="true"
                        >
                          <TabIcon name="pin" />
                        </span>
                      ))}
                    {close && (
                      <button
                        type="button"
                        data-slot="ace-workspace-tab-close"
                        tabIndex={-1}
                        aria-label={closeTitle}
                        title={closeTitle}
                        onMouseDown={event => event.preventDefault()}
                        onClick={close}
                      >
                        <TabIcon name="close" />
                      </button>
                    )}
                  </div>
                </ContextMenu.Trigger>
                {menuEnabled && menuPortal && (
                  <ContextMenu.Portal container={menuPortal}>
                    <ContextMenu.Content
                      data-slot="ace-workspace-menu"
                      className={contextMenuClassName}
                      aria-label={document.label}
                      collisionPadding={6}
                    >
                      <ScrollableMenu>{renderMenuItems}</ScrollableMenu>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                )}
              </ContextMenu.Root>
            );
          })}
        </ScrollableTabList>
      ) : (
        <div data-slot="ace-workspace-tab-spacer" />
      )}
      {overflow && menuPortal && (
        <DropdownMenu.Root
          modal={false}
          onOpenChange={open => {
            if (open) syncMenuPortalZoom(menuPortal);
          }}
        >
          <DropdownMenu.Trigger asChild>
            <button
              ref={moreRef}
              type="button"
              data-slot="ace-workspace-tab-add"
              aria-label={names.moreTabs}
              title={names.moreTabs}
            >
              <TabIcon name="more" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal container={menuPortal}>
            <DropdownMenu.Content
              data-slot="ace-workspace-menu"
              sideOffset={5}
              align="end"
              collisionPadding={6}
              aria-label={names.moreTabs}
            >
              <ScrollableMenu>
                {() => (
                  <DropdownMenu.RadioGroup
                    value={activeId ?? ""}
                    onValueChange={onActiveDocumentChange}
                  >
                    {ordered.map(document => (
                      <DropdownMenu.RadioItem
                        key={document.id}
                        value={document.id}
                        disabled={document.disabled}
                        textValue={document.label}
                        aria-label={tabLabel(document)}
                        onSelect={() => {
                          if (document.id === activeId)
                            revealActiveTab(viewportRef.current);
                        }}
                      >
                        {document.id === activeId && (
                          <span
                            data-slot="ace-workspace-menu-indicator"
                            aria-hidden="true"
                          />
                        )}
                        {tabContent(document, "overflow")}
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                )}
              </ScrollableMenu>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
      {tabBarActions}
      {onAddDocument && (
        <button
          ref={addRef}
          type="button"
          data-slot="ace-workspace-tab-add"
          aria-label={addLabel}
          title={addLabel}
          onClick={onAddDocument}
        >
          <TabIcon name="add" />
        </button>
      )}
    </div>
  );
}
