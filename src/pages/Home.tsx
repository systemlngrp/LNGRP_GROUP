import React, { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, LayoutDashboard } from "lucide-react";
import { NAVIGATION, type NavEntry, type NavGroup, type NavItem } from "../components/Sidebar";
import { useAuth } from "../auth/AuthContext";

/**
 * Light landing page: a clickable menu of sections. It loads no business data
 * (no pending counts); pages load their own data only when opened.
 */

const QUICK_ACCESS_SECTION = "Quick Access";
const HIDDEN_SECTIONS = new Set(["Documentation"]);

type FlatLink = NavItem & { subSection?: string };

function isSubGroup(entry: NavEntry): entry is { section: string; items: NavEntry[] } {
  return "items" in entry;
}

function flattenEntries(entries: NavEntry[], subSection?: string): FlatLink[] {
  return entries.flatMap((entry) =>
    isSubGroup(entry)
      ? flattenEntries(entry.items, entry.section)
      : [{ ...entry, subSection }]
  );
}

function sectionSlug(section: string) {
  return section.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function Home() {
  const { user, hasAccess } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSlug = searchParams.get("section") || "";

  const groups = useMemo(() => {
    return NAVIGATION.filter((group) => !HIDDEN_SECTIONS.has(group.section))
      .map((group: NavGroup) => {
        const links = flattenEntries(group.items).filter((link) => !link.disabled && hasAccess(link.href));
        return { ...group, slug: sectionSlug(group.section), links };
      })
      .filter((group) => group.links.length > 0);
  }, [hasAccess]);

  const quickAccess = groups.find((group) => group.section === QUICK_ACCESS_SECTION);
  const moduleGroups = groups.filter((group) => group.section !== QUICK_ACCESS_SECTION);
  const selectedGroup = moduleGroups.find((group) => group.slug === selectedSlug);

  if (selectedGroup) {
    const subSections = Array.from(
      selectedGroup.links.reduce((map, link) => {
        const key = link.subSection || selectedGroup.section;
        map.set(key, [...(map.get(key) || []), link]);
        return map;
      }, new Map<string, FlatLink[]>())
    );
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 border-b border-black pb-3">
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className="inline-flex items-center gap-1 rounded border-2 border-black bg-white px-3 py-1.5 text-xs font-black uppercase hover:bg-slate-100"
          >
            <ArrowLeft size={14} /> Home
          </button>
          <h2 className="text-xl font-black uppercase tracking-tight text-slate-950">{selectedGroup.section}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subSections.map(([subSection, links]) => (
            <div key={subSection} className="overflow-hidden rounded-xl border-2 border-slate-900 bg-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
              <div className={`${selectedGroup.color} px-4 py-2 text-xs font-black uppercase tracking-wide text-white`}>{subSection}</div>
              <ul className="divide-y divide-slate-200">
                {links.map((link) => {
                  const Icon = link.icon;
                  return (
                    <li key={link.href}>
                      <Link to={link.href} className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-indigo-50">
                        <Icon size={16} className="shrink-0 text-slate-500" />
                        <span className="flex-1">{link.name}</span>
                        <ChevronRight size={14} className="text-slate-400" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1 border-b border-black pb-3">
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-950 md:text-2xl">
          Welcome{user?.name ? `, ${user.name}` : ""}
        </h2>
        <p className="text-xs font-bold text-slate-600">Choose an area to start.</p>
      </div>

      {quickAccess ? (
        <div className="flex flex-wrap gap-2">
          {quickAccess.links.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-slate-900 bg-indigo-900 px-4 py-2.5 text-xs font-black uppercase text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] hover:bg-indigo-800"
            >
              <LayoutDashboard size={16} />
              {link.name}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {moduleGroups.map((group) => (
          <button
            key={group.slug}
            type="button"
            onClick={() => setSearchParams({ section: group.slug })}
            className="group flex flex-col overflow-hidden rounded-xl border-2 border-slate-900 bg-white text-left shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_rgba(15,23,42,1)]"
          >
            <div className={`${group.color} flex items-center justify-between px-4 py-4`}>
              <span className="text-base font-black uppercase tracking-tight text-white">{group.section}</span>
              <ChevronRight size={18} className="text-white/80" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
