import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_PREFIX = "table-column-widths:v1:";
const MIN_COLUMN_WIDTH = 80;

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

function addResizeHandles(table: HTMLTableElement, pathname: string, index: number) {
  if (table.dataset.tableResizeReady === "true") return;
  table.classList.add("app-enhanced-table");

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
