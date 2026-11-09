import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getDataAuthHeaders, useData } from "../hooks/useData";
import type { Setting } from "../types";

const STORAGE_PREFIX = "table-column-widths:v1:";
const MIN_COLUMN_WIDTH = 80;
const ACTION_COLUMN_MIN_WIDTH = 160;
const TABLE_SCROLL_READY = "tableScrollReady";
const TABLE_PAGINATION_HIDDEN = "tablePaginationHidden";
const TABLE_PAGINATION_EXTERNAL = "tablePaginationExternal";
const TABLE_PAGE_SIZE = 25;
export const TABLE_PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const;
const DRAG_THRESHOLD = 4;
const KEY_SCROLL_STEP = 40;
type SharedTableWidths = Record<string, number[]>;

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

export type TablePageRange = {
  start: number;
  end: number;
  totalPages: number;
};

export function getTablePageRange(totalItems: number, page: number, pageSize: number): TablePageRange {
  const safeTotal = Number.isFinite(totalItems) ? Math.max(0, Math.floor(totalItems)) : 0;
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : TABLE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const safePageInput = Number.isFinite(page) ? Math.floor(page) : 1;
  const safePage = Math.min(Math.max(1, safePageInput), totalPages);
  return {
    start: safeTotal === 0 ? 0 : (safePage - 1) * safePageSize + 1,
    end: safeTotal === 0 ? 0 : Math.min(safeTotal, safePage * safePageSize),
    totalPages,
  };
}

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

function parseSharedTableWidths(raw: string | undefined): SharedTableWidths {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => {
      if (!Array.isArray(value)) return [];
      const widths = value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item >= MIN_COLUMN_WIDTH);
      return widths.length ? [[key, widths]] : [];
    }));
  } catch {
    return {};
  }
}

function parseResizeUsers(raw: string | undefined) {
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value || "").trim()).filter(Boolean) : []);
  } catch {
    return new Set<string>();
  }
}

function getColumnCount(headerRow: HTMLTableRowElement) {
  return Array.from(headerRow.cells).reduce((count, cell) => count + Math.max(1, cell.colSpan || 1), 0);
}

function getResizeHeaderRow(table: HTMLTableElement) {
  const rows = table.tHead ? Array.from(table.tHead.rows) : [];
  if (rows.length === 0) return null;

  // Group headers commonly use colSpan, so the first row may represent only
  // a handful of visual bands rather than the table's actual columns. Pick
  // the deepest row with the most effective columns for resizing.
  return rows.reduce((selected, row) => {
    if (!selected) return row;
    const rowColumnCount = getColumnCount(row);
    const selectedColumnCount = getColumnCount(selected);
    return rowColumnCount >= selectedColumnCount ? row : selected;
  }, null as HTMLTableRowElement | null);
}

type CellRange = {
  cell: HTMLTableCellElement;
  start: number;
  end: number;
};

function getCellRanges(rows: HTMLTableRowElement[], maxColumns?: number) {
  const occupiedUntil: number[] = [];
  const ranges: CellRange[] = [];

  rows.forEach((row, rowIndex) => {
    let column = 0;
    Array.from(row.cells).forEach((cell) => {
      while ((occupiedUntil[column] || 0) > rowIndex) column += 1;
      const start = column;
      const span = Math.max(1, cell.colSpan || 1);
      const end = maxColumns === undefined ? start + span : Math.min(maxColumns, start + span);
      ranges.push({ cell, start, end });
      const rowEnd = rowIndex + Math.max(1, cell.rowSpan || 1);
      for (let index = start; index < end; index += 1) occupiedUntil[index] = rowEnd;
      column += span;
    });
  });

  return ranges;
}

