// Phone top bar (screens up to 767 px): the page's own title line moves into
// the top bar, and a single "New …" button on that line becomes a + icon in
// the top bar that presses the page's own button. Desktop is not changed:
// the CSS that hides the moved elements sits inside a max-width media query.

import { ExportKind, markExportButtons, pageExportButtons } from "./exportButtons";

export type MobilePageHeader = {
  title: string;
  addButton: HTMLElement | null;
  addLabel: string;
  exports: { kind: ExportKind; button: HTMLElement }[];
};

const MOVED_TITLE = "data-mobile-title-moved";
const MOVED_ADD = "data-mobile-add-moved";
const MOVED_ROW = "data-mobile-title-row";
const MOVED_EXPORT = "data-mobile-export-moved";

function isVisible(element: Element) {
  return (element as HTMLElement).offsetParent !== null || element.getClientRects().length > 0;
}

// Visible text, or the tooltip of an icon-only button ("Add New").
function actionLabel(action: HTMLElement) {
  const text = (action.textContent || "").replace(/\s+/g, " ").trim();
  return text || action.getAttribute("aria-label") || action.getAttribute("title") || "";
}

export function clearMobilePageHeader(content: HTMLElement) {
  content.querySelectorAll(`[${MOVED_TITLE}], [${MOVED_ADD}], [${MOVED_ROW}], [${MOVED_EXPORT}]`).forEach((element) => {
    element.removeAttribute(MOVED_TITLE);
    element.removeAttribute(MOVED_ADD);
    element.removeAttribute(MOVED_ROW);
    element.removeAttribute(MOVED_EXPORT);
  });
}

function findPageTitle(content: HTMLElement) {
  const contentTop = content.getBoundingClientRect().top - content.scrollTop;
  const headings = Array.from(content.querySelectorAll<HTMLElement>("h1, h2")).filter(
    (heading) => !heading.closest('table, [role="dialog"], .fixed') && (heading.hasAttribute(MOVED_TITLE) || isVisible(heading)),
  );
  // The page title is the first heading, near the top of the page.
  const first = headings[0];
  if (!first) return null;
  if (!first.hasAttribute(MOVED_TITLE) && first.getBoundingClientRect().top - contentTop > 160) return null;
  return first;
}

// Page-level PDF / Excel buttons are shown as download icons in the top bar.
function readExports(content: HTMLElement) {
  markExportButtons(content);
  const buttons = pageExportButtons(content);
  content.querySelectorAll(`[${MOVED_EXPORT}]`).forEach((element) => {
    if (!buttons.includes(element as HTMLElement)) element.removeAttribute(MOVED_EXPORT);
  });
  buttons.forEach((button) => button.setAttribute(MOVED_EXPORT, "true"));
  // Refresh sits last, right next to the Back arrow.
  return buttons
    .map((button) => ({ kind: button.dataset.export as ExportKind, button }))
    .sort((a, b) => Number(a.kind === "refresh") - Number(b.kind === "refresh"));
}

export function readMobilePageHeader(content: HTMLElement): MobilePageHeader {
  const exports = readExports(content);
  const title = findPageTitle(content);
  const previous = content.querySelector(`[${MOVED_TITLE}]`);
  if (previous && previous !== title) clearMobilePageHeader(content);
  if (!title) return { title: "", addButton: null, addLabel: "", exports };

  const text = (title.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return { title: "", addButton: null, addLabel: "", exports };
  title.setAttribute(MOVED_TITLE, "true");

  const row = title.parentElement && title.parentElement !== content ? title.parentElement : null;
  let addButton: HTMLElement | null = null;
  if (row) {
    const adds = Array.from(row.querySelectorAll<HTMLElement>("button, a")).filter(
      (action) =>
        action.classList.contains("app-add-action") &&
        !(action as HTMLButtonElement).disabled &&
        /^\s*(\+\s*)?(new|add)\b/i.test(actionLabel(action)),
    );
    if (adds.length === 1) addButton = adds[0];
    row.querySelectorAll(`[${MOVED_ADD}]`).forEach((element) => {
      if (element !== addButton) element.removeAttribute(MOVED_ADD);
    });
    if (addButton) addButton.setAttribute(MOVED_ADD, "true");

    // Hide the whole line (and its divider) when nothing else is left on it.
    const others = Array.from(row.children).filter((child) => {
      if (child === title || child === addButton) return false;
      if (child.hasAttribute(MOVED_EXPORT)) return false;
      if (child.querySelector("button, a") && Array.from(child.querySelectorAll("button, a")).every((button) => button.hasAttribute(MOVED_EXPORT) || button === addButton)) return false;
      if (addButton && child.contains(addButton) && (child.textContent || "").trim() === (addButton.textContent || "").trim()) return false;
      if (addButton && child.contains(addButton) && child.querySelectorAll("button, a").length === 1) return false;
      return isVisible(child) && ((child.textContent || "").trim() !== "" || child.querySelector("button, a, input, select, svg"));
    });
    if (others.length === 0) row.setAttribute(MOVED_ROW, "true");
    else row.removeAttribute(MOVED_ROW);
  }
  const addLabel = addButton ? actionLabel(addButton).replace(/^\+\s*/, "").trim() : "";
  return { title: text, addButton, addLabel, exports };
}
