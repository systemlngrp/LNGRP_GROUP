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
  // A page can mark its filter box with data-mf-panel to fold it even though
  // the page also has a Save / Create button (e.g. Indents Not Ordered).
  if (content.querySelector("[data-mf-panel]")) return false;
  if (content.querySelector("form, textarea")) return true;
  // Buttons inside table rows (a row's own Update / Save) don't make a list
  // page an entry form.
  return Array.from(content.querySelectorAll("button")).some((button) =>
    !button.closest("table") && /^\s*(save|submit|update|post|create)\b/i.test(button.textContent || ""),
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
  const marked = start.closest<HTMLElement>("[data-mf-panel]");
  if (marked && content.contains(marked)) return marked;
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
  // Opt-in extra filters (toggle buttons, checkboxes) report their own state.
  if (unit.hasAttribute("data-mf-fold")) return unit.getAttribute("data-mf-active") === "true";
  if (unit.querySelector('[class*="singleValue"], [class*="multiValue"]')) return true;
  return visibleControls(unit).some((control) => {
    // A dropdown left on its first choice ("All", "Select…") is not a filter.
    if (control instanceof HTMLSelectElement) return control.selectedIndex > 0;
    const value = (control as HTMLInputElement).value;
    return typeof value === "string" && value.trim() !== "";
  });
}

const searchControls = new WeakMap<HTMLElement, HTMLElement | null>();
const CLEAR_BUTTON_TEXT = /^\s*(clear|reset)(\s+all)?(\s+filters?)?\s*$/i;
const FILTER_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z"/></svg>';

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
  // Pages can mark extra filter rows (buttons, checkboxes) to fold as well.
  panel.querySelectorAll<HTMLElement>("[data-mf-fold]").forEach((unit) => units.add(unit));
  if (units.size < 2) return false;
  panel.querySelectorAll<HTMLElement>("[data-mf-unit]").forEach((unit) => {
    if (!units.has(unit)) unit.removeAttribute("data-mf-unit");
  });
  units.forEach((unit) => unit.setAttribute("data-mf-unit", "true"));
  searchControls.set(panel, searchControl);
  return true;
}

// The box holding just the search input (and its magnifier icon), where the
// filter button can sit to the right of the input. Null when there is none.
function searchRowFor(panel: HTMLElement) {
  const control = searchControls.get(panel);
  const row = control?.parentElement;
  if (!control || !row || row === panel || row.tagName === "LABEL") return null;
  if (!panel.contains(row) || visibleControls(row).length !== 1) return null;
  const text = Array.from(row.childNodes)
    .filter((node) => !(node instanceof Element && node.classList.contains(OWN_CLASS)))
    .map((node) => node.textContent || "")
    .join("")
    .trim();
  return text ? null : row;
}

// The panels of the current page; the first one (leader) carries the single
// filter button, which folds and unfolds all of them together.
let pagePanels: HTMLElement[] = [];

function findButton(panel: HTMLElement) {
  return panel.querySelector<HTMLButtonElement>(`.${OWN_CLASS}`);
}

function applyPanelState(leader: HTMLElement) {
  const open = Boolean(panelOpen.get(leader));
  pagePanels.forEach((panel) => panel.setAttribute("data-mobile-filters", open ? "open" : "collapsed"));
  const active = pagePanels
    .flatMap((panel) => Array.from(panel.querySelectorAll<HTMLElement>("[data-mf-unit]")))
    .filter(unitIsActive).length;
  const searched = pagePanels.some((panel) => {
    const control = searchControls.get(panel) as HTMLInputElement | null | undefined;
    return Boolean(control && String(control.value || "").trim());
  });
  // Clear / Reset buttons appear only once something is searched or filtered.
  const anything = active > 0 || searched ? "true" : "false";
  pagePanels.forEach((panel) => {
    panel.setAttribute("data-mf-any", anything);
    panel.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      if (button.classList.contains(OWN_CLASS)) return;
      if (CLEAR_BUTTON_TEXT.test(button.textContent || "")) button.setAttribute("data-mf-clear", "true");
    });
  });
  const button = findButton(leader);
  if (!button) return;
  const iconOnly = button.hasAttribute("data-mf-icon");
  const label = `${open ? "Hide filters" : "Show filters"}${active ? ` (${active} active)` : ""}`;
  const key = `${iconOnly ? "i" : "b"}|${open ? 1 : 0}|${active}`;
  if (button.dataset.mfKey !== key) {
    button.dataset.mfKey = key;
    const badge = active ? `<span class="app-mobile-filter-badge">${active}</span>` : "";
    button.innerHTML = iconOnly
      ? `${FILTER_ICON}${badge}`
      : `${FILTER_ICON}<span>${open ? "Hide filters" : "Filters"}</span>${badge}`;
  }
  button.setAttribute("aria-label", label);
  button.title = label;
  button.setAttribute("aria-expanded", open ? "true" : "false");
}

function ensureButton(leader: HTMLElement) {
  const row = searchRowFor(leader);
  let button = findButton(leader);
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = OWN_CLASS;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      panelOpen.set(leader, !panelOpen.get(leader));
      applyPanelState(leader);
    });
  }
  leader.querySelectorAll("[data-mf-search-row]").forEach((element) => {
    if (element !== row) element.removeAttribute("data-mf-search-row");
  });
  if (row) {
    // Filter icon to the right of the search box.
    row.setAttribute("data-mf-search-row", "true");
    button.setAttribute("data-mf-icon", "true");
    if (button.parentElement !== row || button.nextSibling) row.appendChild(button);
  } else {
    // No plain search box: a Filters bar at the top of the box.
    button.removeAttribute("data-mf-icon");
    if (button.parentElement !== leader || leader.firstChild !== button) leader.insertBefore(button, leader.firstChild);
  }
}

function removeButton(panel: HTMLElement) {
  panel.querySelectorAll(`.${OWN_CLASS}`).forEach((button) => button.remove());
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
    if (!panel.hasAttribute("data-mobile-filters") && !panel.hasAttribute("data-mf-panel") && panel.getBoundingClientRect().height < 180) continue;
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
    panel.querySelectorAll("[data-mf-search-row]").forEach((element) => element.removeAttribute("data-mf-search-row"));
  });
  ensureButton(leader);
  // An "Apply" button inside the filters ([data-mf-apply]) closes the panel;
  // the filters themselves already took effect when they were picked.
  found.forEach((panel) => {
    panel.querySelectorAll<HTMLElement>("[data-mf-apply]").forEach((apply) => {
      if (applyWired.has(apply)) return;
      applyWired.add(apply);
      apply.addEventListener("click", () => {
        const current = pagePanels[0];
        if (!current) return;
        panelOpen.set(current, false);
        applyPanelState(current);
      });
    });
  });
  applyPanelState(leader);
}

const applyWired = new WeakSet<HTMLElement>();

function clearPanel(panel: HTMLElement) {
  panel.removeAttribute("data-mobile-filters");
  panel.removeAttribute("data-mf-follower");
  panel.removeAttribute("data-mf-any");
  panel.querySelectorAll("[data-mf-unit]").forEach((unit) => unit.removeAttribute("data-mf-unit"));
  panel.querySelectorAll("[data-mf-search-row]").forEach((element) => element.removeAttribute("data-mf-search-row"));
  panel.querySelectorAll("[data-mf-clear]").forEach((element) => element.removeAttribute("data-mf-clear"));
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
