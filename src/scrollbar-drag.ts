type Axis = "x" | "y";

interface Drag {
  axis: Axis;
  pointerId: number;
  grab: number;
}

export function attachScrollbarDrag(
  root: HTMLElement,
  selectors: Partial<Record<Axis, string>>,
  scroll: (axis: Axis, fraction: number) => void
) {
  let drag: Drag | null = null;

  function trackFor(axis: Axis) {
    const selector = selectors[axis];
    return selector ? root.querySelector<HTMLElement>(selector) : null;
  }

  function measure(track: HTMLElement, axis: Axis, event: PointerEvent) {
    const thumb = track.firstElementChild;
    if (!thumb) return;

    const vertical = axis === "y";
    const rect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const style = getComputedStyle(track);
    const renderedSize = vertical ? rect.height : rect.width;
    const layoutSize = vertical ? track.offsetHeight : track.offsetWidth;
    if (!layoutSize || !renderedSize) return;

    // Match the track and pointer in the rendered coordinate space, including CSS zoom.
    const scale = renderedSize / layoutSize;
    const paddingStart =
      (parseFloat(vertical ? style.paddingTop : style.paddingLeft) || 0) *
      scale;
    const paddingEnd =
      (parseFloat(vertical ? style.paddingBottom : style.paddingRight) || 0) *
      scale;
    const pointer = vertical ? event.clientY : event.clientX;
    const thumbSize = vertical ? thumbRect.height : thumbRect.width;
    const origin = (vertical ? rect.top : rect.left) + paddingStart;
    return {
      thumb,
      thumbSize,
      thumbOrigin: vertical ? thumbRect.top : thumbRect.left,
      pointer,
      offset: pointer - origin,
      travel: renderedSize - paddingStart - paddingEnd - thumbSize
    };
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;

    const track = trackFor(drag.axis);
    const positions = track && measure(track, drag.axis, event);
    if (!positions || positions.travel <= 0) return;

    const fraction =
      (positions.offset - drag.grab * positions.thumbSize) / positions.travel;
    scroll(drag.axis, Math.max(0, Math.min(1, fraction)));
  }

  function start(event: PointerEvent) {
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      !(event.target instanceof Element)
    )
      return;

    const target = event.target;
    const axis = (["x", "y"] as const).find(candidate =>
      trackFor(candidate)?.contains(target)
    );
    if (!axis) return;

    const positions = measure(trackFor(axis), axis, event);
    if (!positions || positions.travel <= 0 || !positions.thumbSize) return;

    const grab = positions.thumb.contains(target)
      ? (positions.pointer - positions.thumbOrigin) / positions.thumbSize
      : 0.5;

    event.preventDefault();
    event.stopPropagation();
    drag = { axis, pointerId: event.pointerId, grab };
    root.setPointerCapture(event.pointerId);
    move(event);
  }

  function end(event: PointerEvent) {
    if (drag?.pointerId === event.pointerId) drag = null;
  }

  root.addEventListener("pointerdown", start, true);
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", end);
  root.addEventListener("lostpointercapture", end);
  return () => {
    if (drag && root.hasPointerCapture(drag.pointerId))
      root.releasePointerCapture(drag.pointerId);
    root.removeEventListener("pointerdown", start, true);
    root.removeEventListener("pointermove", move);
    root.removeEventListener("pointerup", end);
    root.removeEventListener("pointercancel", end);
    root.removeEventListener("lostpointercapture", end);
  };
}

export function attachViewportScrollbarDrag(
  root: HTMLElement,
  viewport: HTMLElement,
  slot: string
) {
  return attachScrollbarDrag(
    root,
    {
      x: `:scope > [data-slot="${slot}"][data-orientation="horizontal"]`,
      y: `:scope > [data-slot="${slot}"][data-orientation="vertical"]`
    },
    (axis, fraction) => {
      if (axis === "y") {
        viewport.scrollTop =
          fraction * (viewport.scrollHeight - viewport.clientHeight);
      } else {
        const position =
          getComputedStyle(viewport).direction === "rtl"
            ? fraction - 1
            : fraction;
        viewport.scrollLeft =
          position * (viewport.scrollWidth - viewport.clientWidth);
      }
    }
  );
}
