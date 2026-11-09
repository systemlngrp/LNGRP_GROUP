// Phone layout helper (screens up to 767 px wide). Desktop and tablet are not
// changed: every rule in index.css for these attributes sits inside a
// max-width media query, and the toggle button is hidden on wider screens.
//
// 1. Summary boxes (a row of small cards with a label and a figure) are shown
//    two per row and more compactly.
// 2. A list page's filter box keeps its Search field visible; the other
//    filters fold behind a "Filters (n)" button. Nothing is removed and no
//    filter behaves differently; only their arrangement on a phone changes.
//
// Only data-* attributes are set on the page's own elements (React leaves
// them alone), plus one button per filter box. Pages with a Save/Submit
// button (entry forms) are skipped, so entry forms are never folded.

export const MOBILE_QUERY = "(max-width: 767px)";
export const OWN_CLASS = "app-mobile-filter-toggle";
const CONTROL_SELECTOR =
  "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), select";
const panelOpen = new WeakMap<HTMLElement, boolean>();

function visibleControls(root: Element) {
  return Array.from(root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).filter(
    (control) => !control.closest(`.${OWN_CLASS}, .app-table-pagination, table`),
  );
}

function isEntryPage(content: HTMLElement) {
  if (content.querySelector("form, textarea")) return true;
  return Array.from(content.querySelectorAll("button")).some((button) =>
    /^\s*(save|submit|update|post|create)\b/i.test(button.textContent || ""),
  );
}

// --- Summary boxes -------------------------------------------------------

