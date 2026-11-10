import { NAVIGATION, NavEntry } from "../components/Sidebar";

// Table header colour per menu section (the section's menu colour). A page in
// several sections takes the first one it appears in (Quick Access ignored).
const SECTION_HEX: Record<string, string> = {
  "bg-red-700": "#b91c1c",
  "bg-orange-700": "#c2410c",
  "bg-teal-700": "#0f766e",
  "bg-amber-700": "#b45309",
  "bg-yellow-700": "#a16207",
  "bg-lime-700": "#4d7c0f",
  "bg-emerald-700": "#047857",
  "bg-cyan-700": "#0e7490",
  "bg-blue-700": "#1d4ed8",
  "bg-sky-700": "#0369a1",
  "bg-indigo-700": "#4338ca",
  "bg-indigo-900": "#312e81",
  "bg-fuchsia-800": "#86198f",
};

function collectHrefs(entries: NavEntry[], out: string[]) {
  entries.forEach((entry) => {
    if ("items" in entry) collectHrefs(entry.items, out);
    else if (entry.href) out.push(entry.href);
  });
  return out;
}

const SECTION_ROUTES = NAVIGATION.filter((group) => group.section !== "Quick Access").map((group) => ({
  color: SECTION_HEX[group.color || ""] || "",
  hrefs: collectHrefs(group.items, []),
}));

// Exact menu match first; otherwise the longest menu address the page sits
// under (e.g. /indent/view/123 -> Indent).
export function sectionColorForPath(pathname: string) {
  for (const section of SECTION_ROUTES) {
    if (section.color && section.hrefs.includes(pathname)) return section.color;
  }
  let best = { length: 0, color: "" };
  for (const section of SECTION_ROUTES) {
    if (!section.color) continue;
    for (const href of section.hrefs) {
      const base = href.split("/").slice(0, -1).join("/");
      const candidates = [href, base].filter((value) => value && value.length > 1);
      for (const candidate of candidates) {
        if (pathname.startsWith(`${candidate}/`) && candidate.length > best.length) best = { length: candidate.length, color: section.color };
      }
    }
  }
  return best.color;
}
