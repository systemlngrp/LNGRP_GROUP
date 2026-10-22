import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_PREFIX = "table-column-widths:v1:";
const MIN_COLUMN_WIDTH = 80;
const TABLE_SCROLL_READY = "tableScrollReady";
const DRAG_THRESHOLD = 4;
const KEY_SCROLL_STEP = 40;

type ScrollDirection = "left" | "right" | "up" | "down";

export type TableScrollMetrics = {
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
  scrollTop: number;
  scrollWidth: number;
  scrollLeft: number;
};

export type TableScrollAction = {
  direction: ScrollDirection;
  left: number;
  top: number;
};

export function getTableScrollAction(
  key: string,
  ctrlKey: boolean,
  metrics: TableScrollMetrics,
): TableScrollAction | null {
  const pageStep = Math.max(KEY_SCROLL_STEP, Math.round(metrics.clientHeight * 0.9));
  switch (key) {
    case "ArrowLeft":
      return { direction: "left", left: -KEY_SCROLL_STEP, top: 0 };
    case "ArrowRight":
      return { direction: "right", left: KEY_SCROLL_STEP, top: 0 };
    case "ArrowUp":
      return { direction: "up", left: 0, top: -KEY_SCROLL_STEP };
    case "ArrowDown":
      return { direction: "down", left: 0, top: KEY_SCROLL_STEP };
    case "PageUp":
      return { direction: "up", left: 0, top: -pageStep };
    case "PageDown":
      return { direction: "down", left: 0, top: pageStep };
    case "Home":
      return ctrlKey
        ? { direction: "up", left: 0, top: -metrics.scrollTop }
        : { direction: "left", left: -metrics.scrollLeft, top: 0 };
    case "End":
      return ctrlKey
        ? { direction: "down", left: 0, top: metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop }
        : { direction: "right", left: metrics.scrollWidth - metrics.clientWidth - metrics.scrollLeft, top: 0 };
    default:
      return null;
  }
}

function readWidths(key: string): number[] | null {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value >= MIN_COLUMN_WIDTH);
  } catch {
    return null;
  }
}

function saveWidths(key: string, widths: number[]) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(widths));
  } catch {
    // Width persistence is optional when storage is unavailable or restricted.
  }
}

function getColumnCount(headerRow: HTMLTableRowElement) {
  return Array.from(headerRow.cells).reduce((count, cell) => count + Math.max(1, cell.colSpan || 1), 0);
}

function getColumnWidths(table: HTMLTableElement, headerRow: HTMLTableRowElement, count: number) {
  const saved = readWidths(table.dataset.tableResizeKey || "");
  if (saved && saved.length >= count) return saved.slice(0, count);
  const widths: number[] = [];
  Array.from(headerRow.cells).forEach((cell) => {
    const width = Math.max(MIN_COLUMN_WIDTH, Math.round(cell.getBoundingClientRect().width));
    for (let index = 0; index < Math.max(1, cell.colSpan || 1); index += 1) widths.push(width / Math.max(1, cell.colSpan || 1));
  });
  while (widths.length < count) widths.push(MIN_COLUMN_WIDTH);
  return widths.slice(0, count);
}

function ensureColGroup(table: HTMLTableElement, count: number) {
  let colGroup = table.querySelector("colgroup[data-resizable-columns]") as HTMLElement | null;
  if (!colGroup) {
    colGroup = table.querySelector("colgroup") as HTMLElement | null;
  }
  if (!colGroup) {
    colGroup = document.createElement("colgroup");
    colGroup.dataset.resizableColumns = "true";
    table.insertBefore(colGroup, table.firstChild);
  } else {
    colGroup.dataset.resizableColumns = "true";
  }
  while (colGroup.children.length < count) colGroup.appendChild(document.createElement("col"));
  while (colGroup.children.length > count) colGroup.removeChild(colGroup.lastElementChild as Element);
  return Array.from(colGroup.children) as HTMLTableColElement[];
}

function applyColumnWidths(table: HTMLTableElement, widths: number[]) {
  const columns = ensureColGroup(table, widths.length);
  columns.forEach((column, index) => {
    column.style.width = `${Math.max(MIN_COLUMN_WIDTH, widths[index] || MIN_COLUMN_WIDTH)}px`;
  });
  const totalWidth = widths.reduce((sum, width) => sum + Math.max(MIN_COLUMN_WIDTH, width || MIN_COLUMN_WIDTH), 0);
  const parentWidth = table.parentElement?.clientWidth || 0;
  table.style.width = `${Math.max(totalWidth, parentWidth)}px`;
}

function tableKey(pathname: string, table: HTMLTableElement, index: number) {
  const headers = Array.from(table.querySelectorAll("thead tr:first-child th"))
    .map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim().toLowerCase())
    .join("|");
  return encodeURIComponent(`${pathname}|${headers || "no-header"}|${index}`);
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(
    "button, a, input, select, textarea, [contenteditable=\"true\"], .app-table-column-resizer"
  ));
}

function findScrollableAncestor(table: HTMLTableElement, content: HTMLElement) {
  let element = table.parentElement;
  while (element) {
    const style = window.getComputedStyle(element);
    const canScrollX = ["auto", "scroll", "overlay"].includes(style.overflowX);
    const canScrollY = ["auto", "scroll", "overlay"].includes(style.overflowY);
    if (canScrollX || canScrollY) return element;
    if (element === content) break;
    element = element.parentElement;
  }
  return content;
}