function normalizedCellText(cell: HTMLTableCellElement) {
  return (cell.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function isActionHeaderLabel(value: string) {
  return /^(action|actions|operation|operations|control|controls)$/.test(value.replace(/\s+/g, " ").trim().toLowerCase());
}

function isActionHeader(cell: HTMLTableCellElement) {
  return isActionHeaderLabel(normalizedCellText(cell));
}

function getActionColumnIndexes(table: HTMLTableElement, count: number) {
  const actionColumns = new Set<number>();
  const headerRows = table.tHead ? Array.from(table.tHead.rows) : [];
  const headerRanges = getCellRanges(headerRows, count);

  headerRanges.forEach(({ cell, start, end }) => {
    if (!isActionHeader(cell)) return;
    for (let index = start; index < end; index += 1) actionColumns.add(index);
  });

  if (actionColumns.size === 0) {
    const bodyRows = getDirectTableRows(table);
    getCellRanges(bodyRows, count).forEach(({ cell, start, end }) => {
      if (cell.colSpan > 1 || !cell.querySelector(
        "button, a, input, select, textarea, [role=button], [data-action], .table-action-cell"
      )) return;
      for (let index = start; index < end; index += 1) actionColumns.add(index);
    });
  }

  return actionColumns;
}

function markActionColumns(table: HTMLTableElement, actionColumns: Set<number>, count: number) {
  if (actionColumns.size === 0) return;

  const markRanges = (rows: HTMLTableRowElement[], skipSpanningCells = false) => {
    getCellRanges(rows, count).forEach(({ cell, start, end }) => {
      if (skipSpanningCells && cell.colSpan > 1) return;
      const isAction = Array.from(actionColumns).some((index) => index >= start && index < end);
      cell.classList.toggle("app-table-action-column", isAction);
      if (isAction) cell.setAttribute("data-table-action-column", "true");
      else cell.removeAttribute("data-table-action-column");
    });
  };

  markRanges(table.tHead ? Array.from(table.tHead.rows) : []);
  markRanges(getDirectTableRows(table), true);
  markRanges(table.tFoot ? Array.from(table.tFoot.rows) : [], true);
}

function getColumnWidths(table: HTMLTableElement, headerRow: HTMLTableRowElement, count: number, sharedWidths?: SharedTableWidths) {
  const shared = sharedWidths?.[table.dataset.tableResizeKey || ""];
  if (shared && shared.length >= count) return shared.slice(0, count);
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

// ---- Column content rules -------------------------------------------------
// Codes, numbers and dates (GE No, MRR No, Job No, invoice value, dates…) stay
// on one line; names (party, item, company…) wrap to about two lines; header
// words never break in the middle. Each column gets a minimum width from its
// content so it can neither wrap a code nor split a header word, also when a
// user drags it narrower.

const TEXT_COLUMN_MAX_MIN_WIDTH = 300;
const MAX_MEASURED_ROWS = 1500;
const columnMinimums = new WeakMap<HTMLTableElement, number[]>();
let measureContext: CanvasRenderingContext2D | null = null;

function measureText(text: string, style: CSSStyleDeclaration) {
  if (!measureContext) measureContext = document.createElement("canvas").getContext("2d");
  if (!measureContext || !text) return 0;
  measureContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const shown = style.textTransform === "uppercase" ? text.toUpperCase() : text;
  const spacing = Number.parseFloat(style.letterSpacing) || 0;
  return measureContext.measureText(shown).width + spacing * shown.length;
}

function cellText(cell: HTMLTableCellElement) {
  return (cell.textContent || "").replace(/\s+/g, " ").trim();
}

// A code, number or date: up to 4 words, has a digit, and every word either
// has a digit or is short (KG, PCS, Rs, a firm code…).
export function isCodeLikeText(text: string) {
  const words = text.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 4 || !/\d/.test(text)) return false;
  return words.every((word) => /\d/.test(word) || word.length <= 4);
}

// Stored file names (e.g. c4565be1-530c-4bff-a70c-6fee7b3131a5.pdf) are shown
// short: one line, cut with "…", full name on hover.
const FILE_NAME_PATTERN = /^[\w\-. ()]{12,}\.(pdf|jpe?g|png|webp|gif|heic|xlsx?|docx?|csv)$/i;
const FILE_COLUMN_WIDTH = 130;

function isNeutralText(text: string) {
  return !/[\p{L}\p{N}]/u.test(text);
}

function horizontalPadding(style: CSSStyleDeclaration) {
  return (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0) +
    (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.borderRightWidth) || 0);
}

function applyColumnContentRules(table: HTMLTableElement, count: number, actionColumns: Set<number>) {
  const headerRanges = getCellRanges(table.tHead ? Array.from(table.tHead.rows) : [], count);
  const bodyRows = getDirectTableRows(table).filter((row) => !isSpanningTableRow(row, count)).slice(0, MAX_MEASURED_ROWS);
  const bodyRanges = getCellRanges(bodyRows, count);
  const byColumn: HTMLTableCellElement[][] = Array.from({ length: count }, () => []);
  bodyRanges.forEach(({ cell, start, end }) => {
    if (end - start === 1) byColumn[start].push(cell);
  });
  const headersByColumn: HTMLTableCellElement[][] = Array.from({ length: count }, () => []);
  headerRanges.forEach(({ cell, start, end }) => {
    if (end - start === 1) headersByColumn[start].push(cell);
  });

  const minimums: number[] = [];
  for (let column = 0; column < count; column += 1) {
    if (actionColumns.has(column)) {
      minimums.push(0);
      continue;
    }
    // Longest header word: the column is never narrower, so header words do not split.
    let headerMin = 0;
    headersByColumn[column].forEach((header) => {
      const style = getComputedStyle(header);
      const longestWord = cellText(header).split(" ").reduce((max, word) => Math.max(max, measureText(word, style)), 0);
      headerMin = Math.max(headerMin, Math.ceil(longestWord + horizontalPadding(style) + 14));
    });

    const cells = byColumn[column].filter((cell) => !cell.querySelector("input, select, textarea"));
    const texts = cells.map(cellText);
    const counted = texts.filter((text) => text && !isNeutralText(text));
    const fileCount = counted.filter((text) => FILE_NAME_PATTERN.test(text)).length;
    const isFile = counted.length > 0 && fileCount >= counted.length * 0.8;
    const codeCount = counted.filter(isCodeLikeText).length;
    const isCode = !isFile && counted.length > 0 && codeCount >= counted.length * 0.8;
    const kind = isFile ? "file" : isCode ? "code" : "text";
    byColumn[column].forEach((cell) => {
      if (cell.dataset.cellKind !== kind) cell.dataset.cellKind = kind;
      if (isFile) {
        const full = cellText(cell);
        if (full && cell.title !== full) cell.title = full;
      }
    });
    if (isFile) {
      minimums.push(Math.max(MIN_COLUMN_WIDTH, headerMin, FILE_COLUMN_WIDTH));
      continue;
    }

    let contentMin = 0;
    if (cells.length) {
      const style = getComputedStyle(cells[0]);
      const padding = horizontalPadding(style) + 4;
      let widest = 0;
      let widestWord = 0;
      texts.forEach((text) => {
        if (!text) return;
        widest = Math.max(widest, measureText(text, style));
        if (!isCode) widestWord = Math.max(widestWord, text.split(" ").reduce((max, word) => Math.max(max, measureText(word, style)), 0));
      });
      contentMin = isCode
        ? Math.ceil(widest + padding)
        // Names: wide enough that the longest fits in about two lines.
        : Math.ceil(Math.min(TEXT_COLUMN_MAX_MIN_WIDTH, Math.max(widest / 2 * 1.15, widestWord) + padding));
    }
    minimums.push(Math.max(MIN_COLUMN_WIDTH, headerMin, contentMin));
  }
  columnMinimums.set(table, minimums);
  return minimums;
}

function withColumnMinimums(table: HTMLTableElement, widths: number[]) {
  const minimums = columnMinimums.get(table);
  if (!minimums) return widths;
  return widths.map((width, index) => Math.max(width || 0, minimums[index] || 0));
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

function applyColumnWidths(table: HTMLTableElement, widths: number[], actionColumns = new Set<number>()) {
  const columns = ensureColGroup(table, widths.length);
  columns.forEach((column, index) => {
    column.classList.toggle("app-table-action-column", actionColumns.has(index));
    column.style.width = `${Math.max(MIN_COLUMN_WIDTH, widths[index] || MIN_COLUMN_WIDTH)}px`;
  });
  const totalWidth = widths.reduce((sum, width) => sum + Math.max(MIN_COLUMN_WIDTH, width || MIN_COLUMN_WIDTH), 0);
  const parentWidth = table.parentElement?.clientWidth || 0;
  table.style.width = `${Math.max(totalWidth, parentWidth)}px`;
}

function getActionColumnWidths(table: HTMLTableElement, widths: number[], actionColumns: Set<number>) {
  const nextWidths = [...widths];
  const columns = ensureColGroup(table, widths.length);
  const ranges = [
    ...getCellRanges(table.tHead ? Array.from(table.tHead.rows) : [], widths.length),
    ...getCellRanges(getDirectTableRows(table), widths.length),
    ...getCellRanges(table.tFoot ? Array.from(table.tFoot.rows) : [], widths.length),
  ];
  actionColumns.forEach((index) => {
    let width = ACTION_COLUMN_MIN_WIDTH;
    const column = columns[index];
    const savedOrCurrentWidth = column?.style.width || "";
    if (column) column.style.width = `${ACTION_COLUMN_MIN_WIDTH}px`;
    // Force layout at the minimum width so an old saved width cannot influence
    // the intrinsic action-control measurement.
    void table.offsetWidth;
    ranges.forEach(({ cell, start, end }) => {
      if (index < start || index >= end || !cell.classList.contains("app-table-action-column")) return;
      width = Math.max(width, cell.scrollWidth + 24);
    });
    if (column) column.style.width = savedOrCurrentWidth;
    nextWidths[index] = width;
  });
  return nextWidths;
}

function tableKey(pathname: string, table: HTMLTableElement, index: number) {
  // QC View can have different visible columns per user. Its resize key must
  // remain stable so a width saved by one user is reused by every other user.
  if (pathname === "/quality/qc-view") {
    return encodeURIComponent(`${pathname}|qc-view|${index}`);
  }
  const headerRow = table.tHead?.rows[0];
  const headers = Array.from(headerRow?.cells || [])
    .map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim().toLowerCase())
    .join("|");
  return encodeURIComponent(`${pathname}|${headers || "no-header"}|${index}`);
}

function removeResizeHandles(table: HTMLTableElement) {
  table.querySelectorAll<HTMLElement>(".app-table-column-resizer").forEach((handle) => handle.remove());
  table.querySelectorAll<HTMLElement>(".app-resizable-header").forEach((header) => header.classList.remove("app-resizable-header"));
}

// Stable numbers for row elements, so "did the rows change?" is a cheap
// comparison of ids instead of reading every row's text.
const rowIds = new WeakMap<Element, number>();
let nextRowId = 1;
function rowIdentity(row: Element) {
  let id = rowIds.get(row);
  if (!id) {
    id = nextRowId++;
    rowIds.set(row, id);
  }
  return id;
}

function getDirectTableRows(table: HTMLTableElement) {
  return Array.from(table.tBodies).flatMap((tbody) => Array.from(tbody.rows))
    .filter((row) => row.closest("table") === table);
}

function getTableColumnCount(table: HTMLTableElement, rows: HTMLTableRowElement[]) {
  const headerRow = table.tHead?.rows[0];
  if (headerRow) return getColumnCount(headerRow);
  return rows.reduce((max, row) => Math.max(max, getColumnCount(row)), 0);
}

function isSpanningTableRow(row: HTMLTableRowElement, columnCount: number) {
  return row.cells.length === 1 && Math.max(1, row.cells[0].colSpan || 1) >= Math.max(1, columnCount);
}

function isExternallyPaginated(table: HTMLTableElement) {
  if (table.closest("[data-disable-table-pagination]")) return true;
  if (table.dataset[TABLE_PAGINATION_EXTERNAL] === "true") return true;

  let current: Element | null = table;
  for (let depth = 0; current && depth < 4; depth += 1) {
    let sibling = current.nextElementSibling;
    while (sibling) {
      if (sibling.matches(".app-table-pagination")) {
        sibling = sibling.nextElementSibling;
        continue;
      }
      if (
        sibling.matches("[data-table-pagination=external]") ||
        sibling.querySelector("[data-table-pagination=external]")
      ) return true;
      const text = sibling.textContent || "";
      if (/\b(showing|page)\b/i.test(text) && sibling.querySelector("button, select")) return true;
      sibling = sibling.nextElementSibling;
    }
    current = current.parentElement;
  }
  return false;
}

function setPaginationHidden(row: HTMLTableRowElement, hidden: boolean) {
  if (hidden) {
    row.dataset[TABLE_PAGINATION_HIDDEN] = "true";
    row.setAttribute("aria-hidden", "true");
  } else {
    delete row.dataset[TABLE_PAGINATION_HIDDEN];
    row.removeAttribute("aria-hidden");
  }
}

function createPaginationHost(table: HTMLTableElement, content: HTMLElement, key: string) {
  const scrollContainer = findScrollableAncestor(table, content);
  const parent = scrollContainer !== content && scrollContainer.parentElement
    ? scrollContainer.parentElement
    : table.parentElement || content;
  const host = document.createElement("div");
  host.className = "app-table-pagination";
  host.dataset.tablePaginationKey = key;
  host.setAttribute("role", "navigation");
  host.setAttribute("aria-label", "Table pagination");
  if (scrollContainer !== content && scrollContainer.parentElement === parent) {
    parent.insertBefore(host, scrollContainer.nextSibling);
  } else if (table.nextSibling) {
    parent.insertBefore(host, table.nextSibling);
  } else {
    parent.appendChild(host);
  }
  return host;
}

type TablePaginationController = {
  refresh: () => void;
};

const tablePaginationControllers = new WeakMap<HTMLTableElement, TablePaginationController>();

function enhanceTablePagination(table: HTMLTableElement, content: HTMLElement, pathname: string, index: number) {
  const existing = tablePaginationControllers.get(table);
  if (existing) {
    existing.refresh();
    return;
  }

  const key = tableKey(pathname, table, index);
  const host = createPaginationHost(table, content, key);
  let page = 1;
  let pageSize = TABLE_PAGE_SIZE;
  let rowSignature = "";

  const controller: TablePaginationController = {
    refresh: () => {
      const allRows = getDirectTableRows(table);
      const columnCount = getTableColumnCount(table, allRows);
      const dataRows = allRows.filter((row) => !isSpanningTableRow(row, columnCount));
      const staticRows = allRows.filter((row) => isSpanningTableRow(row, columnCount));

      if (isExternallyPaginated(table) || dataRows.length <= TABLE_PAGE_SIZE) {
        allRows.forEach((row) => setPaginationHidden(row, false));
        host.hidden = true;
        return;
      }

      // Row count + row element identities, plus the first and last row text
      // (catches rows reused with new content after a filter), instead of the
      // text of every row.
      const nextSignature = [
        dataRows.length,
        dataRows.map(rowIdentity).join(","),
        dataRows[0]?.textContent || "",
        dataRows[dataRows.length - 1]?.textContent || "",
      ].join("\u0001");
      if (nextSignature !== rowSignature) {
        rowSignature = nextSignature;
        page = 1;
      }

      const range = getTablePageRange(dataRows.length, page, pageSize);
      page = Math.min(Math.max(page, 1), range.totalPages);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      dataRows.forEach((row, rowIndex) => setPaginationHidden(row, rowIndex < startIndex || rowIndex >= endIndex));
      staticRows.forEach((row) => setPaginationHidden(row, false));
      host.hidden = false;
      // Rebuild the pager only when what it shows changed.
      const renderKey = `${dataRows.length}|${page}|${pageSize}`;
      if (host.dataset.renderKey === renderKey && host.childElementCount > 0) return;
      host.dataset.renderKey = renderKey;
      host.replaceChildren();

      const controls = document.createElement("div");
      controls.className = "app-table-pagination-controls";

      const label = document.createElement("label");
      label.className = "app-table-pagination-rows";
      // Rows-per-page selector only (no "Rows" caption).
      const select = document.createElement("select");
      select.setAttribute("aria-label", "Rows per page");
      TABLE_PAGE_SIZE_OPTIONS.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = String(option);
        optionElement.textContent = String(option);
        optionElement.selected = option === pageSize;
        select.appendChild(optionElement);
      });
      select.addEventListener("change", () => {
        pageSize = Number(select.value) || TABLE_PAGE_SIZE;
        page = 1;
        controller.refresh();
      });
      label.appendChild(select);

      const previous = document.createElement("button");
      previous.type = "button";
      previous.textContent = "\u2039";
      previous.setAttribute("aria-label", "Previous table page");
      previous.disabled = page <= 1;
      previous.addEventListener("click", () => {
        page -= 1;
        controller.refresh();
        scrollTableToTop(table, content);
      });

      const pageLabel = document.createElement("span");
      pageLabel.className = "app-table-pagination-page";
      pageLabel.textContent = `${page} / ${range.totalPages}`;

      const next = document.createElement("button");
      next.type = "button";
      next.textContent = "\u203A";
      next.setAttribute("aria-label", "Next table page");
      next.disabled = page >= range.totalPages;
      next.addEventListener("click", () => {
        page += 1;
        controller.refresh();
        scrollTableToTop(table, content);
      });

      const total = document.createElement("span");
      total.className = "app-table-pagination-total";
      total.title = "Total";
      total.textContent = String(dataRows.length);

      controls.append(total, label, previous, pageLabel, next);
      host.append(controls);
    },
  };

  tablePaginationControllers.set(table, controller);
  controller.refresh();
}

