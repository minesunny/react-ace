import * as React from "react";
import type { WorkspaceSplitDirection } from "./workspace";

const minimum = 20;
const maximum = 80;

export function WorkspaceSplitHandle({
  direction,
  label
}: {
  direction: WorkspaceSplitDirection;
  label: string;
}) {
  const stacked = direction === "down";
  const divider = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState(50);

  React.useEffect(() => {
    const panel = divider.current?.parentElement;
    return () => {
      panel?.style.removeProperty("--ace-workspace-split-primary");
    };
  }, []);

  function resize(element: HTMLDivElement, percentage: number) {
    const next = Math.max(minimum, Math.min(maximum, Math.round(percentage)));
    element.parentElement.style.setProperty(
      "--ace-workspace-split-primary",
      `${next / (100 - next)}fr`
    );
    setSize(next);
  }

  function resizeFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const { currentTarget, clientX, clientY } = event;
    const primary =
      currentTarget.previousElementSibling.getBoundingClientRect();
    const secondary = currentTarget.nextElementSibling.getBoundingClientRect();
    const handle = currentTarget.getBoundingClientRect();
    const rtl = !stacked && getComputedStyle(currentTarget).direction === "rtl";
    const span = stacked
      ? secondary.bottom - primary.top
      : rtl
        ? primary.right - secondary.left
        : secondary.right - primary.left;
    const distance = stacked
      ? clientY - primary.top
      : rtl
        ? primary.right - clientX
        : clientX - primary.left;
    const gap = stacked ? handle.height : handle.width;
    if (span <= gap) return;
    resize(currentTarget, ((distance - gap / 2) / (span - gap)) * 100);
  }

  return (
    <div
      ref={divider}
      data-slot="ace-workspace-split-handle"
      tabIndex={0}
      role="separator"
      aria-orientation={stacked ? "horizontal" : "vertical"}
      aria-label={label}
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={size}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        event.preventDefault();
        resizeFromPointer(event);
      }}
      onPointerMove={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          resizeFromPointer(event);
        }
      }}
      onKeyDown={event => {
        const { currentTarget, key } = event;
        const sign =
          !stacked && getComputedStyle(currentTarget).direction === "rtl"
            ? -1
            : 1;
        const smaller = stacked ? "ArrowUp" : "ArrowLeft";
        const larger = stacked ? "ArrowDown" : "ArrowRight";
        const next =
          key === "Home"
            ? minimum
            : key === "End"
              ? maximum
              : key === smaller
                ? size - 5 * sign
                : key === larger
                  ? size + 5 * sign
                  : undefined;
        if (next === undefined) return;
        event.preventDefault();
        resize(currentTarget, next);
      }}
    />
  );
}