function canScrollInDirection(container: HTMLElement, direction: ScrollDirection) {
  switch (direction) {
    case "left":
      return container.scrollLeft > 0;
    case "right":
      return container.scrollLeft < container.scrollWidth - container.clientWidth;
    case "up":
      return container.scrollTop > 0;
    case "down":
      return container.scrollTop < container.scrollHeight - container.clientHeight;
  }
}

function scrollBy(container: HTMLElement, left: number, top: number) {
  const nextLeft = Math.max(0, Math.min(container.scrollWidth - container.clientWidth, container.scrollLeft + left));
  const nextTop = Math.max(0, Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + top));
  container.scrollLeft = nextLeft;
  container.scrollTop = nextTop;
}

function handleTableKeyDown(event: KeyboardEvent, container: HTMLElement) {
  if (isInteractiveTarget(event.target)) return;

  const action = getTableScrollAction(event.key, event.ctrlKey, container);
  if (!action) return;

  if (!canScrollInDirection(container, action.direction)) return;
  event.preventDefault();
  scrollBy(container, action.left, action.top);
}

function enhanceScrollContainer(container: HTMLElement) {
  if (container.dataset[TABLE_SCROLL_READY] === "true") return;
  container.dataset[TABLE_SCROLL_READY] = "true";
  container.classList.add("app-table-scroll-container");
  if (container.getAttribute("tabindex") === null) container.tabIndex = 0;
  if (!container.getAttribute("aria-label")) container.setAttribute("aria-label", "Scrollable table");

  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let pointerId: number | null = null;
  let dragging = false;

  const stopDragging = () => {
    if (pointerId === null) return;
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", stopDragging);
    document.removeEventListener("pointercancel", stopDragging);
    pointerId = null;
    dragging = false;
    container.classList.remove("app-table-dragging");
    document.body.classList.remove("app-table-dragging");
  };

  container.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    if (!(event.target instanceof Element) || !event.target.closest("table")) return;
    container.focus({ preventScroll: true });
    pointerId = event.pointerId;
    startX = lastX = event.clientX;
    startY = lastY = event.clientY;
    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", stopDragging, { once: true });
    document.addEventListener("pointercancel", stopDragging, { once: true });
  });

  const handlePointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    const totalX = event.clientX - startX;
    const totalY = event.clientY - startY;
    if (!dragging && Math.hypot(totalX, totalY) < DRAG_THRESHOLD) return;
    if (!dragging) {
      dragging = true;
      container.classList.add("app-table-dragging");
      document.body.classList.add("app-table-dragging");
    }
    event.preventDefault();
    scrollBy(container, lastX - event.clientX, lastY - event.clientY);
    lastX = event.clientX;
    lastY = event.clientY;
  };

  container.addEventListener("pointerup", stopDragging);
  container.addEventListener("pointercancel", stopDragging);
  container.addEventListener("wheel", (event) => {
    const horizontalDelta = event.deltaX || (event.shiftKey ? event.deltaY : 0);
    if (!horizontalDelta || !canScrollInDirection(container, horizontalDelta < 0 ? "left" : "right")) return;
    container.scrollLeft += horizontalDelta;
    if (event.shiftKey || event.deltaX) event.preventDefault();
  }, { passive: false });
  container.addEventListener("keydown", (event) => handleTableKeyDown(event, container));
}

function addResizeHandles(table: HTMLTableElement, pathname: string, index: number) {
  if (table.dataset.tableResizeReady === "true") return;
  table.classList.add("app-enhanced-table");

  const content = table.closest<HTMLElement>(".app-view-content");
  if (content) enhanceScrollContainer(findScrollableAncestor(table, content));

  const headerRow = table.querySelector("thead tr:first-child") as HTMLTableRowElement | null;
  if (!headerRow || headerRow.cells.length === 0) return;
  table.dataset.tableResizeReady = "true";

  const key = tableKey(pathname, table, index);
  table.dataset.tableResizeKey = key;
  const columnCount = getColumnCount(headerRow);
  const widths = getColumnWidths(table, headerRow, columnCount);
  applyColumnWidths(table, widths);

  let columnIndex = 0;
  Array.from(headerRow.cells).forEach((cell) => {
    const span = Math.max(1, cell.colSpan || 1);
    if (span !== 1) {
      columnIndex += span;
      return;
    }
    const currentColumn = columnIndex;
    cell.classList.add("app-resizable-header");
    const handle = document.createElement("span");
    handle.className = "app-table-column-resizer";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-label", `Resize ${cell.textContent?.trim() || "table"} column`);
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = widths[currentColumn] || Math.round(cell.getBoundingClientRect().width);
      const activeColumn = currentColumn;
      const move = (moveEvent: PointerEvent) => {
        widths[activeColumn] = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX));
        applyColumnWidths(table, widths);
      };
      const up = () => {
        saveWidths(key, widths);
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.body.classList.remove("app-resizing-table-column");
      };
      document.body.classList.add("app-resizing-table-column");
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up, { once: true });
    });
    cell.appendChild(handle);
    columnIndex += 1;
  });
}

export function ResizableTables() {
  const location = useLocation();

  useEffect(() => {
    const content = document.querySelector<HTMLElement>(".app-view-content");
    if (!content) return;

    const enhance = () => {
      const tables = Array.from(content.querySelectorAll<HTMLTableElement>("table"));
      tables.forEach((table, index) => addResizeHandles(table, location.pathname, index));
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(content, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location.pathname]);

  return null;
}