function scrollTableToTop(table: HTMLTableElement, content: HTMLElement) {
  const container = findScrollableAncestor(table, content);
  container.scrollTop = 0;
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

// Tables have no up/down scroll box of their own: boxes around a table that
// limit its height are freed so the page scrolls instead, and the table's box
// scrolls sideways. Tables inside pop-ups keep their own scrolling.
function freeTableHeight(table: HTMLTableElement, content: HTMLElement) {
  if (table.closest('[role="dialog"], .fixed')) return;
  let element = table.parentElement;
  let nearest = true;
  while (element && element !== content) {
    const style = window.getComputedStyle(element);
    const canScrollX = ["auto", "scroll", "overlay"].includes(style.overflowX);
    const canScrollY = ["auto", "scroll", "overlay"].includes(style.overflowY);
    if (canScrollY && (style.maxHeight !== "none" || element.scrollHeight > element.clientHeight + 2)) {
      if (element.dataset.tableFreeHeight !== "true") element.dataset.tableFreeHeight = "true";
    }
    if (nearest && (canScrollX || canScrollY)) {
      if (element.dataset.tableScrollX !== "true") element.dataset.tableScrollX = "true";
      nearest = false;
    }
    element = element.parentElement;
  }
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

function addResizeHandles(
  table: HTMLTableElement,
  pathname: string,
  index: number,
  sharedWidths: SharedTableWidths,
  canResize: boolean,
  onResize: (key: string, widths: number[]) => void,
) {
  table.classList.add("app-enhanced-table");

  const content = table.closest<HTMLElement>(".app-view-content");
  if (content) freeTableHeight(table, content);
  if (content) enhanceScrollContainer(findScrollableAncestor(table, content));
  if (content) enhanceTablePagination(table, content, pathname, index);

  const headerRow = getResizeHeaderRow(table);
  if (!headerRow || headerRow.cells.length === 0) return;
  const key = tableKey(pathname, table, index);
  table.dataset.tableResizeKey = key;
  const columnCount = getColumnCount(headerRow);

  // Same columns, same rows, same shared widths and permission as last time:
  // nothing to measure again (measuring forces a page layout).
  const enhanceSignature = [
    key,
    columnCount,
    canResize ? 1 : 0,
    JSON.stringify(sharedWidths[key] || null),
    getDirectTableRows(table).map(rowIdentity).join(","),
  ].join("\u0001");
  if (table.dataset.tableResizeReady === "true" && table.dataset.enhanceSignature === enhanceSignature) {
    if (canResize && !table.querySelector(".app-table-column-resizer")) {
      // Handles removed by a re-render: install them again with the current widths.
      const currentWidths = Array.from(table.querySelectorAll<HTMLTableColElement>("colgroup[data-resizable-columns] col"))
        .map((column) => Number.parseFloat(column.style.width) || MIN_COLUMN_WIDTH);
      installResizeHandles(table, headerRow, currentWidths, getActionColumnIndexes(table, columnCount), key, onResize);
    }
    return;
  }
  table.dataset.enhanceSignature = enhanceSignature;

  const actionColumns = getActionColumnIndexes(table, columnCount);
  markActionColumns(table, actionColumns, columnCount);

  if (table.dataset.tableResizeReady === "true") {
    const currentWidths = Array.from(table.querySelectorAll<HTMLTableColElement>("colgroup[data-resizable-columns] col"))
      .map((column) => Number.parseFloat(column.style.width) || MIN_COLUMN_WIDTH);
    applyColumnContentRules(table, columnCount, actionColumns);
    const widths = withColumnMinimums(table, getActionColumnWidths(
      table,
      getColumnWidths(table, headerRow, columnCount, sharedWidths).length >= columnCount
        ? getColumnWidths(table, headerRow, columnCount, sharedWidths)
        : currentWidths.slice(0, columnCount),
      actionColumns,
    ));
    if (widths.length >= columnCount) applyColumnWidths(table, widths, actionColumns);
    if (!canResize) removeResizeHandles(table);
    else if (!table.querySelector(".app-table-column-resizer")) {
      installResizeHandles(table, headerRow, widths, actionColumns, key, onResize);
    }
    return;
  }

  table.dataset.tableResizeReady = "true";

  applyColumnContentRules(table, columnCount, actionColumns);
  const widths = withColumnMinimums(table, getActionColumnWidths(table, getColumnWidths(table, headerRow, columnCount, sharedWidths), actionColumns));
  applyColumnWidths(table, widths, actionColumns);
  if (canResize) installResizeHandles(table, headerRow, widths, actionColumns, key, onResize);
}

function installResizeHandles(
  table: HTMLTableElement,
  headerRow: HTMLTableRowElement,
  widths: number[],
  actionColumns: Set<number>,
  key: string,
  onResize: (key: string, widths: number[]) => void,
) {
  let columnIndex = 0;
  Array.from(headerRow.cells).forEach((cell) => {
    const span = Math.max(1, cell.colSpan || 1);
    if (span !== 1) {
      columnIndex += span;
      return;
    }
    const currentColumn = columnIndex;
    if (actionColumns.has(currentColumn)) {
      columnIndex += 1;
      return;
    }
    cell.classList.add("app-resizable-header");
    const handle = document.createElement("span");
    handle.className = "app-table-column-resizer";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-label", `Resize ${cell.textContent?.trim() || "table"} column`);
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const activeWidths = Array.from(table.querySelectorAll<HTMLTableColElement>("colgroup[data-resizable-columns] col"))
        .map((column) => Number.parseFloat(column.style.width) || MIN_COLUMN_WIDTH);
      const startWidth = activeWidths[currentColumn] || widths[currentColumn] || Math.round(cell.getBoundingClientRect().width);
      const activeColumn = currentColumn;
      const move = (moveEvent: PointerEvent) => {
        // Not narrower than its content allows (one-line codes, whole header words).
        const minimum = Math.max(MIN_COLUMN_WIDTH, columnMinimums.get(table)?.[activeColumn] || 0);
        activeWidths[activeColumn] = Math.max(minimum, Math.round(startWidth + moveEvent.clientX - startX));
        applyColumnWidths(table, activeWidths, actionColumns);
      };
      const up = () => {
        saveWidths(key, activeWidths);
        onResize(key, activeWidths);
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

// Header row stays visible while the page scrolls: the table's header cells
// are moved down by the part of the table already scrolled past (inside the
// table's own sideways-scroll box, which does not scroll up/down).
function headerBackground(cell: HTMLElement) {
  let element: HTMLElement | null = cell;
  while (element && element.tagName !== "TABLE") {
    const color = window.getComputedStyle(element).backgroundColor;
    if (color && color !== "transparent" && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(color)) return color;
    element = element.parentElement;
  }
  return "#f1f5f9";
}

function updateStickyHeaders(content: HTMLElement) {
  const viewTop = content.getBoundingClientRect().top;
  content.querySelectorAll<HTMLTableElement>("table.app-enhanced-table").forEach((table) => {
    const head = table.tHead;
    if (!head || head.rows.length === 0 || table.closest('[role="dialog"], .fixed')) return;
    const tableRect = table.getBoundingClientRect();
    const headHeight = head.getBoundingClientRect().height;
    const offset = Math.round(Math.max(0, Math.min(viewTop - tableRect.top, tableRect.height - headHeight * 2)));
    const next = offset > 0 ? `${offset}px` : "0px";
    if (table.style.getPropertyValue("--app-thead-offset") === next) return;
    if (offset > 0 && !table.dataset.stickyHead) {
      const firstCell = head.querySelector<HTMLElement>("th, td");
      if (firstCell) table.style.setProperty("--app-thead-bg", headerBackground(firstCell));
      table.dataset.stickyHead = "true";
    }
    table.style.setProperty("--app-thead-offset", next);
    table.toggleAttribute("data-sticky-head-active", offset > 0);
  });
}

export function ResizableTables() {
  const location = useLocation();
  const { user } = useAuth();
  const [settings] = useData<Setting>("settings", []);
  const setting = settings[0];
  const sharedWidths = parseSharedTableWidths(setting?.tableColumnWidths);
  const resizeUsers = parseResizeUsers(setting?.tableColumnResizeUsers);
  const canResize = user?.role === "Admin" || resizeUsers.has(String(user?.id || ""));

  const saveSharedWidths = async (key: string, widths: number[]) => {
    if (!canResize) return;
    try {
      const response = await fetch("/api/table-column-widths", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDataAuthHeaders() },
        body: JSON.stringify({ key, widths }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      window.dispatchEvent(new Event("sync-data-settings"));
    } catch (error) {
      console.warn("Failed to publish shared table width:", error);
    }
  };

  useEffect(() => {
    const content = document.querySelector<HTMLElement>(".app-view-content");
    if (!content) return;

    const enhance = () => {
      const tables = Array.from(content.querySelectorAll<HTMLTableElement>("table"));
      tables.forEach((table, index) => addResizeHandles(table, location.pathname, index, sharedWidths, canResize, (key, widths) => { void saveSharedWidths(key, widths); }));
    };

    enhance();
    let stickyFrame: number | null = null;
    const onScroll = () => {
      if (stickyFrame !== null) return;
      stickyFrame = requestAnimationFrame(() => {
        stickyFrame = null;
        updateStickyHeaders(content);
      });
    };
    content.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Ignore DOM changes made by this enhancer itself. Otherwise pagination,
    // resize handles, and colgroups trigger enhance() again indefinitely.
    const isOwnNode = (node: Node | null) => {
      const element = node instanceof Element ? node : node?.parentElement;
      return Boolean(element?.closest(".app-table-pagination, .app-table-column-resizer, colgroup[data-resizable-columns]"));
    };
    const isOwnMutation = (record: MutationRecord) =>
      (record.type === "attributes" && isOwnNode(record.target)) ||
      (record.type === "childList" &&
      (isOwnNode(record.target) ||
        [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].every((node) =>
          node instanceof Element && (node.matches(".app-table-pagination, .app-table-column-resizer, colgroup[data-resizable-columns], col"))
        ) && record.addedNodes.length + record.removedNodes.length > 0));
    // Re-process at most once per ~150 ms, on an animation frame, instead of
    // after every single DOM change.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let frame: number | null = null;
    let lastRun = performance.now();
    const scheduleEnhance = () => {
      if (timer !== null || frame !== null) return;
      const wait = Math.max(0, 150 - (performance.now() - lastRun));
      timer = setTimeout(() => {
        timer = null;
        frame = requestAnimationFrame(() => {
          frame = null;
          lastRun = performance.now();
          enhance();
        });
      }, wait);
    };
    const observer = new MutationObserver((records) => {
      if (records.every(isOwnMutation)) return;
      scheduleEnhance();
    });
    observer.observe(content, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-table-pagination-external"],
    });
    return () => {
      observer.disconnect();
      content.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (stickyFrame !== null) cancelAnimationFrame(stickyFrame);
      if (timer !== null) clearTimeout(timer);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [canResize, location.pathname, setting?.tableColumnWidths]);

  return null;
}