function isStatCard(element: Element) {
  if (element.querySelector("input, select, textarea, table, svg.lucide-chevron-right")) return false;
  const text = (element.textContent || "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 70 || !/\d/.test(text)) return false;
  return element.childElementCount >= 2 || element.querySelectorAll("div, span, p").length >= 2;
}

function markStatGroups(content: HTMLElement) {
  content.querySelectorAll<HTMLElement>("[data-mobile-stats]").forEach((group) => {
    const cards = Array.from(group.children);
    if (cards.length < 2 || !cards.every(isStatCard)) group.removeAttribute("data-mobile-stats");
  });
  content.querySelectorAll<HTMLElement>("div.grid, div.flex").forEach((group) => {
    if (group.hasAttribute("data-mobile-stats") || group.closest("table")) return;
    const cards = Array.from(group.children);
    if (cards.length < 2 || cards.length > 8) return;
    if (!cards.every(isStatCard)) return;
    group.setAttribute("data-mobile-stats", "true");
  });
}

// --- Filter boxes --------------------------------------------------------

function isSearchControl(control: HTMLElement) {
  const placeholder = control.getAttribute("placeholder") || "";
  if (/^\s*search/i.test(placeholder)) return true;
  const label = control.closest("label");
  return Boolean(label && /^\s*search\b/i.test((label.textContent || "").trim()));
}

function findFilterPanel(content: HTMLElement, start: HTMLElement) {
  let panel: HTMLElement = start;
  for (let guard = 0; guard < 12; guard += 1) {
    const parent: HTMLElement | null = panel.parentElement;
    if (!parent || parent === content || !content.contains(parent)) break;
    if (parent.querySelector("table, h1, h2, h3, [data-mobile-stats]")) break;
    panel = parent;
  }
  return panel;
}

function controlUnit(panel: HTMLElement, control: HTMLElement) {
  let unit: HTMLElement = control;
  for (let guard = 0; guard < 10; guard += 1) {
    const parent: HTMLElement | null = unit.parentElement;
    if (!parent || parent === panel) break;
    if (visibleControls(parent).length > 1) break;
    unit = parent;
  }
  return unit;
}

function unitIsActive(unit: HTMLElement) {
  if (unit.querySelector('[class*="singleValue"], [class*="multiValue"]')) return true;
  return visibleControls(unit).some((control) => {
    // A dropdown left on its first choice ("All", "Select…") is not a filter.
    if (control instanceof HTMLSelectElement) return control.selectedIndex > 0;
    const value = (control as HTMLInputElement).value;
    return typeof value === "string" && value.trim() !== "";
  });
}

// Marks the filters of one box to fold; false when it has too few.
function markPanelUnits(panel: HTMLElement, controls: HTMLElement[]) {
  const searchControl = controls.find(isSearchControl) || null;
  const units = new Set<HTMLElement>();
  let searchUnit: HTMLElement | null = null;
  controls.forEach((control) => {
    const unit = controlUnit(panel, control);
    if (control === searchControl) searchUnit = unit;
    else units.add(unit);
  });
  if (searchUnit) units.delete(searchUnit);
  if (units.size < 2) return false;
  panel.querySelectorAll<HTMLElement>("[data-mf-unit]").forEach((unit) => {
    if (!units.has(unit)) unit.removeAttribute("data-mf-unit");
  });
  units.forEach((unit) => unit.setAttribute("data-mf-unit", "true"));
  return true;
}

// The panels of the current page; the first one (leader) carries the single
// Filters button, which folds and unfolds all of them together.
let pagePanels: HTMLElement[] = [];

function applyPanelState(leader: HTMLElement) {
  const open = Boolean(panelOpen.get(leader));
  pagePanels.forEach((panel) => panel.setAttribute("data-mobile-filters", open ? "open" : "collapsed"));
  const button = Array.from(leader.children).find((child) => child.classList.contains(OWN_CLASS)) as HTMLButtonElement | undefined;
  if (!button) return;
  const active = pagePanels
    .flatMap((panel) => Array.from(panel.querySelectorAll<HTMLElement>("[data-mf-unit]")))
    .filter(unitIsActive).length;
  const text = `${open ? "Hide filters" : "Filters"}${active ? ` (${active} active)` : ""} ${open ? "\u25B2" : "\u25BC"}`;
  if (button.textContent !== text) button.textContent = text;
  button.setAttribute("aria-expanded", open ? "true" : "false");
}

function ensureButton(leader: HTMLElement) {
  if (Array.from(leader.children).some((child) => child.classList.contains(OWN_CLASS))) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = OWN_CLASS;
  button.addEventListener("click", () => {
    panelOpen.set(leader, !panelOpen.get(leader));
    applyPanelState(leader);
  });
  leader.insertBefore(button, leader.firstChild);
}

function removeButton(panel: HTMLElement) {
  Array.from(panel.children).forEach((child) => {
    if (child.classList.contains(OWN_CLASS)) child.remove();
  });
}

function markFilterPanels(content: HTMLElement) {
  if (!content.querySelector("table") || isEntryPage(content)) {
    clearFilterPanels(content);
    return;
  }
  const found: HTMLElement[] = [];
  const tables = Array.from(content.querySelectorAll("table"));
  const controls = visibleControls(content).filter((control) => !control.closest('[role="dialog"], .fixed'));
  for (const control of controls) {
    if (found.some((panel) => panel.contains(control))) continue;
    const panel = findFilterPanel(content, control);
    const panelControls = visibleControls(panel);
    if (panelControls.length < 3) continue;
    // Fold only boxes that take real space on a phone; a one-line search bar
    // is left as it is.
    if (!panel.hasAttribute("data-mobile-filters") && panel.getBoundingClientRect().height < 180) continue;
    // Only a box that comes before a table (a list page's filters).
    if (!tables.some((table) => panel.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    if (markPanelUnits(panel, panelControls)) found.push(panel);
  }
  content.querySelectorAll<HTMLElement>("[data-mobile-filters]").forEach((panel) => {
    if (!found.includes(panel)) clearPanel(panel);
  });
  pagePanels = found;
  if (!found.length) return;
  const [leader, ...followers] = found;
  leader.removeAttribute("data-mf-follower");
  followers.forEach((panel) => {
    panel.setAttribute("data-mf-follower", "true");
    removeButton(panel);
  });
  ensureButton(leader);
  applyPanelState(leader);
}

function clearPanel(panel: HTMLElement) {
  panel.removeAttribute("data-mobile-filters");
  panel.removeAttribute("data-mf-follower");
  panel.querySelectorAll("[data-mf-unit]").forEach((unit) => unit.removeAttribute("data-mf-unit"));
  removeButton(panel);
}

export function clearFilterPanels(content: HTMLElement) {
  content.querySelectorAll<HTMLElement>("[data-mobile-filters]").forEach(clearPanel);
  pagePanels = [];
}

export function enhanceMobileLayout(content: HTMLElement) {
  markStatGroups(content);
  markFilterPanels(content);
}
