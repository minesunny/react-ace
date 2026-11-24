import { createElement, type ElementType } from "react";
export { Fragment } from "react";

function jsx(type: ElementType, props: Record<string, unknown>, key?: string) {
  return createElement(type, key === undefined ? props : { ...props, key });
}

export { jsx, jsx as jsxs };
